/**
 * Fetches and verifies every raw data source into `.cache/sources/`.
 *
 * Sources (all free, no API keys):
 * - QUL-derived Madinah mushaf layout (ahmad-anbarje/Quran-On-Web), pinned
 *   to a commit and a content hash — the print truth for pages/lines/slots
 * - Quran.com v4 API — verses, words, glyph codes, metadata (604 page files)
 * - Quran.com v4 API — chapter metadata (114 surahs)
 * - mustafa0x/qpc-fonts — KFGQPC QCF v1 page fonts (604), basmalah font,
 *   and `mushaf.txt` (the per-ayah glyph table used as an independent
 *   cross-check source)
 * - static.qurancdn.com — UthmanicHafs Unicode fallback font
 *
 * Idempotent: every file is hashed; matching files are not re-downloaded.
 * Run with:  node scripts/fetch-sources.ts
 */
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import pLimit from "p-limit"

import {
  apiChaptersResponseSchema,
  apiVersePageResponseSchema,
  mushafLayoutFileSchema,
} from "../src/lib/domain/schemas.ts"

const ROOT = path.resolve(import.meta.dirname, "..")
const CACHE = path.join(ROOT, ".cache", "sources")

const API_BASE = "https://api.quran.com/api/v4"
const FONTS_BASE = "https://raw.githubusercontent.com/mustafa0x/qpc-fonts/master/mushaf-woff2"
const FONT_TABLE_URL = "https://raw.githubusercontent.com/mustafa0x/qpc-fonts/master/mushaf.txt"
const UTHMANIC_HAFS_URL =
  "https://static.qurancdn.com/fonts/quran/hafs/uthmanic_hafs/UthmanicHafs1Ver18.woff2"

/**
 * The QUL-derived Madinah mushaf layout: 604 pages × 15 line items with the
 * KFGQPC QCF v1 slot glyphs exactly as printed. Pinned to a commit so the
 * layout can never drift silently; the content hash must also match.
 */
const MUSHAF_LAYOUT_URL =
  "https://raw.githubusercontent.com/ahmad-anbarje/Quran-On-Web/aeeaea044fd5e1610ce6b4ba4c3cb4f8dc660986/public/data/mushaf.json"
const MUSHAF_LAYOUT_SHA256 = "951a18ed0fa2ee5809908030cf4041bdb56421860df2322fc0586dae32558b52"

const RETRIES = 3
const REQUEST_TIMEOUT_MS = 30_000

interface ManifestEntry {
  file: string
  url: string
  sha256: string
  bytes: number
}

/* ------------------------------------------------------------------ */
/* Small fetch layer with retries (pipeline-only infrastructure)       */
/* ------------------------------------------------------------------ */

async function fetchBuffer(url: string): Promise<Buffer> {
  let lastError: unknown
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`)
      }
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
    }
  }
  throw new Error(`Failed after ${RETRIES} attempts: ${url}`, { cause: lastError })
}

const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex")

/* ------------------------------------------------------------------ */
/* Cached download with content-hash verification                      */
/* ------------------------------------------------------------------ */

async function cachedDownload(
  file: string,
  url: string,
  manifest: Map<string, ManifestEntry>,
  verify: (buffer: Buffer) => void,
): Promise<void> {
  const target = path.join(CACHE, file)
  const existing = manifest.get(file)
  try {
    const current = await readFile(target)
    if (existing && existing.sha256 === sha256(current) && existing.url === url) {
      verify(current)
      return // already present and intact
    }
  } catch {
    // not cached yet — fall through to download
  }

  const buffer = await fetchBuffer(url)
  verify(buffer)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, buffer)
  manifest.set(file, { file, url, sha256: sha256(buffer), bytes: buffer.length })
}

/* ------------------------------------------------------------------ */
/* Content verifiers                                                   */
/* ------------------------------------------------------------------ */

const woff2 = (buffer: Buffer): void => {
  if (buffer.subarray(0, 4).toString("ascii") !== "wOF2") {
    throw new Error("not a WOFF2 file")
  }
}

const glyphTable = (buffer: Buffer): void => {
  const lines = buffer.toString("utf8").trim().split(/\r?\n/)
  if (lines.length !== 6236) {
    throw new Error(`glyph table has ${lines.length} lines, expected 6236`)
  }
  for (const line of lines) {
    const match = /^(\d{1,3}),/.exec(line)
    if (!match) throw new Error(`malformed glyph table line: ${line.slice(0, 30)}`)
  }
}

const json =
  <S extends { safeParse: (data: unknown) => { success: boolean; error?: unknown } }>(schema: S) =>
  (buffer: Buffer): void => {
    const result = schema.safeParse(JSON.parse(buffer.toString("utf8")))
    if (!result.success) {
      throw new Error(
        `schema validation failed: ${JSON.stringify(result.error, null, 2).slice(0, 600)}`,
      )
    }
  }

/** Requires the content to hash to an exact pinned digest. */
const pinnedSha256 =
  (expected: string) =>
  (buffer: Buffer): void => {
    const actual = sha256(buffer)
    if (actual !== expected) {
      throw new Error(
        `content hash drift: expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…`,
      )
    }
  }

const allOf =
  (...verifiers: ((buffer: Buffer) => void)[]) =>
  (buffer: Buffer): void => {
    for (const verify of verifiers) verify(buffer)
  }

/* ------------------------------------------------------------------ */
/* Download plan                                                       */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  await mkdir(CACHE, { recursive: true })
  const manifestPath = path.join(CACHE, "manifest.json")
  const manifest = new Map<string, ManifestEntry>()
  try {
    for (const entry of JSON.parse(await readFile(manifestPath, "utf8")) as ManifestEntry[]) {
      manifest.set(entry.file, entry)
    }
  } catch {
    // first run — no manifest yet
  }

  const limit = pLimit(6)
  let downloaded = 0

  const jobs: Promise<void>[] = []

  // 114 surah metadata
  jobs.push(
    limit(async () => {
      const before = manifest.size
      await cachedDownload(
        "chapters.json",
        `${API_BASE}/chapters?language=en`,
        manifest,
        json(apiChaptersResponseSchema),
      )
      if (manifest.size > before) downloaded++
    }),
  )

  // 604 page verse files (verses that start on each page, with words)
  for (let page = 1; page <= 604; page++) {
    jobs.push(
      limit(async () => {
        const before = manifest.size
        await cachedDownload(
          path.join("verses", `p${String(page).padStart(3, "0")}.json`),
          `${API_BASE}/verses/by_page/${page}?words=true&word_fields=code_v1,line_number,page_number&fields=text_uthmani`,
          manifest,
          json(apiVersePageResponseSchema),
        )
        if (manifest.size > before) downloaded++
      }),
    )
  }

  // QUL-derived mushaf layout (print truth), pinned to commit + content hash
  jobs.push(
    limit(async () => {
      const before = manifest.size
      await cachedDownload(
        "mushaf-layout.json",
        MUSHAF_LAYOUT_URL,
        manifest,
        allOf(json(mushafLayoutFileSchema), pinnedSha256(MUSHAF_LAYOUT_SHA256)),
      )
      if (manifest.size > before) downloaded++
    }),
  )

  // Independent glyph cross-check table
  jobs.push(
    limit(async () => {
      const before = manifest.size
      await cachedDownload("mushaf.txt", FONT_TABLE_URL, manifest, glyphTable)
      if (manifest.size > before) downloaded++
    }),
  )

  // Fonts: 604 page fonts + basmalah + Unicode fallback
  const fontJobs: Promise<void>[] = []
  for (let page = 1; page <= 604; page++) {
    const id = String(page).padStart(3, "0")
    fontJobs.push(
      limit(async () => {
        const before = manifest.size
        await cachedDownload(
          path.join("fonts", `QCF_P${id}.woff2`),
          `${FONTS_BASE}/QCF_P${id}.woff2`,
          manifest,
          woff2,
        )
        if (manifest.size > before) downloaded++
      }),
    )
  }
  fontJobs.push(
    limit(async () => {
      const before = manifest.size
      await cachedDownload(
        path.join("fonts", "QCF_BSML.woff2"),
        `${FONTS_BASE}/QCF_BSML.woff2`,
        manifest,
        woff2,
      )
      if (manifest.size > before) downloaded++
    }),
  )
  fontJobs.push(
    limit(async () => {
      const before = manifest.size
      await cachedDownload(
        path.join("fonts", "uthmanic-hafs.woff2"),
        UTHMANIC_HAFS_URL,
        manifest,
        woff2,
      )
      if (manifest.size > before) downloaded++
    }),
  )

  await Promise.all([...jobs, ...fontJobs])

  const entries = [...manifest.values()]
  await writeFile(manifestPath, JSON.stringify(entries, null, 2))

  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0)
  console.log(
    `sources ready: ${entries.length} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB), ${downloaded} newly downloaded`,
  )
}

await main()

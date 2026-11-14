/**
 * Builds the app-consumed Quran data files from the fetched sources.
 *
 * Data model (established during pipeline bring-up):
 *  - The QUL-derived mushaf layout is the print truth: 604 pages, each a
 *    strict sequence of line items (ayah word lines, surah header bands,
 *    basmalah lines) carrying QCF v1 glyph slots exactly as printed.
 *  - A layout-driven walk (`scripts/lib/walk.ts`) assigns every slot to its
 *    ayah against the per-ayah reference streams of `mushaf.txt`. Three
 *    documented reference defects are tolerated (ledger below).
 *  - Verse metadata (names, juz, hizb, ruku, manzil, sajdah, Uthmani text)
 *    comes from the Quran.com v4 API. Pages come from the walk, i.e. from
 *    the print — the API's own page numbers disagree with the print on 57
 *    ayahs and are never used for rendering.
 *
 * Cross-checks before anything is written; each runs against a fixed
 * documented ledger, and anything beyond it fails the build:
 *  1. layout glyph stream ≡ reference streams
 *  2. API glyph streams ≡ reference streams (space-stripped)
 *  3. reference page column ≡ API page_number
 *  4. layout-derived start pages vs reference page column (known ±1 drift)
 *  5. verse keys strictly consecutive (1:1 .. 114:6)
 *  6. 114 surah headers, 112 basmalahs, 18 headers on the page before
 *     their surah's first ayah (page-top starts)
 *  7. chunk structure: 15 lines per page (8 on pages 1–2), one end slot
 *     per ayah, monotonic start pages
 *
 * Outputs:
 *  - public/data/surahs.json      (114 surah summaries, print pages)
 *  - public/data/ayahs.json       (6236 ayah metadata rows, print pages)
 *  - public/data/pages/pNNN.json  (604 page layout chunks)
 *  - public/fonts/…               (604 QCF page fonts + basmalah + fallback)
 *
 * Run with:  node scripts/build-data.ts
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  type ApiChapter,
  type ApiVerse,
  type AyahMeta,
  apiChaptersResponseSchema,
  apiVersePageResponseSchema,
  ayahsFileSchema,
  type MushafLayoutFile,
  mushafLayoutFileSchema,
  mushafMetaSchema,
  type PageChunk,
  pageChunkSchema,
  parseVerseKey,
  type SurahSummary,
  surahsFileSchema,
} from "../src/lib/domain/schemas.ts"
import {
  buildPageChunk,
  flattenLayout,
  type MushafLayout,
  SHORT_LINES_PAGES,
} from "./lib/layout.ts"
import { type WalkResult, walkSlots } from "./lib/walk.ts"

const ROOT = path.resolve(import.meta.dirname, "..")
const CACHE = path.join(ROOT, ".cache", "sources")
const OUT_DATA = path.join(ROOT, "public", "data")
const OUT_PAGES = path.join(OUT_DATA, "pages")
const OUT_FONTS = path.join(ROOT, "public", "fonts")

export interface Sources {
  chapters: ApiChapter[]
  /** All 6236 verses in reading order. */
  verses: ApiVerse[]
  /** `mushaf.txt` rows: { page, glyphs } per ayah, reading order. */
  glyphTable: { page: number; glyphs: string }[]
  /** The QUL-derived mushaf layout file (print truth). */
  layout: MushafLayoutFile
}

/* ------------------------------------------------------------------ */
/* Source loading                                                      */
/* ------------------------------------------------------------------ */

export function parseGlyphTable(text: string): { page: number; glyphs: string }[] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const comma = line.indexOf(",")
      if (comma < 1) throw new Error(`malformed glyph table line: ${line.slice(0, 40)}`)
      return {
        page: Number(line.slice(0, comma)),
        glyphs: line.slice(comma + 1).replaceAll(" ", ""),
      }
    })
}

export async function loadSources(): Promise<Sources> {
  const chapters = apiChaptersResponseSchema.parse(
    JSON.parse(await readFile(path.join(CACHE, "chapters.json"), "utf8")),
  ).chapters

  const verses: ApiVerse[] = []
  for (let page = 1; page <= 604; page++) {
    const file = path.join(CACHE, "verses", `p${String(page).padStart(3, "0")}.json`)
    const response = apiVersePageResponseSchema.parse(JSON.parse(await readFile(file, "utf8")))
    verses.push(...response.verses)
  }

  const glyphTable = parseGlyphTable(await readFile(path.join(CACHE, "mushaf.txt"), "utf8"))
  const layout = mushafLayoutFileSchema.parse(
    JSON.parse(await readFile(path.join(CACHE, "mushaf-layout.json"), "utf8")),
  )

  return { chapters, verses, glyphTable, layout }
}

/** Verse keys ("2:255") for every 0-based global ayah index. */
export function ayahKeysOf(chapters: ApiChapter[]): string[] {
  const keys: string[] = []
  for (const chapter of chapters) {
    for (let ayah = 1; ayah <= chapter.verses_count; ayah++) keys.push(`${chapter.id}:${ayah}`)
  }
  return keys
}

/** 0-based global ayah index of a surah + ayah reference. */
export function ayahIndexOf(chapters: ApiChapter[], surah: number, ayah: number): number {
  let index = 0
  for (const chapter of chapters) {
    if (chapter.id >= surah) break
    index += chapter.verses_count
  }
  return index + ayah - 1
}

/* ------------------------------------------------------------------ */
/* Documented anomaly ledgers                                          */
/* ------------------------------------------------------------------ */

/**
 * Reference-stream defects tolerated by the layout walk, keyed
 * `kind:ayah` (1-based ayah index). If the walk ever reports something
 * outside this ledger the build fails; investigate the new anomaly and
 * either fix the source or add it here deliberately.
 */
const DOCUMENTED_STREAM_ANOMALIES: ReadonlySet<string> = new Set([
  "reference-extra:86", // 2:79 — table doubles a glyph inside the ayah
  "substitution:5313", // 68:42 — table's final char is a corrupt non-glyph
  "reference-extra:5331", // 69:8 — table carries a trailing extra glyph
])

/** Ayahs where the API glyph stream differs from the reference table. */
const DOCUMENTED_TABLE_GLYPH_DIFFS: ReadonlySet<string> = new Set(["2:79", "68:42", "69:8"])

/** Ayahs where the table's page column differs from the API page number. */
const DOCUMENTED_TABLE_PAGE_DIFFS: ReadonlySet<string> = new Set(["83:35"])

/** Layout-derived start pages disagreeing with the reference page column. */
const DOCUMENTED_START_PAGE_DIFF_COUNT = 57

/** Surah headers printed on the page before their surah's first ayah. */
const DOCUMENTED_SHIFTED_HEADERS = 18

/* ------------------------------------------------------------------ */
/* Cross-checks                                                        */
/* ------------------------------------------------------------------ */

export interface CheckResult {
  name: string
  failures: string[]
}

/** Verse keys must run consecutively 1:1 .. 114:last. */
export function checkVerseContinuity(sources: Sources): CheckResult {
  const failures: string[] = []
  let previous: ApiVerse | undefined
  for (const verse of sources.verses) {
    const parsed = parseVerseKey(verse.verse_key)
    if (!parsed) {
      failures.push(`malformed verse key: ${verse.verse_key}`)
      continue
    }
    const [surah, ayah] = parsed
    if (verse.verse_number !== ayah) {
      failures.push(`${verse.verse_key}: verse_number ${verse.verse_number} disagrees with key`)
    }
    if (previous) {
      const previousKey = parseVerseKey(previous.verse_key)
      const consecutive =
        previousKey !== null &&
        ((surah === previousKey[0] && ayah === previousKey[1] + 1) ||
          (surah === previousKey[0] + 1 && ayah === 1))
      if (!consecutive) {
        failures.push(`${previous.verse_key} -> ${verse.verse_key} is not consecutive`)
      }
    }
    previous = verse
  }
  return { name: "verse continuity", failures }
}

/**
 * API glyph streams and pages against the independent reference table.
 * Documented diffs are subtracted in both directions (ledger bijection).
 */
export function checkGlyphTable(sources: Sources): CheckResult {
  const failures: string[] = []
  if (sources.verses.length !== sources.glyphTable.length) {
    failures.push(`verse count ${sources.verses.length} != glyph rows ${sources.glyphTable.length}`)
    return { name: "glyph table", failures }
  }

  const glyphDiffs = new Set<string>()
  const pageDiffs = new Set<string>()
  for (let index = 0; index < sources.verses.length; index++) {
    const verse = sources.verses[index]
    const row = sources.glyphTable[index]
    if (verse === undefined || row === undefined) {
      failures.push(`index ${index}: missing ${verse === undefined ? "verse" : "table row"}`)
      continue
    }
    const apiGlyphs = verse.words
      .map((word) => word.code_v1)
      .join("")
      .replaceAll(" ", "")
    if (apiGlyphs !== row.glyphs) glyphDiffs.add(verse.verse_key)
    if (verse.page_number !== row.page) pageDiffs.add(verse.verse_key)
  }

  const audit = (observed: Set<string>, documented: ReadonlySet<string>, what: string): void => {
    for (const key of observed) {
      if (!documented.has(key)) failures.push(`${what}: undocumented diff at ${key}`)
    }
    for (const key of documented) {
      if (!observed.has(key)) failures.push(`${what}: documented diff at ${key} did not occur`)
    }
  }
  audit(glyphDiffs, DOCUMENTED_TABLE_GLYPH_DIFFS, "API vs table glyphs")
  audit(pageDiffs, DOCUMENTED_TABLE_PAGE_DIFFS, "API vs table pages")

  if (failures.length === 0) {
    console.log(
      `glyph table check: streams equal for ${sources.verses.length - glyphDiffs.size} ayahs ` +
        `(${[...glyphDiffs].join(", ")} documented), pages equal except ${[...pageDiffs].join(", ")} ✓`,
    )
  }
  return { name: "glyph table", failures }
}

/** The layout walk against its documented anomaly ledger and invariants. */
export function checkLayoutWalk(walk: WalkResult, ayahKeys: string[]): CheckResult {
  const failures: string[] = []

  const observed = new Set(walk.anomalies.map((anomaly) => `${anomaly.kind}:${anomaly.ayah}`))
  for (const anomaly of walk.anomalies) {
    const key = `${anomaly.kind}:${anomaly.ayah}`
    if (!DOCUMENTED_STREAM_ANOMALIES.has(key)) {
      failures.push(`undocumented stream anomaly ${key} on p${anomaly.page}: ${anomaly.detail}`)
    }
  }
  for (const key of DOCUMENTED_STREAM_ANOMALIES) {
    if (!observed.has(key)) failures.push(`documented stream anomaly ${key} did not occur`)
  }

  const covered = new Set(walk.slotAyah)
  if (covered.size !== ayahKeys.length) {
    failures.push(`walk covered ${covered.size} of ${ayahKeys.length} ayahs`)
  }

  let previousPage = 0
  walk.ayahStartPage.forEach((page, index) => {
    if (page === 0) failures.push(`${ayahKeys[index]}: no layout glyph ever matched`)
    if (page < previousPage) {
      failures.push(`${ayahKeys[index]}: start page ${page} goes backwards`)
    }
    previousPage = page
  })
  walk.ayahEndPage.forEach((page, index) => {
    if (page === 0) failures.push(`${ayahKeys[index]}: no end slot found`)
  })

  const endSlots = walk.slotEnd.filter(Boolean).length
  if (endSlots !== ayahKeys.length) {
    failures.push(`${endSlots} end slots, expected ${ayahKeys.length}`)
  }

  return { name: "layout walk", failures }
}

/**
 * Layout-derived start pages against the reference page column. The two
 * sources disagree on exactly DOCUMENTED_START_PAGE_DIFF_COUNT ayahs, each
 * by exactly one page; the layout (print truth) wins.
 */
export function checkStartPages(
  walk: WalkResult,
  sources: Sources,
  ayahKeys: string[],
): CheckResult {
  const failures: string[] = []
  const diffs: { key: string; layout: number; reference: number }[] = []
  for (let index = 0; index < ayahKeys.length; index++) {
    const layout = walk.ayahStartPage[index]
    const reference = sources.glyphTable[index]?.page
    const key = ayahKeys[index]
    if (layout === undefined || reference === undefined || key === undefined) {
      failures.push(`index ${index}: missing walk page, table row or verse key`)
      continue
    }
    if (layout !== reference) diffs.push({ key, layout, reference })
  }
  if (diffs.length !== DOCUMENTED_START_PAGE_DIFF_COUNT) {
    failures.push(
      `${diffs.length} start-page diffs vs the reference table, expected ${DOCUMENTED_START_PAGE_DIFF_COUNT}`,
    )
  }
  for (const diff of diffs) {
    if (Math.abs(diff.layout - diff.reference) !== 1) {
      failures.push(
        `${diff.key}: layout page ${diff.layout} vs reference page ${diff.reference} — not the documented ±1 drift`,
      )
    }
  }
  return { name: "start pages", failures }
}

/**
 * Surah header/basmalah structure of the layout: one header per surah in
 * order, one basmalah per surah except 1 and 9, and exactly the documented
 * number of headers printed on the page before their surah's first ayah
 * (always on that page's last line).
 */
export function checkSurahHeaders(
  layout: MushafLayout,
  walk: WalkResult,
  sources: Sources,
): CheckResult {
  const failures: string[] = []

  const headers: { page: number; line: number; surah: number }[] = []
  let basmalahCount = 0
  for (const layoutPage of layout.pages) {
    for (const layoutLine of layoutPage.lines) {
      if (layoutLine.kind === "surah") {
        headers.push({ page: layoutPage.page, line: layoutLine.line, surah: layoutLine.surah })
      } else if (layoutLine.kind === "basmalah") {
        basmalahCount++
      }
    }
  }

  if (headers.length !== 114) failures.push(`${headers.length} surah headers, expected 114`)
  headers.forEach((header, index) => {
    if (header.surah !== index + 1) {
      failures.push(`header ${index + 1} belongs to surah ${header.surah}`)
    }
  })
  if (basmalahCount !== 112) failures.push(`${basmalahCount} basmalah lines, expected 112`)

  let shifted = 0
  for (const header of headers) {
    const firstAyahPage = walk.ayahStartPage[ayahIndexOf(sources.chapters, header.surah, 1)]
    if (firstAyahPage === undefined || firstAyahPage === 0) {
      failures.push(`s${header.surah}: first ayah has no layout start page`)
      continue
    }
    if (header.page === firstAyahPage) continue
    shifted++
    if (header.page !== firstAyahPage - 1) {
      failures.push(
        `s${header.surah}: header on p${header.page} but first ayah starts on p${firstAyahPage}`,
      )
    }
    if (header.line !== 15) {
      failures.push(
        `s${header.surah}: shifted header sits on line ${header.line}, expected the page's last line`,
      )
    }
  }
  if (shifted !== DOCUMENTED_SHIFTED_HEADERS) {
    failures.push(
      `${shifted} headers on the page before their surah, expected ${DOCUMENTED_SHIFTED_HEADERS}`,
    )
  }

  if (failures.length === 0) {
    console.log(
      `surah headers check: 114 headers, 112 basmalahs, ${shifted} page-top starts (header on the previous page's last line) ✓`,
    )
  }
  return { name: "surah headers", failures }
}

/** Structural invariants of one built page chunk. */
export function checkChunk(chunk: PageChunk): string[] {
  const failures: string[] = []
  const expectedLines = SHORT_LINES_PAGES.get(chunk.page) ?? 15
  if (chunk.lines.length !== expectedLines) {
    failures.push(`p${chunk.page}: ${chunk.lines.length} lines, expected ${expectedLines}`)
  }
  chunk.lines.forEach((line, index) => {
    if (line.line !== index + 1) {
      failures.push(`p${chunk.page}: line at index ${index} claims slot ${line.line}`)
    }
  })
  return failures
}

/* ------------------------------------------------------------------ */
/* Output builders                                                     */
/* ------------------------------------------------------------------ */

export function buildAyahs(sources: Sources, walk: WalkResult, ayahKeys: string[]): AyahMeta[] {
  return sources.verses.map((verse, index) => {
    const parsed = parseVerseKey(ayahKeys[index] ?? "")
    const page = walk.ayahStartPage[index]
    if (!parsed || page === undefined || page === 0) {
      throw new Error(`verse ${index + 1}: missing verse key or layout start page`)
    }
    const [surah, ayah] = parsed
    return {
      surah,
      ayah,
      page,
      juz: verse.juz_number,
      hizb: verse.hizb_number,
      rubElHizb: verse.rub_el_hizb_number,
      ruku: verse.ruku_number,
      manzil: verse.manzil_number,
      sajdah: verse.sajdah_number,
      text: verse.text_uthmani,
    }
  })
}

export function buildSurahs(sources: Sources, walk: WalkResult): SurahSummary[] {
  return sources.chapters.map((chapter) => {
    const firstIndex = ayahIndexOf(sources.chapters, chapter.id, 1)
    const lastIndex = ayahIndexOf(sources.chapters, chapter.id, chapter.verses_count)
    const firstPage = walk.ayahStartPage[firstIndex]
    const lastPage = walk.ayahEndPage[lastIndex]
    if (firstPage === undefined || firstPage === 0 || lastPage === undefined || lastPage === 0) {
      throw new Error(`surah ${chapter.id}: missing layout page edges`)
    }
    return {
      surah: chapter.id,
      name: chapter.name_simple,
      arabicName: chapter.name_arabic,
      transliteration: chapter.name_complex,
      englishName: chapter.translated_name.name,
      revelation: chapter.revelation_place === "makkah" ? "makkah" : "madinah",
      revelationOrder: chapter.revelation_order,
      verseCount: chapter.verses_count,
      bismillahPre: chapter.bismillah_pre,
      firstPage,
      lastPage,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function writeJson(file: string, value: unknown): Promise<number> {
  const json = JSON.stringify(value)
  await writeFile(file, json, "utf8")
  return Buffer.byteLength(json, "utf8")
}

async function main(): Promise<void> {
  console.log("loading sources…")
  const sources = await loadSources()
  const ayahKeys = ayahKeysOf(sources.chapters)
  if (ayahKeys.length !== sources.glyphTable.length) {
    throw new Error(
      `${ayahKeys.length} verse keys vs ${sources.glyphTable.length} glyph table rows`,
    )
  }
  const problems: string[] = []

  const continuityCheck = checkVerseContinuity(sources)
  if (continuityCheck.failures.length > 0) {
    problems.push(...continuityCheck.failures.slice(0, 10))
  } else {
    console.log("verse continuity check: 1:1 .. 114:6 consecutive ✓")
  }

  const glyphCheck = checkGlyphTable(sources)
  problems.push(...glyphCheck.failures.slice(0, 10))

  // --- layout walk ---
  console.log("walking the layout glyph stream…")
  const mushafLayout = flattenLayout(sources.layout)
  const walk = walkSlots(
    mushafLayout.slots,
    sources.glyphTable.map((row) => row.glyphs),
  )
  console.log(
    `layout walk: ${mushafLayout.slots.length} slots, ${walk.anomalies.length} documented anomalies`,
  )

  const walkCheck = checkLayoutWalk(walk, ayahKeys)
  problems.push(...walkCheck.failures.slice(0, 10))

  const startPageCheck = checkStartPages(walk, sources, ayahKeys)
  if (startPageCheck.failures.length === 0) {
    console.log(
      "start pages check: layout vs reference page column differs on exactly " +
        `${DOCUMENTED_START_PAGE_DIFF_COUNT} ayahs (±1, print layout wins) ✓`,
    )
  }
  problems.push(...startPageCheck.failures.slice(0, 10))

  const headerCheck = checkSurahHeaders(mushafLayout, walk, sources)
  problems.push(...headerCheck.failures.slice(0, 10))

  // --- build page chunks ---
  const basmalahGlyphs = sources.layout.basmalah.v1
  let totalChunkBytes = 0
  const endSlotKeys = new Set<string>()
  for (const layoutPage of mushafLayout.pages) {
    const chunk = buildPageChunk(layoutPage, walk, ayahKeys, basmalahGlyphs)
    pageChunkSchema.parse(chunk)
    problems.push(...checkChunk(chunk).slice(0, 5))

    for (const line of chunk.lines) {
      if (line.kind !== "words") continue
      for (const word of line.words) {
        if (word.e === true) {
          const key = `${word.s}:${word.a}`
          if (endSlotKeys.has(key)) problems.push(`duplicate end slot for ${key}`)
          endSlotKeys.add(key)
        }
      }
    }

    totalChunkBytes += await writeJson(
      path.join(OUT_PAGES, `p${String(chunk.page).padStart(3, "0")}.json`),
      chunk,
    )
  }
  if (endSlotKeys.size !== ayahKeys.length) {
    problems.push(`${endSlotKeys.size} unique end slots across chunks, expected ${ayahKeys.length}`)
  }

  // --- build metadata files ---
  const surahs = buildSurahs(sources, walk)
  const ayahs = buildAyahs(sources, walk, ayahKeys)
  surahsFileSchema.parse(surahs)
  ayahsFileSchema.parse(ayahs)

  const meta = {
    juzPages: sources.layout.juzPages,
    fit: {
      body: sources.layout.fit?.body.v1,
      centreBelow: sources.layout.fit?.centreBelow.v1,
    },
  }
  mushafMetaSchema.parse(meta)

  const surahsBytes = await writeJson(path.join(OUT_DATA, "surahs.json"), surahs)
  const ayahsBytes = await writeJson(path.join(OUT_DATA, "ayahs.json"), ayahs)
  const metaBytes = await writeJson(path.join(OUT_DATA, "meta.json"), meta)

  // --- informational diff reports (print layout vs upstream conventions) ---
  const apiPageDiffs = sources.verses.filter(
    (verse, index) => verse.page_number !== walk.ayahStartPage[index],
  ).length
  const surahPageDiffs = surahs.filter((surah, index) => {
    const chapter = sources.chapters[index]
    return (
      chapter !== undefined &&
      (surah.firstPage !== chapter.pages[0] || surah.lastPage !== chapter.pages[1])
    )
  }).length
  console.log(
    `print vs API pages: ${apiPageDiffs} ayah start pages, ${surahPageDiffs} surah page edges differ ` +
      "(app data uses the print layout)",
  )

  // --- fonts ---
  await mkdir(OUT_PAGES, { recursive: true })
  await mkdir(path.join(OUT_FONTS, "pages"), { recursive: true })
  let fontCount = 0
  for (let page = 1; page <= 604; page++) {
    const id = String(page).padStart(3, "0")
    await copyFile(
      path.join(CACHE, "fonts", `QCF_P${id}.woff2`),
      path.join(OUT_FONTS, "pages", `QCF_P${id}.woff2`),
    )
    fontCount++
  }
  await copyFile(
    path.join(CACHE, "fonts", "QCF_BSML.woff2"),
    path.join(OUT_FONTS, "QCF_BSML.woff2"),
  )
  await copyFile(
    path.join(CACHE, "fonts", "uthmanic-hafs.woff2"),
    path.join(OUT_FONTS, "uthmanic-hafs.woff2"),
  )
  await copyFile(
    path.join(CACHE, "fonts", "sura-names.woff2"),
    path.join(OUT_FONTS, "sura-names.woff2"),
  )

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`)
    for (const problem of problems.slice(0, 20)) console.error(`  ✗ ${problem}`)
    process.exitCode = 1
  }

  console.log(`surahs.json: ${(surahsBytes / 1024).toFixed(1)} KB`)
  console.log(`ayahs.json: ${(ayahsBytes / 1024).toFixed(1)} KB`)
  console.log(`meta.json: ${(metaBytes / 1024).toFixed(1)} KB`)
  console.log(`page chunks: ${(totalChunkBytes / 1024 / 1024).toFixed(2)} MB (604 files)`)
  console.log(`fonts copied: ${fontCount} page fonts + basmalah + sura-names + uthmanic-hafs`)
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href
) {
  await main()
}

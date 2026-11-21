/**
 * Builds the app-consumed Quran data files from the fetched sources.
 *
 * Data model:
 *  - The QCF v1 page fonts are page-specific: a word's glyph code renders
 *    only in the font of the page it was printed on.  The Quran.com v4 API
 *    supplies that print layout (per-word `page_number` and `line_number`),
 *    and `scripts/lib/page-layout.ts` turns it into the 604 page chunks.
 *  - The QUL layout file is an independent 15-line edition and is only used
 *    for the shared basmalah band and the type-scale/fit metadata.  Its page
 *    breaks drift from the QCF fonts in several places, so it is not used to
 *    place words on pages.
 *  - Verse metadata (names, juz, hizb, ruku, manzil, sajdah, Uthmani text)
 *    comes from the Quran.com v4 API.
 *
 * Cross-checks before anything is written; each runs against a fixed
 * documented ledger, and anything beyond it fails the build:
 *  1. API glyph streams ≡ reference streams (space-stripped)
 *  2. reference page column ≡ API page_number
 *  3. verse keys strictly consecutive (1:1 .. 114:6)
 *  4. 604 page chunks, exact line grids, every API word placed once
 *  5. 114 surah headers, 112 basmalahs, valid placement
 *  6. one verse-end medallion per ayah
 *
 * Outputs:
 *  - public/data/surahs.json      (114 surah summaries, API pages)
 *  - public/data/ayahs.json       (6236 ayah metadata rows, API pages)
 *  - public/data/pages/pNNN.json  (604 page layout chunks)
 *  - public/data/word-index.json  (slot indexes within verses, verse totals)
 *  - public/data/audio-timings/  (word timing maps for matching reciters)
 *  - public/fonts/…               (604 QCF page fonts + basmalah + fallback)
 *
 * Run with:  node scripts/build-data.ts
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { inflateRawSync } from "node:zlib"

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
  wordIndexFileSchema,
} from "../src/lib/domain/schemas.ts"
import { buildWordIndex } from "../src/lib/features/mushaf/model/word-ledger.ts"
import { buildPageLayout, checkPageLayout, lineCountOf } from "./lib/page-layout.ts"

const ROOT = path.resolve(import.meta.dirname, "..")
const CACHE = path.join(ROOT, ".cache", "sources")
const OUT_DATA = path.join(ROOT, "public", "data")
const OUT_PAGES = path.join(OUT_DATA, "pages")
const OUT_FONTS = path.join(ROOT, "public", "fonts")
const OUT_TIMINGS = path.join(OUT_DATA, "audio-timings")

export interface Sources {
  chapters: ApiChapter[]
  /** All 6236 verses in reading order. */
  verses: ApiVerse[]
  /** `mushaf.txt` rows: { page, glyphs } per ayah, reading order. */
  glyphTable: { page: number; glyphs: string }[]
  /** The QUL layout file, used for the basmalah band and type-scale fit. */
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

/** Ayahs where the API glyph stream differs from the reference table. */
const DOCUMENTED_TABLE_GLYPH_DIFFS: ReadonlySet<string> = new Set(["2:79", "68:42", "69:8"])

/** Ayahs where the table's page column differs from the API page number. */
const DOCUMENTED_TABLE_PAGE_DIFFS: ReadonlySet<string> = new Set(["83:35"])

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

/** Structural invariants of one built page chunk. */
export function checkChunk(chunk: PageChunk): string[] {
  const failures: string[] = []
  const expectedLines = lineCountOf(chunk.page)
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

export function buildAyahs(sources: Sources): AyahMeta[] {
  return sources.verses.map((verse) => {
    const parsed = parseVerseKey(verse.verse_key)
    if (!parsed) throw new Error(`malformed verse key: ${verse.verse_key}`)
    const [surah, ayah] = parsed
    return {
      surah,
      ayah,
      page: verse.page_number,
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

export function buildSurahs(sources: Sources): SurahSummary[] {
  return sources.chapters.map((chapter) => {
    const firstIndex = ayahIndexOf(sources.chapters, chapter.id, 1)
    const lastIndex = ayahIndexOf(sources.chapters, chapter.id, chapter.verses_count)
    const firstPage = sources.verses[firstIndex]?.page_number
    const lastPage = sources.verses[lastIndex]?.page_number
    if (firstPage === undefined || lastPage === undefined) {
      throw new Error(`surah ${chapter.id}: missing page edges`)
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

/** Read one file from the pinned ZIP source without adding a ZIP dependency. */
function zipEntry(archive: Buffer, wantedName: string): Buffer {
  let endRecord = -1
  const searchStart = Math.max(0, archive.length - 65_557)
  for (let offset = archive.length - 22; offset >= searchStart; offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      endRecord = offset
      break
    }
  }
  if (endRecord < 0) throw new Error("quran-align archive has no end record")

  const entryCount = archive.readUInt16LE(endRecord + 10)
  let offset = archive.readUInt32LE(endRecord + 16)
  for (let index = 0; index < entryCount; index++) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("quran-align archive has a malformed directory")
    }
    const method = archive.readUInt16LE(offset + 10)
    const compressedSize = archive.readUInt32LE(offset + 20)
    const uncompressedSize = archive.readUInt32LE(offset + 24)
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const localOffset = archive.readUInt32LE(offset + 42)
    const name = archive.toString("utf8", offset + 46, offset + 46 + nameLength)

    if (name === wantedName) {
      if (archive.readUInt32LE(localOffset) !== 0x04034b50) {
        throw new Error(`quran-align entry ${wantedName} has a malformed header`)
      }
      const localNameLength = archive.readUInt16LE(localOffset + 26)
      const localExtraLength = archive.readUInt16LE(localOffset + 28)
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength
      const compressed = archive.subarray(dataOffset, dataOffset + compressedSize)
      const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null
      if (!data || data.length !== uncompressedSize) {
        throw new Error(`quran-align entry ${wantedName} could not be decompressed`)
      }
      return data
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  throw new Error(`quran-align archive is missing ${wantedName}`)
}

interface AlignmentRow {
  surah: number
  ayah: number
  /** [zero-based start word, exclusive end word, start ms, end ms]. */
  segments: [number, number, number, number][]
}

function readAlignment(
  archive: Buffer,
  filename: string,
): Record<string, AlignmentRow["segments"]> {
  const rows = JSON.parse(zipEntry(archive, filename).toString("utf8")) as AlignmentRow[]
  const timings: Record<string, AlignmentRow["segments"]> = {}
  for (const row of rows) {
    if (!Number.isInteger(row.surah) || !Number.isInteger(row.ayah)) {
      throw new Error(`quran-align ${filename} contains a malformed row`)
    }
    // A small number of rows in the source have no usable alignment. Leave
    // those verses unavailable for clipped playback rather than inventing times.
    if (row.segments === undefined) continue
    if (!Array.isArray(row.segments)) {
      throw new Error(`quran-align ${filename} contains malformed segments`)
    }
    if (
      row.segments.some(
        (segment) => segment.length !== 4 || segment.some((part) => !Number.isFinite(part)),
      )
    ) {
      throw new Error(`quran-align ${filename} contains a malformed segment`)
    }
    timings[`${row.surah}:${row.ayah}`] = row.segments
  }
  if (rows.length !== 6236) {
    throw new Error(`quran-align ${filename} has ${rows.length} verse rows, expected 6236`)
  }
  const missing = 6236 - Object.keys(timings).length
  if (missing > 0) console.warn(`quran-align ${filename}: ${missing} verses have no word timings`)
  return timings
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

  // --- page chunks: the QCF v1 word layout from the API ---
  const basmalahGlyphs = sources.layout.basmalah.v1
  const layout = buildPageLayout(sources, basmalahGlyphs)
  problems.push(...checkPageLayout(layout.chunks, sources).slice(0, 10))
  console.log(
    `page layout: ${layout.chunks.length} pages, ${layout.openings.length} surah openings at the top of a page`,
  )

  let totalChunkBytes = 0
  const endSlotKeys = new Set<string>()
  const builtChunks = layout.chunks
  for (const chunk of builtChunks) {
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

  // --- word index: each slot's index within its verse, each verse's total ---
  const wordIndex = buildWordIndex(builtChunks)
  const indexedVerses = Object.keys(wordIndex.verseSlots).length
  if (indexedVerses !== ayahKeys.length) {
    problems.push(`${indexedVerses} verses indexed, expected ${ayahKeys.length}`)
  }
  wordIndexFileSchema.parse(wordIndex)
  const wordIndexBytes = await writeJson(path.join(OUT_DATA, "word-index.json"), wordIndex)

  // Word-level playback ranges for the matching EveryAyah recordings.
  const alignmentArchive = await readFile(path.join(CACHE, "quran-align-data.zip"))
  await mkdir(OUT_TIMINGS, { recursive: true })
  const timingFiles = [
    ["alafasy", "Alafasy_128kbps.json"],
    ["husary", "Husary_64kbps.json"],
    ["minshawy", "Minshawy_Murattal_128kbps.json"],
    ["abdul-basit-murattal", "Abdul_Basit_Murattal_64kbps.json"],
    ["abdul-basit-mujawwad", "Abdul_Basit_Mujawwad_128kbps.json"],
    ["shaatree", "Abu_Bakr_Ash-Shaatree_128kbps.json"],
    ["hani-rifai", "Hani_Rifai_192kbps.json"],
    ["husary-muallim", "Husary_Muallim_128kbps.json"],
    ["minshawy-mujawwad", "Minshawy_Mujawwad_192kbps.json"],
    ["tablaway", "Mohammad_al_Tablaway_128kbps.json"],
    ["shuraym", "Saood_ash-Shuraym_128kbps.json"],
  ] as const
  const timingBytes = await Promise.all(
    timingFiles.map(([name, filename]) =>
      writeJson(path.join(OUT_TIMINGS, `${name}.json`), readAlignment(alignmentArchive, filename)),
    ),
  )

  // --- build metadata files ---
  const surahs = buildSurahs(sources)
  const ayahs = buildAyahs(sources)
  surahsFileSchema.parse(surahs)
  ayahsFileSchema.parse(ayahs)
  const ayahByKey = new Map<string, AyahMeta>()
  for (const ayah of ayahs) ayahByKey.set(`${ayah.surah}:${ayah.ayah}`, ayah)
  const pageHizbs = Array<number>(604).fill(0)
  for (const chunk of builtChunks) {
    for (const line of chunk.lines) {
      if (line.kind !== "words") continue
      const firstWord = line.words[0]
      if (!firstWord) continue
      const ayah = ayahByKey.get(`${firstWord.s}:${firstWord.a}`)
      if (!ayah) throw new Error(`Missing ayah metadata for ${firstWord.s}:${firstWord.a}`)
      pageHizbs[chunk.page - 1] = ayah.hizb
      break
    }
    if (pageHizbs[chunk.page - 1] === 0) {
      throw new Error(`Missing first ayah on page ${chunk.page}`)
    }
  }

  const juzPages = Array<number>(30).fill(0)
  for (const verse of sources.verses) {
    if (juzPages[verse.juz_number - 1] === 0) {
      juzPages[verse.juz_number - 1] = verse.page_number
    }
  }
  if (juzPages.some((page) => page === 0)) {
    throw new Error("missing one or more juz start pages")
  }

  const meta = {
    juzPages,
    pageHizbs,
    fit: {
      body: sources.layout.fit?.body.v1,
      centreBelow: sources.layout.fit?.centreBelow.v1,
    },
  }
  mushafMetaSchema.parse(meta)

  const surahsBytes = await writeJson(path.join(OUT_DATA, "surahs.json"), surahs)
  const ayahsBytes = await writeJson(path.join(OUT_DATA, "ayahs.json"), ayahs)
  const metaBytes = await writeJson(path.join(OUT_DATA, "meta.json"), meta)

  // --- informational report: API page numbers vs the surah summaries ---
  const surahPageDiffs = surahs.filter((surah, index) => {
    const chapter = sources.chapters[index]
    return (
      chapter !== undefined &&
      (surah.firstPage !== chapter.pages[0] || surah.lastPage !== chapter.pages[1])
    )
  }).length
  if (surahPageDiffs > 0) {
    console.warn(`surah page edges: ${surahPageDiffs} differ from the API chapter pages`)
  }

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
  console.log(`word-index.json: ${(wordIndexBytes / 1024).toFixed(1)} KB`)
  console.log(
    `word timings: ${(timingBytes.reduce((sum, bytes) => sum + bytes, 0) / 1024).toFixed(1)} KB`,
  )
  console.log(`meta.json: ${(metaBytes / 1024).toFixed(1)} KB`)
  console.log(`page chunks: ${(totalChunkBytes / 1024 / 1024).toFixed(2)} MB (604 files)`)
  console.log(`fonts copied: ${fontCount} page fonts + basmalah + sura-names + uthmanic-hafs`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}

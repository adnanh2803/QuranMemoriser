/**
 * Builds app page chunks from the QCF v1 word layout returned by the
 * Quran.com v4 API.
 *
 * The QCF page fonts are page-specific: every glyph code is only valid in
 * the font of the page it was printed on.  The API's per-word `page_number`
 * and `line_number` are exactly that print layout, while the QUL layout file
 * used elsewhere is an independent 15-line edition whose page breaks drift
 * from the fonts in several places.  Page chunks therefore have to follow
 * the API's word placement, not the QUL page boundaries.
 *
 * The API carries ayah words and their verse-end medallions but no surah
 * header or basmalah bands.  Those are inferred from the first ayah's line:
 *
 *  - a surah whose first ayah is on line 3 or later has its header two lines
 *    above the ayah and its basmalah one line above;
 *  - a surah whose first ayah is on line 2 has only a basmalah line above it
 *    in the print, with the name band at the foot of the previous page.  The
 *    app keeps the name on the page where the surah begins, so the name and
 *    basmalah share the first line; the previous page keeps a blank spacer
 *    where the print had the band;
 *  - surah 1 prints the basmalah as ayah 1 and surah 9 has no basmalah, so
 *    both have their header on the line above the first ayah.
 */
import type {
  ApiChapter,
  ApiVerse,
  MushafLine,
  MushafWord,
  PageChunk,
} from "../../src/lib/domain/schemas.ts"
import { parseVerseKey } from "../../src/lib/domain/schemas.ts"

import { PAGE_COUNT, SHORT_LINES_PAGES } from "./layout.ts"

export interface PageLayoutSources {
  chapters: ApiChapter[]
  /** All 6236 verses in reading order. */
  verses: ApiVerse[]
}

export interface PageLayoutResult {
  chunks: PageChunk[]
  /**
   * Surahs whose name and basmalah share the page's first line.  The print
   * draws the name at the foot of the previous page; the app moves it to the
   * page where the surah begins.
   */
  openings: { page: number; surah: number }[]
}

/** Line count of a page's grid: 8 on the two front-matter pages, else 15. */
export function lineCountOf(page: number): number {
  return SHORT_LINES_PAGES.get(page) ?? 15
}

/**
 * Builds all 604 page chunks.  Throws on any missing, duplicated or
 * out-of-grid line, so a malformed API snapshot fails the build instead of
 * producing a page with holes.
 */
export function buildPageLayout(
  sources: PageLayoutSources,
  basmalahGlyphs: string,
): PageLayoutResult {
  const chapters = new Map(sources.chapters.map((chapter) => [chapter.id, chapter]))
  const versesByPage = new Map<number, ApiVerse[]>()
  for (const verse of sources.verses) {
    const list = versesByPage.get(verse.page_number)
    if (list) list.push(verse)
    else versesByPage.set(verse.page_number, [verse])
  }

  /** Ayah words and medallions, keyed page -> printed line. */
  const wordLines = new Map<number, Map<number, MushafWord[]>>()
  /** Surah headers and basmalah bands, keyed page -> printed line. */
  const extraLines = new Map<number, Map<number, MushafLine>>()
  const openings: PageLayoutResult["openings"] = []

  function addWord(page: number, line: number, word: MushafWord): void {
    let pageLines = wordLines.get(page)
    if (!pageLines) {
      pageLines = new Map()
      wordLines.set(page, pageLines)
    }
    let words = pageLines.get(line)
    if (!words) {
      words = []
      pageLines.set(line, words)
    }
    words.push(word)
  }

  function addExtra(page: number, line: number, value: MushafLine): void {
    if (line < 1 || line > lineCountOf(page)) {
      throw new Error(`p${page}: ${value.kind} line ${line} is outside the page grid`)
    }
    let pageLines = extraLines.get(page)
    if (!pageLines) {
      pageLines = new Map()
      extraLines.set(page, pageLines)
    }
    const existing = pageLines.get(line)
    if (existing) {
      throw new Error(`p${page} line ${line}: ${existing.kind} already occupies the slot`)
    }
    pageLines.set(line, value)
  }

  for (let page = 1; page <= PAGE_COUNT; page++) {
    const verses = versesByPage.get(page)
    if (!verses || verses.length === 0) {
      throw new Error(`p${page}: no verses in the API snapshot`)
    }

    for (const verse of verses) {
      const parsed = parseVerseKey(verse.verse_key)
      if (!parsed) throw new Error(`p${page}: malformed verse key ${verse.verse_key}`)
      const [surah, ayah] = parsed

      for (const word of verse.words) {
        if (word.page_number !== page) {
          throw new Error(
            `p${page}: verse ${verse.verse_key} word ${word.position} is on page ${word.page_number}`,
          )
        }
        addWord(page, word.line_number, {
          g: word.code_v1,
          s: surah,
          a: ayah,
          ...(word.char_type_name === "end" ? { e: true } : {}),
        })
      }

      if (ayah !== 1) continue

      const firstWord = verse.words[0]
      if (!firstWord) throw new Error(`p${page}: surah ${surah} has no first word`)
      const firstLine = firstWord.line_number
      const chapter = chapters.get(surah)
      if (!chapter) throw new Error(`p${page}: unknown surah ${surah}`)

      if (surah === 1) {
        // Al-Fatihah's basmalah is ayah 1; only the name band is separate.
        addExtra(1, 1, { kind: "surah", line: 1, surah: 1 })
      } else if (!chapter.bismillah_pre) {
        // At-Tawbah has no basmalah.
        const headerLine = firstLine - 1
        if (headerLine < 1) {
          throw new Error(`p${page}: surah ${surah} starts on line ${firstLine} without room`)
        }
        addExtra(page, headerLine, { kind: "surah", line: headerLine, surah })
      } else if (firstLine >= 3) {
        addExtra(page, firstLine - 2, {
          kind: "surah",
          line: firstLine - 2,
          surah,
        })
        addExtra(page, firstLine - 1, {
          kind: "basmalah",
          line: firstLine - 1,
          glyphs: basmalahGlyphs,
        })
      } else if (firstLine === 2) {
        // The print puts the name band at the foot of the previous page and
        // the basmalah on this page's first line.  Keep the name with the
        // surah: both share line 1 here, and the previous page keeps the
        // slot as a spacer so its printed lines stay on the same grid.
        const previousPage = page - 1
        if (previousPage < 1) {
          throw new Error(`p${page}: surah ${surah} starts on line 2 with no previous page`)
        }
        const blankLine = lineCountOf(previousPage)
        addExtra(previousPage, blankLine, { kind: "blank", line: blankLine })
        addExtra(page, 1, {
          kind: "opening",
          line: 1,
          surah,
          glyphs: basmalahGlyphs,
        })
        openings.push({ page, surah })
      } else {
        throw new Error(`p${page}: surah ${surah} starts on line 1 without a header slot`)
      }
    }
  }

  const chunks: PageChunk[] = []
  for (let page = 1; page <= PAGE_COUNT; page++) {
    const wordsByLine = wordLines.get(page)
    const extrasByLine = extraLines.get(page)
    const lines: MushafLine[] = []
    for (let line = 1; line <= lineCountOf(page); line++) {
      const words = wordsByLine?.get(line)
      const extra = extrasByLine?.get(line)
      if (words && extra) {
        throw new Error(`p${page} line ${line}: words and ${extra.kind} collide`)
      }
      if (words) {
        lines.push({ kind: "words", line, words })
      } else if (extra) {
        lines.push(extra)
      } else {
        throw new Error(`p${page} line ${line}: no printed content`)
      }
    }
    for (const line of wordsByLine?.keys() ?? []) {
      if (line < 1 || line > lineCountOf(page)) {
        throw new Error(`p${page}: word line ${line} is outside the page grid`)
      }
    }
    for (const line of extrasByLine?.keys() ?? []) {
      if (line < 1 || line > lineCountOf(page)) {
        throw new Error(`p${page}: extra line ${line} is outside the page grid`)
      }
    }
    chunks.push({ page, lines })
  }

  return { chunks, openings }
}

/**
 * Independent structural checks for the chunks produced above:
 *  - 604 pages, exact line grids;
 *  - every API word (including its verse-end medallion) appears once, in
 *    the same order, with matching verse keys;
 *  - one header for every surah and one basmalah for every surah except
 *    1 and 9.
 */
export function checkPageLayout(chunks: PageChunk[], sources: PageLayoutSources): string[] {
  const failures: string[] = []
  if (chunks.length !== PAGE_COUNT) {
    failures.push(`${chunks.length} page chunks, expected ${PAGE_COUNT}`)
  }

  const versesByPage = new Map<number, ApiVerse[]>()
  for (const verse of sources.verses) {
    const list = versesByPage.get(verse.page_number)
    if (list) list.push(verse)
    else versesByPage.set(verse.page_number, [verse])
  }

  const headers: { page: number; line: number; surah: number }[] = []
  let basmalahs = 0

  for (const chunk of chunks) {
    const expectedLines = lineCountOf(chunk.page)
    if (chunk.lines.length !== expectedLines) {
      failures.push(`p${chunk.page}: ${chunk.lines.length} lines, expected ${expectedLines}`)
    }
    chunk.lines.forEach((line, index) => {
      if (line.line !== index + 1) {
        failures.push(`p${chunk.page}: line at index ${index} claims slot ${line.line}`)
      }
      if (line.kind === "surah" || line.kind === "opening") {
        headers.push({ page: chunk.page, line: line.line, surah: line.surah })
      }
      if (line.kind === "basmalah" || line.kind === "opening") basmalahs++
      if (line.kind === "opening" && line.line !== 1) {
        failures.push(`p${chunk.page}: surah ${line.surah} opening is on line ${line.line}`)
      }
      if (line.kind === "blank" && line.line !== chunk.lines.length) {
        failures.push(`p${chunk.page}: blank line ${line.line} is not the last line`)
      }
    })

    const apiWords: MushafWord[] = []
    for (const verse of versesByPage.get(chunk.page) ?? []) {
      const parsed = parseVerseKey(verse.verse_key)
      if (!parsed) {
        failures.push(`p${chunk.page}: malformed verse key ${verse.verse_key}`)
        continue
      }
      const [surah, ayah] = parsed
      for (const word of verse.words) {
        apiWords.push({
          g: word.code_v1,
          s: surah,
          a: ayah,
          ...(word.char_type_name === "end" ? { e: true } : {}),
        })
      }
    }
    const chunkWords = chunk.lines.flatMap((line) => (line.kind === "words" ? line.words : []))
    if (chunkWords.length !== apiWords.length) {
      failures.push(`p${chunk.page}: ${chunkWords.length} words, expected ${apiWords.length}`)
      continue
    }
    for (let index = 0; index < apiWords.length; index++) {
      const expected = apiWords[index]
      const actual = chunkWords[index]
      if (!expected || !actual) continue
      if (
        actual.g !== expected.g ||
        actual.s !== expected.s ||
        actual.a !== expected.a ||
        actual.e !== expected.e
      ) {
        failures.push(
          `p${chunk.page}: word ${index + 1} is ${actual.s}:${actual.a} ${JSON.stringify(actual.g)}, ` +
            `expected ${expected.s}:${expected.a} ${JSON.stringify(expected.g)}`,
        )
        break
      }
    }
  }

  if (headers.length !== 114) failures.push(`${headers.length} surah headers, expected 114`)
  headers.forEach((header, index) => {
    if (header.surah !== index + 1) {
      failures.push(
        `header ${index + 1} belongs to surah ${header.surah} (page ${header.page}, line ${header.line})`,
      )
    }
  })
  if (basmalahs !== 112) failures.push(`${basmalahs} basmalahs, expected 112`)

  const expectedBasmalahSurahs = new Set(
    sources.chapters.filter((chapter) => chapter.bismillah_pre).map((chapter) => chapter.id),
  )
  if (expectedBasmalahSurahs.size !== 112) {
    failures.push(`${expectedBasmalahSurahs.size} surahs with a basmalah, expected 112`)
  }

  return failures
}

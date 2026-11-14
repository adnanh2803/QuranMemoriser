/**
 * Turns the QUL mushaf layout file into app-shaped structures.
 *
 * The layout is the print truth: 604 pages, each a strict sequence of line
 * items (ayah word lines, surah header bands, basmalah lines). Line number
 * equals the item's position, so no band placement inference is needed —
 * the layout *is* the print.
 */
import type {
  MushafLayoutFile,
  MushafLayoutItem,
  MushafLine,
  PageChunk,
} from "../../src/lib/domain/schemas.ts"
import { parseVerseKey } from "../../src/lib/domain/schemas.ts"

import type { WalkResult, WalkSlot } from "./walk.ts"

/** Verse keys ("2:255") for every 0-based global ayah index. */
export type AyahKeys = string[]

export const PAGE_COUNT = 604
/** The front-matter pages that use only 8 of the 15 line slots. */
export const SHORT_LINES_PAGES: ReadonlyMap<number, number> = new Map([
  [1, 8],
  [2, 8],
])

export interface LayoutSlot extends WalkSlot {
  /** Global index of the slot in mushaf reading order. */
  index: number
}

export type LayoutLine =
  | { line: number; kind: "surah"; surah: number; slots: [] }
  | { line: number; kind: "basmalah"; slots: [] }
  | { line: number; kind: "words"; slots: LayoutSlot[] }

export interface LayoutPage {
  page: number
  lines: LayoutLine[]
}

export interface MushafLayout {
  pages: LayoutPage[]
  /** All glyph slots of the whole Quran, in reading order. */
  slots: LayoutSlot[]
}

/**
 * Flattens the layout file into per-page lines and the global slot stream.
 * Throws when a page is missing, out of range, or carries an item the
 * layout contract does not allow.
 */
export function flattenLayout(file: MushafLayoutFile): MushafLayout {
  const pages: LayoutPage[] = []
  const slots: LayoutSlot[] = []

  const pageKeys = Object.keys(file.pages)
  if (pageKeys.length !== PAGE_COUNT) {
    throw new Error(`layout has ${pageKeys.length} pages, expected ${PAGE_COUNT}`)
  }

  for (let page = 1; page <= PAGE_COUNT; page++) {
    const items: MushafLayoutItem[] = file.pages[String(page)] ?? []
    const lines: LayoutLine[] = items.map((item, itemIndex) => {
      const line = itemIndex + 1
      if (item.t === "surah") {
        if (item.s === undefined)
          throw new Error(`p${page} line ${line}: surah item without surah number`)
        return { line, kind: "surah" as const, surah: item.s, slots: [] }
      }
      if (item.t === "basmalah") {
        return { line, kind: "basmalah" as const, slots: [] }
      }
      const itemSlots: LayoutSlot[] = (item.v1 ?? "")
        .split("|")
        .filter((raw) => raw.replaceAll(" ", "").length > 0)
        .map((raw) => {
          const glyphs = raw.replaceAll(" ", "")
          const slot: LayoutSlot = { index: slots.length, page, raw, glyphs }
          slots.push(slot)
          return slot
        })
      if (itemSlots.length === 0) {
        throw new Error(`p${page} line ${line}: ayah item without glyph slots`)
      }
      return { line, kind: "words" as const, slots: itemSlots }
    })

    const expectedLines = SHORT_LINES_PAGES.get(page) ?? 15
    if (lines.length !== expectedLines) {
      throw new Error(`p${page}: ${lines.length} line items, expected ${expectedLines}`)
    }

    pages.push({ page, lines })
  }

  return { pages, slots }
}

/**
 * Builds one page chunk by zipping the layout lines with the walk results
 * (indexed by the global slot order the layout was flattened in).
 */
export function buildPageChunk(
  layoutPage: LayoutPage,
  walk: WalkResult,
  ayahKeys: AyahKeys,
  basmalahGlyphs: string,
): PageChunk {
  const lines: MushafLine[] = layoutPage.lines.map((layoutLine) => {
    if (layoutLine.kind === "surah") {
      return { kind: "surah", line: layoutLine.line, surah: layoutLine.surah }
    }
    if (layoutLine.kind === "basmalah") {
      return { kind: "basmalah", line: layoutLine.line, glyphs: basmalahGlyphs }
    }
    return {
      kind: "words",
      line: layoutLine.line,
      words: layoutLine.slots.map((slot) => {
        const ayahIndex = walk.slotAyah[slot.index]
        if (ayahIndex === undefined) {
          throw new Error(
            `p${layoutPage.page} line ${layoutLine.line}: slot ${slot.index} has no ayah`,
          )
        }
        const parsed = parseVerseKey(ayahKeys[ayahIndex] ?? "")
        if (!parsed) {
          throw new Error(`p${layoutPage.page}: no verse key for ayah index ${ayahIndex}`)
        }
        const [surah, ayah] = parsed
        return {
          g: slot.raw,
          s: surah,
          a: ayah,
          ...(walk.slotEnd[slot.index] === true ? { e: true as const } : {}),
        }
      }),
    }
  })
  return { page: layoutPage.page, lines }
}

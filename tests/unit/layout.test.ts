import { describe, expect, it } from "vitest"

import {
  buildPageChunk,
  flattenLayout,
  type LayoutPage,
  type MushafLayout,
} from "../../scripts/lib/layout.ts"
import { walkSlots } from "../../scripts/lib/walk.ts"
import type { MushafLayoutFile, MushafLayoutItem } from "../../src/lib/domain/schemas.ts"

/** QCF-range stand-ins: the walk's substitution rule must stay dormant. */
const g = (offset: number): string => String.fromCharCode(0xfb50 + offset)
const A = g(0)
const B = g(1)
const C = g(2)
const D = g(3)
const E = g(4)
const G = g(5)
const H = g(7)
const I = g(8)
const Y = g(9)
const Q = g(6)

const ayahItem = (v1: string, c?: number): MushafLayoutItem => ({
  t: "ayah",
  v1,
  ...(c ? { c } : {}),
})

/** A regular page of filler items so the fixture satisfies the 604-page contract. */
const fillerPage = () => Array.from({ length: 15 }, () => ayahItem(Q))

/**
 * A minimal but contract-valid slice of the layout: page 1 (front matter,
 * 8 items) and page 2 (regular, 15 items), padded to the full 604 pages.
 */
const mini: MushafLayoutFile = {
  basmalah: { page: 1, v1: "\uFBD1|\uFBD2|\uFBD3|\uFBD4" },
  pages: {
    "1": [
      { t: "surah", s: 1 },
      { t: "basmalah" },
      ayahItem(`${A}${B}|${C} ${C}|${D}${E}`),
      ayahItem(G),
      ...Array.from({ length: 4 }, () => ayahItem(Q)),
    ],
    "2": [ayahItem(`${H}${I}`, 1), ...Array.from({ length: 7 }, () => ayahItem(Y))],
    ...Object.fromEntries(Array.from({ length: 602 }, (_, i) => [String(i + 3), fillerPage()])),
  },
}

describe("flattenLayout", () => {
  it("numbers lines by item position and indexes slots globally", () => {
    const layout: MushafLayout = flattenLayout(mini)
    expect(layout.pages).toHaveLength(604)

    const page1 = layout.pages[0]!
    const page2 = layout.pages[1]!
    expect(page1.lines.map((line) => line.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(page2.lines.map((line) => line.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(page1.lines[0]).toEqual({ line: 1, kind: "surah", surah: 1, slots: [] })
    expect(page1.lines[1]).toEqual({ line: 2, kind: "basmalah", slots: [] })
    expect(page2.lines[0]?.kind).toBe("words")

    // "C C" keeps its spacing in raw but is stripped for matching.
    expect(page1.lines[2]?.slots.map((slot) => slot.raw)).toEqual([A + B, `${C} ${C}`, D + E])
    expect(page1.lines[2]?.slots.map((slot) => slot.glyphs)).toEqual([A + B, C + C, D + E])

    expect(layout.slots).toHaveLength(16 + 602 * 15)
    expect(layout.slots[3]).toMatchObject({ index: 3, page: 1, glyphs: G })
    expect(layout.slots[8]).toMatchObject({ index: 8, page: 2, glyphs: H + I })
  })

  it("rejects a missing page", () => {
    expect(() =>
      flattenLayout({ basmalah: mini.basmalah, pages: { "1": mini.pages["1"]! } }),
    ).toThrow(/expected 604/)
  })

  it("rejects pages with an unexpected line count", () => {
    const broken: MushafLayoutFile = {
      basmalah: mini.basmalah,
      pages: { ...mini.pages, "3": mini.pages["3"]!.slice(0, 14) },
    }
    expect(() => flattenLayout(broken)).toThrow(/p3: 14 line items, expected 15/)
  })

  it("rejects a surah item without a surah number", () => {
    const broken: MushafLayoutFile = {
      basmalah: mini.basmalah,
      pages: { ...mini.pages, "1": [{ t: "surah" }, ...mini.pages["1"]!.slice(1)] },
    }
    expect(() => flattenLayout(broken)).toThrow(/surah item without surah number/)
  })

  it("rejects an ayah item without glyph slots", () => {
    const broken: MushafLayoutFile = {
      basmalah: mini.basmalah,
      pages: { ...mini.pages, "2": [ayahItem("  |  "), ...mini.pages["2"]!.slice(1)] },
    }
    expect(() => flattenLayout(broken)).toThrow(/without glyph slots/)
  })
})

describe("buildPageChunk", () => {
  it("zips walk results into words with verse keys and end flags", () => {
    const page: LayoutPage = {
      page: 7,
      lines: [
        { line: 1, kind: "surah", surah: 69, slots: [] },
        { line: 2, kind: "basmalah", slots: [] },
        {
          line: 3,
          kind: "words",
          slots: [
            { index: 0, page: 7, raw: A, glyphs: A },
            { index: 1, page: 7, raw: `${B} ${B}`, glyphs: B + B },
            { index: 2, page: 7, raw: C, glyphs: C },
          ],
        },
        { line: 4, kind: "words", slots: [{ index: 3, page: 7, raw: D, glyphs: D }] },
      ],
    }
    const slots = page.lines.flatMap((line) => line.slots)
    const walk = walkSlots(slots, [A + B + B + C, D])
    const chunk = buildPageChunk(page, walk, ["69:1", "69:2"], "\uFBD1|\uFBD2")

    expect(chunk.page).toBe(7)
    expect(chunk.lines[0]).toEqual({ kind: "surah", line: 1, surah: 69 })
    expect(chunk.lines[1]).toEqual({ kind: "basmalah", line: 2, glyphs: "\uFBD1|\uFBD2" })
    expect(chunk.lines[2]).toEqual({
      kind: "words",
      line: 3,
      words: [
        { g: A, s: 69, a: 1 },
        { g: `${B} ${B}`, s: 69, a: 1 },
        { g: C, s: 69, a: 1, e: true },
      ],
    })
    expect(chunk.lines[3]).toEqual({
      kind: "words",
      line: 4,
      words: [{ g: D, s: 69, a: 2, e: true }],
    })
  })
})

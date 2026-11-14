import { describe, expect, it } from "vitest"

import { isQcfGlyph, type WalkSlot, walkSlots } from "../../scripts/lib/walk.ts"

/**
 * QCF-range stand-ins: the substitution rule treats any reference char
 * outside the glyph range as corrupt, so fixtures must use real-range
 * codepoints to keep that rule dormant except where a test wants it.
 */
const g = (offset: number): string => String.fromCharCode(0xfb50 + offset)
const A = g(0)
const B = g(1)
const C = g(2)
const D = g(3)
const E = g(4)
const X = g(20)
const Z = g(21)

const slot = (page: number, glyphs: string, raw = glyphs): WalkSlot => ({ page, glyphs, raw })

describe("walkSlots", () => {
  it("assigns slots to ayahs in stream order", () => {
    const result = walkSlots([slot(1, A + B), slot(1, C), slot(1, D + E)], [A + B, C + D + E])
    expect(result.slotAyah).toEqual([0, 1, 1])
    expect(result.slotEnd).toEqual([true, false, true])
    expect(result.anomalies).toEqual([])
  })

  it("flags the slot that completes each ayah's stream", () => {
    const result = walkSlots([slot(1, A + B), slot(2, C), slot(2, D + E)], [A + B + C, D + E])
    expect(result.slotEnd).toEqual([false, true, true])
    expect(result.ayahEndPage).toEqual([2, 2])
  })

  it("records the first page each ayah appears on", () => {
    const result = walkSlots([slot(7, A + B), slot(7, C), slot(8, D + E)], [A + B + C, D + E])
    expect(result.ayahStartPage).toEqual([7, 8])
  })

  it("tolerates a doubled reference glyph and reports it once", () => {
    // 2:79 pattern: the reference carries XX where the print has one X.
    const result = walkSlots([slot(1, A), slot(1, B), slot(1, X), slot(1, C)], [A + B, X + X + C])
    expect(result.slotAyah).toEqual([0, 0, 1, 1])
    expect(result.slotEnd).toEqual([false, true, false, true])
    expect(result.anomalies).toHaveLength(1)
    expect(result.anomalies[0]).toMatchObject({ kind: "reference-extra", ayah: 2, page: 1 })
  })

  it("substitutes a corrupt non-glyph reference char", () => {
    // 68:42 pattern: the reference's final char is a corrupt Latin-1 char
    // where the layout prints the real end medallion.
    const result = walkSlots(
      [slot(1, A), slot(1, B), slot(1, C), slot(2, D), slot(2, E)],
      [`${A + B}\u00FB`, D + E],
    )
    expect(result.slotAyah).toEqual([0, 0, 0, 1, 1])
    expect(result.slotEnd).toEqual([false, false, true, false, true])
    expect(result.ayahStartPage).toEqual([1, 2])
    expect(result.ayahEndPage).toEqual([1, 2])
    expect(result.anomalies).toHaveLength(1)
    expect(result.anomalies[0]).toMatchObject({ kind: "substitution", ayah: 1, page: 1 })
  })

  it("marks the previous slot as the end slot for trailing reference extras", () => {
    // 69:8 pattern: the reference carries one glyph more than the layout
    // prints at the very end of the ayah.
    const result = walkSlots([slot(1, A), slot(1, B), slot(2, C), slot(2, D)], [A + B + X, C + D])
    expect(result.slotAyah).toEqual([0, 0, 1, 1])
    expect(result.slotEnd).toEqual([false, true, false, true])
    expect(result.ayahEndPage).toEqual([1, 2])
    expect(result.anomalies).toHaveLength(1)
    expect(result.anomalies[0]).toMatchObject({ kind: "reference-extra", ayah: 1, page: 1 })
  })

  it("reports layout extras without consuming reference glyphs", () => {
    const result = walkSlots([slot(1, A), slot(1, Z), slot(1, B)], [A + B])
    expect(result.slotAyah).toEqual([0, 0, 0])
    expect(result.slotEnd).toEqual([false, false, true])
    expect(result.anomalies).toHaveLength(1)
    expect(result.anomalies[0]).toMatchObject({ kind: "layout-extra", ayah: 1 })
  })

  it("throws when a slot would span an ayah boundary", () => {
    expect(() => walkSlots([slot(1, A + B)], [A, B])).toThrow(/spans an ayah boundary/)
  })

  it("throws on empty slots", () => {
    expect(() => walkSlots([slot(1, "")], [A])).toThrow(/empty slot/)
  })

  it("exhausts the reference across many ayahs", () => {
    const streams = [A + B, C + D, E + g(5)]
    const slots = [slot(1, A), slot(1, B), slot(1, C + D), slot(1, E), slot(1, g(5))]
    const result = walkSlots(slots, streams)
    expect(result.slotAyah).toEqual([0, 0, 1, 2, 2])
    expect(result.slotEnd).toEqual([false, true, true, false, true])
    expect(result.anomalies).toEqual([])
  })
})

describe("isQcfGlyph", () => {
  it("accepts the Arabic Presentation Forms-A range", () => {
    expect(isQcfGlyph("\uFB50")).toBe(true)
    expect(isQcfGlyph("\uFDFF")).toBe(true)
  })

  it("rejects everything outside it", () => {
    expect(isQcfGlyph("\u00FB")).toBe(false) // the corrupt char in the reference
    expect(isQcfGlyph("\uFB4F")).toBe(false) // just below the range
    expect(isQcfGlyph("\uFE00")).toBe(false) // just above the range
    expect(isQcfGlyph("A")).toBe(false)
  })
})

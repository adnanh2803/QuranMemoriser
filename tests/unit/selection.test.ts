import { describe, expect, it } from "vitest"

import type {
  CommandContext,
  WordIdentity,
} from "../../src/lib/features/mushaf/data/mushaf-repository"
import {
  ClearSelection,
  ExtendRun,
  type RunCandidate,
  type SelectionCommand,
  SelectionEngine,
  TapRun,
} from "../../src/lib/features/mushaf/model/selection.svelte"

/**
 * A context over the first four surahs of the Quran (7 + 286 + 200 + 176),
 * the same arithmetic the repository derives from the surah index, plus a
 * word ledger fixture: page 1 holds Al-Fatihah's opening verses, page 2 the
 * rest. Slot totals count each verse's end medallion as its last slot.
 */
const VERSE_COUNTS = [7, 286, 200, 176]

const VERSE_SLOTS: Record<string, number> = {
  "1:1": 5,
  "1:2": 5,
  "1:3": 3,
  "1:4": 4,
  "1:7": 9,
  "2:1": 5,
  "2:2": 4,
  "2:286": 6,
  "3:1": 5,
}

const SLOT_INDEX: Record<string, number> = {
  "1:A1": 1,
  "1:A2": 2,
  "1:A3": 3,
  "1:A4": 4,
  "1:A5": 5,
  "1:B1": 1,
  "1:B2": 2,
  "1:B3": 3,
  "1:B4": 4,
  "1:B5": 5,
  "1:C1": 1,
  "1:C2": 2,
  "1:C3": 3,
  "1:D1": 1,
  "1:D2": 2,
  "1:D3": 3,
  "1:D4": 4,
  "2:G1": 1,
  "2:G4": 4,
}

const context: CommandContext = {
  indexOf(key: string): number | undefined {
    const [surah, ayah] = key.split(":").map(Number) as [number, number]
    const count = VERSE_COUNTS[surah - 1]
    if (count === undefined || ayah < 1 || ayah > count) return undefined
    let base = 0
    for (let s = 1; s < surah; s++) base += VERSE_COUNTS[s - 1] ?? 0
    return base + ayah
  },
  keysBetween(fromIndex: number, toIndex: number): string[] {
    const keys: string[] = []
    let base = 0
    for (let surah = 1; surah <= VERSE_COUNTS.length; surah++) {
      const count = VERSE_COUNTS[surah - 1] ?? 0
      const first = Math.max(base + 1, fromIndex)
      const last = Math.min(base + count, toIndex)
      for (let ayah = first; ayah <= last; ayah++) keys.push(`${surah}:${ayah - base}`)
      base += count
    }
    return keys
  },
  wordIndex(word: WordIdentity): number | undefined {
    return SLOT_INDEX[`${word.page}:${word.glyph}`]
  },
  verseWordCount(key: string): number | undefined {
    return VERSE_SLOTS[key]
  },
}

function run(engine: SelectionEngine, command: SelectionCommand): void {
  command.execute(engine, context)
}

/** The i-th printed slot of a verse. */
const slot = (surah: number, ayah: number, page: number, glyph: string): RunCandidate => ({
  kind: "word",
  word: { surah, ayah, page, glyph },
})

describe("SelectionEngine", () => {
  it("starts empty", () => {
    const engine = new SelectionEngine()
    expect(engine.size).toBe(0)
    expect(engine.run).toBeNull()
    expect(engine.pending).toBeNull()
    expect(engine.verseCount).toBe(0)
  })
})

describe("TapRun", () => {
  it("marks a tapped word as the selection's start", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun(slot(1, 1, 1, "A2")))
    expect(engine.pending).toEqual({ surah: 1, ayah: 1, word: 2 })
    expect(engine.run).toBeNull()
    // The marked word alone reads as selected while it waits.
    expect(engine.isWordSelected({ surah: 1, ayah: 1, word: 2 })).toBe(true)
    expect(engine.isWordSelected({ surah: 1, ayah: 1, word: 3 })).toBe(false)
  })

  it("completes the range on the second tap, in either order", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun(slot(1, 1, 1, "A2")))
    run(engine, new TapRun(slot(1, 1, 1, "A4")))
    expect(engine.pending).toBeNull()
    expect(engine.run).toEqual({
      start: { surah: 1, ayah: 1, word: 2 },
      end: { surah: 1, ayah: 1, word: 4 },
    })
    expect(engine.size).toBe(3)

    const backwards = new SelectionEngine()
    run(backwards, new TapRun(slot(1, 1, 1, "A4")))
    run(backwards, new TapRun(slot(1, 1, 1, "A2")))
    expect(backwards.run).toEqual({
      start: { surah: 1, ayah: 1, word: 2 },
      end: { surah: 1, ayah: 1, word: 4 },
    })
  })

  it("completes a one-word selection when the second tap hits the same slot", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun(slot(1, 1, 1, "A2")))
    run(engine, new TapRun(slot(1, 1, 1, "A2")))
    expect(engine.run).toEqual({
      start: { surah: 1, ayah: 1, word: 2 },
      end: { surah: 1, ayah: 1, word: 2 },
    })
    expect(engine.size).toBe(1)
    expect(engine.wholeVerses).toBe(false)
  })

  it("completes through a verse's end medallion", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun(slot(1, 1, 1, "A2")))
    run(engine, new TapRun({ kind: "verse", key: "1:1" }))
    expect(engine.run).toEqual({
      start: { surah: 1, ayah: 1, word: 1 },
      end: { surah: 1, ayah: 1, word: 5 },
    })
    expect(engine.wholeVerses).toBe(true)
    expect(engine.verseKeys()).toEqual(["1:1"])
  })

  it("treats the verse-end medallion as the whole verse, as a word tap", () => {
    const engine = new SelectionEngine()
    // A5 is 1:1's fifth slot — its end medallion, the ayah number.
    run(engine, new TapRun(slot(1, 1, 1, "A5")))
    expect(engine.pending).toBeNull()
    expect(engine.wholeVerses).toBe(true)
    expect(engine.verseKeys()).toEqual(["1:1"])
    expect(engine.size).toBe(5)
  })

  it("completes through a printed row", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun(slot(1, 3, 1, "C1")))
    run(
      engine,
      new TapRun({
        kind: "row",
        first: { surah: 1, ayah: 3, page: 1, glyph: "C3" },
        last: { surah: 1, ayah: 4, page: 1, glyph: "D3" },
      }),
    )
    expect(engine.verseKeys()).toEqual(["1:3", "1:4"])
    expect(engine.size).toBe(6)
    expect(engine.wholeVerses).toBe(false)
  })

  it("selects a whole verse at once from the ayah list", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun({ kind: "verse", key: "2:1" }))
    expect(engine.pending).toBeNull()
    expect(engine.size).toBe(5)
    expect(engine.wholeVerses).toBe(true)
    expect(engine.verseKeys()).toEqual(["2:1"])
  })

  it("selects a whole row at once", () => {
    const engine = new SelectionEngine()
    run(
      engine,
      new TapRun({
        kind: "row",
        first: { surah: 1, ayah: 3, page: 1, glyph: "C3" },
        last: { surah: 1, ayah: 4, page: 1, glyph: "D3" },
      }),
    )
    expect(engine.verseKeys()).toEqual(["1:3", "1:4"])
    expect(engine.size).toBe(4)
  })

  it("grows the selection when tapping another row's circle", () => {
    const engine = new SelectionEngine()
    run(
      engine,
      new TapRun({
        kind: "row",
        first: { surah: 1, ayah: 4, page: 1, glyph: "D1" },
        last: { surah: 1, ayah: 4, page: 1, glyph: "D4" },
      }),
    )
    run(
      engine,
      new TapRun({
        kind: "row",
        first: { surah: 1, ayah: 3, page: 1, glyph: "C3" },
        last: { surah: 1, ayah: 4, page: 1, glyph: "D3" },
      }),
    )
    expect(engine.run).toEqual({
      start: { surah: 1, ayah: 3, word: 3 },
      end: { surah: 1, ayah: 4, word: 4 },
    })
    expect(engine.size).toBe(5)
    expect(engine.wholeVerses).toBe(false)
  })

  it("accumulates rows in either order", () => {
    const engine = new SelectionEngine()
    run(
      engine,
      new TapRun({
        kind: "row",
        first: { surah: 1, ayah: 3, page: 1, glyph: "C3" },
        last: { surah: 1, ayah: 4, page: 1, glyph: "D3" },
      }),
    )
    run(
      engine,
      new TapRun({
        kind: "row",
        first: { surah: 1, ayah: 4, page: 1, glyph: "D1" },
        last: { surah: 1, ayah: 4, page: 1, glyph: "D4" },
      }),
    )
    expect(engine.run).toEqual({
      start: { surah: 1, ayah: 3, word: 3 },
      end: { surah: 1, ayah: 4, word: 4 },
    })
    expect(engine.size).toBe(5)
  })

  it("accumulates whole verses into one run", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun({ kind: "verse", key: "2:1" }))
    run(engine, new TapRun({ kind: "verse", key: "2:2" }))
    expect(engine.run).toEqual({
      start: { surah: 2, ayah: 1, word: 1 },
      end: { surah: 2, ayah: 2, word: 4 },
    })
    expect(engine.wholeVerses).toBe(true)
    expect(engine.verseKeys()).toEqual(["2:1", "2:2"])
    expect(engine.size).toBe(9)
  })

  it("dismisses the selection when tapping a row inside it", () => {
    const engine = new SelectionEngine()
    const row: RunCandidate = {
      kind: "row",
      first: { surah: 1, ayah: 3, page: 1, glyph: "C3" },
      last: { surah: 1, ayah: 4, page: 1, glyph: "D3" },
    }
    run(engine, new TapRun(row))
    run(engine, new TapRun(row))
    expect(engine.run).toBeNull()
    expect(engine.size).toBe(0)
  })

  it("dismisses the selection when tapping inside it", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun({ kind: "verse", key: "2:1" }))
    run(engine, new TapRun({ kind: "verse", key: "2:1" }))
    expect(engine.size).toBe(0)
    expect(engine.run).toBeNull()
  })

  it("marks a new start when tapping a word outside the selection", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun({ kind: "verse", key: "2:1" }))
    run(engine, new TapRun(slot(2, 2, 2, "G1")))
    expect(engine.pending).toEqual({ surah: 2, ayah: 2, word: 1 })
    expect(engine.run).toBeNull()
  })

  it("ignores a slot the ledger does not know", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun(slot(1, 1, 1, "ZZ")))
    expect(engine.size).toBe(0)
    expect(engine.pending).toBeNull()
  })
})

describe("ExtendRun", () => {
  it("extends from the marked start through a later word", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun(slot(1, 1, 1, "A2")))
    run(engine, new ExtendRun(slot(1, 3, 1, "C2")))
    expect(engine.verseKeys()).toEqual(["1:1", "1:2", "1:3"])
    expect(engine.size).toBe(11)
    expect(engine.wholeVerses).toBe(false)
  })

  it("extends a finished selection", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun({ kind: "verse", key: "2:1" }))
    run(engine, new ExtendRun(slot(2, 2, 2, "G4")))
    expect(engine.run).toEqual({
      start: { surah: 2, ayah: 1, word: 1 },
      end: { surah: 2, ayah: 2, word: 4 },
    })
    expect(engine.wholeVerses).toBe(true)
    expect(engine.size).toBe(9)
  })

  it("extends through a row's far edge", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun(slot(1, 1, 1, "A2")))
    run(
      engine,
      new ExtendRun({
        kind: "row",
        first: { surah: 1, ayah: 4, page: 1, glyph: "D1" },
        last: { surah: 1, ayah: 4, page: 1, glyph: "D4" },
      }),
    )
    expect(engine.verseKeys()).toEqual(["1:1", "1:2", "1:3", "1:4"])
    expect(engine.wholeVerses).toBe(false)
  })

  it("marks a start like a plain tap when nothing exists yet", () => {
    const engine = new SelectionEngine()
    run(engine, new ExtendRun(slot(1, 1, 1, "A2")))
    expect(engine.pending).toEqual({ surah: 1, ayah: 1, word: 2 })
  })

  it("selects a whole verse when nothing exists yet", () => {
    const engine = new SelectionEngine()
    run(engine, new ExtendRun({ kind: "verse", key: "2:1" }))
    expect(engine.size).toBe(5)
    expect(engine.wholeVerses).toBe(true)
  })
})

describe("ClearSelection", () => {
  it("empties everything, the marked start included", () => {
    const engine = new SelectionEngine()
    run(engine, new TapRun(slot(1, 1, 1, "A2")))
    run(engine, new ClearSelection())
    expect(engine.pending).toBeNull()
    run(engine, new TapRun({ kind: "verse", key: "2:1" }))
    run(engine, new ClearSelection())
    expect(engine.size).toBe(0)
    expect(engine.run).toBeNull()
  })
})

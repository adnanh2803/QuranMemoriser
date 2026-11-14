import { describe, expect, it } from "vitest"

import { verseKey } from "../../src/lib/domain/schemas"
import type { CommandContext } from "../../src/lib/features/mushaf/data/mushaf-repository"
import {
  ClearSelection,
  ExtendToAyah,
  type SelectionCommand,
  SelectionEngine,
  SelectRange,
  TapAyah,
} from "../../src/lib/features/mushaf/model/selection.svelte"

/**
 * A context over the first four surahs of the Quran (7 + 286 + 200 + 176),
 * the same arithmetic the repository derives from the surah index.
 */
const VERSE_COUNTS = [7, 286, 200, 176]

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
      for (let ayah = first; ayah <= last; ayah++) keys.push(verseKey(surah, ayah - base))
      base += count
    }
    return keys
  },
}

function run(engine: SelectionEngine, command: SelectionCommand): void {
  command.execute(engine, context)
}

describe("SelectionEngine", () => {
  it("starts empty", () => {
    const engine = new SelectionEngine()
    expect(engine.size).toBe(0)
    expect(engine.keys()).toEqual([])
    expect(engine.anchorKey).toBeNull()
  })

  it("selects and deselects an ayah, tracking the anchor", () => {
    const engine = new SelectionEngine()
    engine.select("2:255")
    expect(engine.has("2:255")).toBe(true)
    expect(engine.anchorKey).toBe("2:255")
    engine.deselect("2:255")
    expect(engine.size).toBe(0)
    expect(engine.anchorKey).toBeNull()
  })

  it("replaces the whole selection", () => {
    const engine = new SelectionEngine()
    engine.select("1:1")
    engine.replace(["2:1", "2:2"], "2:1")
    expect(engine.keys()).toEqual(["2:1", "2:2"])
    expect(engine.has("1:1")).toBe(false)
    engine.clear()
    expect(engine.size).toBe(0)
  })
})

describe("TapAyah", () => {
  it("selects a tapped ayah", () => {
    const engine = new SelectionEngine()
    run(engine, new TapAyah("1:1"))
    expect(engine.keys()).toEqual(["1:1"])
  })

  it("deselects a second tap of the same ayah", () => {
    const engine = new SelectionEngine()
    run(engine, new TapAyah("1:1"))
    run(engine, new TapAyah("1:1"))
    expect(engine.size).toBe(0)
  })

  it("tapping a second ayah keeps both and moves the anchor", () => {
    const engine = new SelectionEngine()
    run(engine, new TapAyah("1:1"))
    run(engine, new TapAyah("1:3"))
    expect(engine.keys()).toEqual(["1:1", "1:3"])
    expect(engine.anchorKey).toBe("1:3")
  })
})

describe("ExtendToAyah", () => {
  it("selects the whole range between anchor and tap in either direction", () => {
    const engine = new SelectionEngine()
    run(engine, new TapAyah("2:1"))
    run(engine, new ExtendToAyah("2:5"))
    expect(engine.keys()).toEqual(["2:1", "2:2", "2:3", "2:4", "2:5"])

    const backwards = new SelectionEngine()
    run(backwards, new TapAyah("2:5"))
    run(backwards, new ExtendToAyah("2:1"))
    expect(backwards.keys()).toEqual(["2:1", "2:2", "2:3", "2:4", "2:5"])
    expect(backwards.anchorKey).toBe("2:5")
  })

  it("spans surah boundaries", () => {
    const engine = new SelectionEngine()
    run(engine, new TapAyah("1:7"))
    run(engine, new ExtendToAyah("2:2"))
    expect(engine.keys()).toEqual(["1:7", "2:1", "2:2"])
  })

  it("acts like a tap when there is no anchor", () => {
    const engine = new SelectionEngine()
    run(engine, new ExtendToAyah("3:14"))
    expect(engine.keys()).toEqual(["3:14"])
  })

  it("falls back to a tap when the anchor left the selection", () => {
    const engine = new SelectionEngine()
    run(engine, new TapAyah("1:1"))
    run(engine, new ClearSelection())
    run(engine, new ExtendToAyah("3:1"))
    expect(engine.keys()).toEqual(["3:1"])
  })
})

describe("SelectRange", () => {
  it("selects an explicit run, anchored at its start", () => {
    const engine = new SelectionEngine()
    run(engine, new SelectRange("2:286", "3:1"))
    expect(engine.keys()).toEqual(["2:286", "3:1"])
    expect(engine.anchorKey).toBe("2:286")
  })
})

describe("ClearSelection", () => {
  it("empties everything", () => {
    const engine = new SelectionEngine()
    run(engine, new TapAyah("1:1"))
    run(engine, new TapAyah("2:3"))
    run(engine, new ClearSelection())
    expect(engine.size).toBe(0)
    expect(engine.anchorKey).toBeNull()
  })
})

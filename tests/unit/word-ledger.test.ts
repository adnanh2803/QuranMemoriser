import { describe, expect, it } from "vitest"

import type { PageChunk } from "../../src/lib/domain/schemas"
import {
  buildWordIndex,
  ledgerFromWordIndex,
} from "../../src/lib/features/mushaf/model/word-ledger"

/** Two pages: 1:1 spans them, 1:2 starts on the second. */
const pageOne: PageChunk = {
  page: 1,
  lines: [
    {
      kind: "words",
      line: 2,
      words: [
        { g: "A1", s: 1, a: 1 },
        { g: "A2", s: 1, a: 1 },
        { g: "A5", s: 1, a: 1, e: true },
      ],
    },
    { kind: "basmalah", line: 3, glyphs: "X|Y" },
  ],
}

const pageTwo: PageChunk = {
  page: 2,
  lines: [
    {
      kind: "words",
      line: 1,
      words: [
        { g: "A6", s: 1, a: 1 },
        { g: "A7", s: 1, a: 1, e: true },
        { g: "B1", s: 1, a: 2 },
      ],
    },
  ],
}

describe("buildWordIndex", () => {
  it("numbers a verse's slots in printed order across pages", () => {
    const ledger = ledgerFromWordIndex(buildWordIndex([pageOne, pageTwo]))
    expect(ledger.wordIndex("1:A1")).toBe(1)
    expect(ledger.wordIndex("1:A5")).toBe(3)
    expect(ledger.wordIndex("2:A6")).toBe(4)
    expect(ledger.wordIndex("2:A7")).toBe(5)
    expect(ledger.verseWordCount("1:1")).toBe(5)
  })

  it("numbers the next verse from one", () => {
    const ledger = ledgerFromWordIndex(buildWordIndex([pageOne, pageTwo]))
    expect(ledger.wordIndex("2:B1")).toBe(1)
    expect(ledger.verseWordCount("1:2")).toBe(1)
  })

  it("ignores non-word lines and unknown keys", () => {
    const ledger = ledgerFromWordIndex(buildWordIndex([pageOne, pageTwo]))
    expect(ledger.wordIndex("1:X")).toBeUndefined()
    expect(ledger.verseWordCount("2:1")).toBeUndefined()
  })

  it("sorts chunks by page no matter the order given", () => {
    const ledger = ledgerFromWordIndex(buildWordIndex([pageTwo, pageOne]))
    expect(ledger.wordIndex("2:A6")).toBe(4)
    expect(ledger.verseWordCount("1:1")).toBe(5)
  })
})

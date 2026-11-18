import { describe, expect, it } from "vitest"
import {
  BookmarkRepository,
  type WordRangeBookmark,
} from "../../src/lib/features/mushaf/data/bookmark-repository"

function createStorage(initial: Record<string, string> = {}): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map(Object.entries(initial))
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value)
    },
  }
}

const RANGE: WordRangeBookmark = {
  start: { surah: 1, ayah: 1, word: 1 },
  end: { surah: 1, ayah: 2, word: 3 },
}

describe("BookmarkRepository", () => {
  it("adds unique bookmarks and removes one", () => {
    const repository = new BookmarkRepository(createStorage())
    expect(repository.add(["2:255", "2:255", "1:1"])).toEqual(["2:255", "1:1"])
    expect(repository.remove("2:255")).toEqual(["1:1"])
    expect(repository.list()).toEqual(["1:1"])
  })

  it("rejects malformed saved data", () => {
    const repository = new BookmarkRepository(createStorage({ "qm.bookmarks": "not-json" }))
    expect(() => repository.list()).toThrow("Saved bookmarks are not valid JSON")
  })

  it("rejects verse references outside the Quran", () => {
    const repository = new BookmarkRepository(createStorage({ "qm.bookmarks": '["999:999"]' }))
    expect(() => repository.list()).toThrow()
  })
})

describe("word range bookmarks", () => {
  it("adds a range once and removes it", () => {
    const repository = new BookmarkRepository(createStorage())
    expect(repository.addWordRange(RANGE)).toEqual([RANGE])
    expect(repository.addWordRange(RANGE)).toEqual([RANGE])
    expect(repository.listWordRanges()).toEqual([RANGE])
    expect(repository.removeWordRange(RANGE)).toEqual([])
  })

  it("keeps ayah and word bookmarks apart", () => {
    const repository = new BookmarkRepository(createStorage())
    repository.add(["2:255"])
    repository.addWordRange(RANGE)
    expect(repository.list()).toEqual(["2:255"])
    expect(repository.listWordRanges()).toEqual([RANGE])
  })

  it("rejects a reversed range", () => {
    const repository = new BookmarkRepository(createStorage())
    expect(() => repository.addWordRange({ start: RANGE.end, end: RANGE.start })).toThrow()
  })

  it("rejects malformed saved word bookmarks", () => {
    const repository = new BookmarkRepository(createStorage({ "qm.word-bookmarks": "not-json" }))
    expect(() => repository.listWordRanges()).toThrow("Saved word bookmarks are not valid JSON")
  })
})

import { describe, expect, it } from "vitest"
import { BookmarkRepository } from "../../src/lib/features/mushaf/data/bookmark-repository"

function createStorage(initial?: string): Pick<Storage, "getItem" | "setItem"> {
  let value = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next
    },
  }
}

describe("BookmarkRepository", () => {
  it("adds unique bookmarks and removes one", () => {
    const repository = new BookmarkRepository(createStorage())
    expect(repository.add(["2:255", "2:255", "1:1"])).toEqual(["2:255", "1:1"])
    expect(repository.remove("2:255")).toEqual(["1:1"])
    expect(repository.list()).toEqual(["1:1"])
  })

  it("rejects malformed saved data", () => {
    const repository = new BookmarkRepository(createStorage("not-json"))
    expect(() => repository.list()).toThrow("Saved bookmarks are not valid JSON")
  })

  it("rejects verse references outside the Quran", () => {
    const repository = new BookmarkRepository(createStorage('["999:999"]'))
    expect(() => repository.list()).toThrow()
  })
})

import { z } from "zod"
import { parseVerseKey, type VerseKey, verseKeySchema } from "../../../domain/schemas"
import type { SelectionRun, WordRef } from "../model/selection.svelte"

const STORAGE_KEY = "qm.bookmarks"
const WORD_RANGE_STORAGE_KEY = "qm.word-bookmarks"
const bookmarkKeySchema = verseKeySchema.refine((key) => parseVerseKey(key) !== null)
const bookmarkListSchema = z.array(bookmarkKeySchema)
const wordRefSchema = z.object({
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().positive(),
  word: z.number().int().positive(),
})
const wordRangeSchema = z
  .object({ start: wordRefSchema, end: wordRefSchema })
  .refine(({ start, end }) => compareRefs(start, end) <= 0, "Word range must be in mushaf order")
const wordRangeListSchema = z.array(wordRangeSchema)

export interface WordRangeBookmark extends SelectionRun {}

function compareRefs(a: WordRef, b: WordRef): number {
  return a.surah - b.surah || a.ayah - b.ayah || a.word - b.word
}

export function wordRangeBookmarkKey(range: WordRangeBookmark): string {
  return `${range.start.surah}:${range.start.ayah}:${range.start.word}-${range.end.surah}:${range.end.ayah}:${range.end.word}`
}

/** Persistent collection of bookmarked ayahs, stored locally for offline use. */
export class BookmarkRepository {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem"> = localStorage) {}

  list(): VerseKey[] {
    const raw = this.storage.getItem(STORAGE_KEY)
    if (raw === null) return []
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch (error) {
      throw new Error("Saved bookmarks are not valid JSON", { cause: error })
    }
    return bookmarkListSchema.parse(value)
  }

  add(keys: Iterable<VerseKey>): VerseKey[] {
    const bookmarks = new Set(this.list())
    for (const key of keys) bookmarks.add(bookmarkKeySchema.parse(key))
    return this.save(bookmarks)
  }

  listWordRanges(): WordRangeBookmark[] {
    const raw = this.storage.getItem(WORD_RANGE_STORAGE_KEY)
    if (raw === null) return []
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch (error) {
      throw new Error("Saved word bookmarks are not valid JSON", { cause: error })
    }
    return wordRangeListSchema.parse(value)
  }

  addWordRange(range: WordRangeBookmark): WordRangeBookmark[] {
    const saved = this.listWordRanges()
    const parsed = wordRangeSchema.parse(range)
    const key = wordRangeBookmarkKey(parsed)
    if (!saved.some((item) => wordRangeBookmarkKey(item) === key)) saved.push(parsed)
    return this.saveWordRanges(saved)
  }

  removeWordRange(range: WordRangeBookmark): WordRangeBookmark[] {
    const key = wordRangeBookmarkKey(range)
    return this.saveWordRanges(
      this.listWordRanges().filter((item) => wordRangeBookmarkKey(item) !== key),
    )
  }

  remove(key: VerseKey): VerseKey[] {
    const bookmarks = new Set(this.list())
    bookmarks.delete(key)
    return this.save(bookmarks)
  }

  private save(bookmarks: Set<VerseKey>): VerseKey[] {
    const values = [...bookmarks]
    this.storage.setItem(STORAGE_KEY, JSON.stringify(values))
    return values
  }

  private saveWordRanges(bookmarks: WordRangeBookmark[]): WordRangeBookmark[] {
    this.storage.setItem(WORD_RANGE_STORAGE_KEY, JSON.stringify(bookmarks))
    return bookmarks
  }
}

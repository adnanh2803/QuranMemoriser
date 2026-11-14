import { z } from "zod"
import { parseVerseKey, type VerseKey, verseKeySchema } from "../../../domain/schemas"

const STORAGE_KEY = "qm.bookmarks"
const bookmarkKeySchema = verseKeySchema.refine((key) => parseVerseKey(key) !== null)
const bookmarkListSchema = z.array(bookmarkKeySchema)

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
}

import type { VerseKey } from "../../../domain/schemas"
import type { BookmarkRepository, WordRangeBookmark } from "../data/bookmark-repository"

/** Bookmark state and local persistence operations for the reader. */
export class ReaderBookmarks {
  saved = $state<VerseKey[]>([])
  wordRanges = $state<WordRangeBookmark[]>([])
  open = $state(false)

  readonly count = $derived(this.saved.length + this.wordRanges.length)

  constructor(private readonly repository: BookmarkRepository) {}

  load(): string | null {
    try {
      this.saved = this.repository.list()
      this.wordRanges = this.repository.listWordRanges()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  remove(key: VerseKey): string | null {
    try {
      this.saved = this.repository.remove(key)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  removeWordRange(range: WordRangeBookmark): string | null {
    try {
      this.wordRanges = this.repository.removeWordRange(range)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
}

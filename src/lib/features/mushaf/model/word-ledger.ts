/**
 * The word index: every printed slot's index within its verse and every
 * verse's slot total.
 *
 * Mushaf order (surah, ayah, printed position) is the global order of the
 * slots, so word-granular selection compares these indexes. The verse-end
 * medallion is a printed slot of its verse like the words — it is always the
 * verse's last slot, so its index is the verse's total.
 *
 * The index is built offline from the page chunks and shipped as one data
 * file (public/data/word-index.json), so the app resolves slot indexes from
 * a single fetch instead of waiting on all 604 chunks.
 */
import type { PageChunk, VerseKey } from "../../../domain/schemas.ts"
import { verseKey } from "../../../domain/schemas.ts"

/** The shipped word-index file (public/data/word-index.json). */
export interface WordIndexFile {
  /** Total printed slots per verse key: its words plus the end medallion. */
  verseSlots: Record<string, number>
  /** 1-based slot index within the verse, by `${page}:${glyph}`. */
  slotIndex: Record<string, number>
}

/** The app-facing ledger the selection commands read slot indexes from. */
export interface WordLedger {
  /** 1-based slot index of a word within its verse, by `${page}:${glyph}`. */
  wordIndex(key: string): number | undefined
  /** Total printed slots of a verse: its words plus the end medallion. */
  verseWordCount(key: VerseKey): number | undefined
}

/**
 * Build the index from page chunks. Chunks must be visited in page order —
 * a verse's slots are numbered as they print, across pages — so the builder
 * sorts defensively no matter what order it was handed.
 */
export function buildWordIndex(chunks: PageChunk[]): WordIndexFile {
  const slotIndex: Record<string, number> = {}
  const verseSlots: Record<string, number> = {}
  const ordered = [...chunks].sort((a, b) => a.page - b.page)
  for (const chunk of ordered) {
    for (const line of chunk.lines) {
      if (line.kind !== "words") continue
      for (const word of line.words) {
        const verse = verseKey(word.s, word.a)
        const index = (verseSlots[verse] ?? 0) + 1
        verseSlots[verse] = index
        slotIndex[`${chunk.page}:${word.g}`] = index
      }
    }
  }
  return { verseSlots, slotIndex }
}

/** The runtime ledger over a validated word-index file. */
export function ledgerFromWordIndex(file: WordIndexFile): WordLedger {
  return {
    wordIndex: (key) => file.slotIndex[key],
    verseWordCount: (key) => file.verseSlots[key],
  }
}

/**
 * Repository for the mushaf's offline data files (all precached by the
 * service worker): the 604 page chunks, the surah index, the ayah metadata
 * and the reader-wide constants. Every response is validated with the shared
 * zod schemas before it reaches the app.
 */
import { normalize } from "arabic-text-normalizer"
import {
  type AyahMeta,
  ayahsFileSchema,
  type MushafMeta,
  mushafMetaSchema,
  type PageChunk,
  pageChunkSchema,
  parseVerseKey,
  type SurahSummary,
  surahsFileSchema,
  type VerseKey,
  verseKey,
} from "../../../domain/schemas"

/** Keys for the verse-selection range commands, derived from the surah index. */
export interface CommandContext {
  /** 1-based global index of a verse key, or undefined if unknown. */
  indexOf(key: VerseKey): number | undefined
  /** Verse keys between two global indexes, inclusive, in mushaf order. */
  keysBetween(fromIndex: number, toIndex: number): VerseKey[]
}

export class MushafRepository {
  private readonly chunkPromises = new Map<number, Promise<PageChunk>>()
  private surahsPromise: Promise<SurahSummary[]> | null = null
  private ayahsPromise: Promise<AyahMeta[]> | null = null
  private metaPromise: Promise<MushafMeta> | null = null
  private searchIndexPromise: Promise<Array<{ ayah: AyahMeta; text: string }>> | null = null

  /** The layout chunk of one page, fetched once and cached. */
  pageChunk(page: number): Promise<PageChunk> {
    const cached = this.chunkPromises.get(page)
    if (cached) return cached
    const promise = fetch(`/data/pages/p${String(page).padStart(3, "0")}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status} for page ${page}`)
        return response.json()
      })
      .then((json: unknown) => pageChunkSchema.parse(json))
      .catch((error: unknown) => {
        this.chunkPromises.delete(page)
        throw error
      })
    this.chunkPromises.set(page, promise)
    return promise
  }

  /** The 114-surah index. */
  surahs(): Promise<SurahSummary[]> {
    this.surahsPromise ??= fetch("/data/surahs.json")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status} for surahs`)
        return response.json()
      })
      .then((json: unknown) => surahsFileSchema.parse(json))
    return this.surahsPromise
  }

  /** The 6236 ayah metadata rows (Uthmani text, pages, juz, …). */
  ayahs(): Promise<AyahMeta[]> {
    this.ayahsPromise ??= fetch("/data/ayahs.json")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status} for ayahs`)
        return response.json()
      })
      .then((json: unknown) => ayahsFileSchema.parse(json))
    return this.ayahsPromise
  }

  /** Search ayahs locally after normalizing Arabic diacritics and spelling. */
  async search(query: string, limit = 20): Promise<AyahMeta[]> {
    const needle = normalize(query, { stripHamza: true }).trim()
    if (!needle) return []
    this.searchIndexPromise ??= this.ayahs().then((ayahs) =>
      ayahs.map((ayah) => ({ ayah, text: normalize(ayah.text, { stripHamza: true }) })),
    )
    const index = await this.searchIndexPromise
    const matches: AyahMeta[] = []
    for (const entry of index) {
      if (entry.text.includes(needle)) {
        matches.push(entry.ayah)
        if (matches.length >= limit) break
      }
    }
    return matches
  }

  /** Reader-wide constants: juz start pages and the QCF v1 type scale. */
  meta(): Promise<MushafMeta> {
    this.metaPromise ??= fetch("/data/meta.json")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status} for meta`)
        return response.json()
      })
      .then((json: unknown) => mushafMetaSchema.parse(json))
    return this.metaPromise
  }

  /**
   * The juz a page sits in, from the layout's juz start pages. The running
   * head labels every sheet this way, so it must not wait on the 2 MB ayah
   * file.
   */
  juzOfPage(page: number, meta: MushafMeta): number {
    let juz = 1
    for (const [index, start] of meta.juzPages.entries()) {
      if (start <= page) juz = index + 1
    }
    return juz
  }

  /** The command context verse selection ranges are resolved against. */
  async commandContext(): Promise<CommandContext> {
    const surahs = await this.surahs()
    const baseOfSurah = (surah: number): number => {
      let base = 0
      for (const summary of surahs) {
        if (summary.surah >= surah) break
        base += summary.verseCount
      }
      return base
    }
    return {
      indexOf(key: VerseKey): number | undefined {
        const parsed = parseVerseKey(key)
        if (!parsed) return undefined
        const [surah, ayah] = parsed
        const summary = surahs.find((s) => s.surah === surah)
        if (!summary || ayah < 1 || ayah > summary.verseCount) return undefined
        return baseOfSurah(surah) + ayah
      },
      keysBetween(fromIndex: number, toIndex: number): VerseKey[] {
        const keys: VerseKey[] = []
        for (const summary of surahs) {
          const base = baseOfSurah(summary.surah)
          const first = Math.max(base + 1, fromIndex)
          const last = Math.min(base + summary.verseCount, toIndex)
          for (let ayah = first; ayah <= last; ayah++) {
            keys.push(verseKey(summary.surah, ayah - base))
          }
        }
        return keys
      },
    }
  }
}

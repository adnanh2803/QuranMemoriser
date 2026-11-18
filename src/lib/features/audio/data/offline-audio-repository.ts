/**
 * The offline audio store: the Cache API copy of EveryAyah's per-ayah MP3s.
 * Downloads are per surah and per reciter, so people can keep a single voice
 * for the surahs they are memorising instead of the entire Quran.
 */
import { wordTimingsPath } from "../model/word-timings"
import { ayahUrl, RECITERS, type Reciter } from "./audio-repository"

export const RECITATION_CACHE = "qm-recitation"
export const TIMING_CACHE = "qm-word-timings"

/** One reciter's saved audio for one surah. */
export interface CachedRecitation {
  surah: number
  reciterId: string
  /** The number of distinct ayah files present in the cache. */
  ayahs: number
}

export interface CachedAyahRef {
  surah: number
  reciterId: string
  ayah: number
}

/** Read one EveryAyah cache key, or null for anything else in the cache. */
export function parseCachedAyah(rawUrl: string): CachedAyahRef | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.hostname !== "everyayah.com") return null
  const match = /\/data\/([^/]+)\/(\d{6})\.mp3$/.exec(url.pathname)
  if (match === null) return null
  const reciter = RECITERS.find((item) => item.folder === match[1])
  const reference = match[2]
  if (reciter === undefined || reference === undefined) return null
  const surah = Number(reference.slice(0, 3))
  const ayah = Number(reference.slice(3))
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > 286) return null
  return { surah, reciterId: reciter.id, ayah }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError")
}

export class OfflineAudioRepository {
  constructor(
    private readonly cacheStorage: CacheStorage | null = typeof caches === "undefined"
      ? null
      : caches,
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
  ) {}

  /** Whether this browser can keep recitations in the Cache API. */
  get supported(): boolean {
    return this.cacheStorage !== null
  }

  /** The saved recitations grouped by surah and reciter. */
  async inventory(): Promise<CachedRecitation[]> {
    if (this.cacheStorage === null) return []
    const cache = await this.cacheStorage.open(RECITATION_CACHE)
    const grouped = new Map<string, CachedRecitation & { seen: Set<number> }>()
    for (const request of await cache.keys()) {
      const parsed = parseCachedAyah(request.url)
      if (parsed === null) continue
      const key = `${parsed.surah}:${parsed.reciterId}`
      const entry = grouped.get(key) ?? {
        surah: parsed.surah,
        reciterId: parsed.reciterId,
        ayahs: 0,
        seen: new Set<number>(),
      }
      if (entry.seen.has(parsed.ayah)) continue
      entry.seen.add(parsed.ayah)
      entry.ayahs += 1
      grouped.set(key, entry)
    }
    return [...grouped.values()]
      .map((entry) => ({
        surah: entry.surah,
        reciterId: entry.reciterId,
        ayahs: entry.ayahs,
      }))
      .sort((a, b) => a.surah - b.surah || a.reciterId.localeCompare(b.reciterId))
  }

  /**
   * Save one reciter's complete surah. Existing files are skipped, so a
   * retry after a network failure only fetches what is still missing.
   */
  async downloadReciter(
    reciter: Reciter,
    surah: number,
    verseCount: number,
    onProgress: (done: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.cacheStorage === null) {
      throw new Error("Offline downloads are not supported in this browser")
    }
    const cache = await this.cacheStorage.open(RECITATION_CACHE)
    let done = 0
    let next = 0
    let failure: Error | null = null

    const worker = async (): Promise<void> => {
      while (failure === null) {
        throwIfAborted(signal)
        const index = next++
        if (index >= verseCount) return
        const ayah = index + 1
        try {
          const url = ayahUrl(reciter, surah, ayah)
          if (!(await cache.match(url))) {
            const response = await this.fetcher(url, { mode: "cors", signal })
            if (!response.ok) {
              throw new Error(`${reciter.label}, ayah ${ayah}: HTTP ${response.status}`)
            }
            await cache.put(url, response)
          }
          done += 1
          onProgress(done, verseCount)
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error))
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(4, verseCount) }, worker))
    if (failure !== null) throw failure

    // Word-level playback needs the whole reciter map offline too. A timing
    // failure must not discard the audio that has already been saved.
    await this.cacheTimings(reciter)
  }

  /**
   * A blob URL for a saved ayah, or null when the network copy was not
   * downloaded. Playback uses this when the service worker is unavailable
   * or has not yet taken control, so saved audio still plays offline.
   */
  async localPlaybackUrl(url: string): Promise<string | null> {
    if (this.cacheStorage === null) return null
    try {
      const cache = await this.cacheStorage.open(RECITATION_CACHE)
      const response = await cache.match(url)
      if (response === undefined) return null
      return URL.createObjectURL(await response.blob())
    } catch {
      return null
    }
  }

  /** Remove one reciter's saved surah. Timing maps are shared, so they stay. */
  async removeSurahReciter(surah: number, reciterId: string): Promise<void> {
    if (this.cacheStorage === null) return
    const cache = await this.cacheStorage.open(RECITATION_CACHE)
    for (const request of await cache.keys()) {
      const parsed = parseCachedAyah(request.url)
      if (parsed?.surah === surah && parsed.reciterId === reciterId) {
        await cache.delete(request)
      }
    }
  }

  private async cacheTimings(reciter: Reciter): Promise<void> {
    const path = wordTimingsPath(reciter.id)
    if (path === null || this.cacheStorage === null) return
    try {
      const cache = await this.cacheStorage.open(TIMING_CACHE)
      if (await cache.match(path)) return
      const response = await this.fetcher(path)
      if (response.ok) await cache.put(path, response)
    } catch {
      // The recitation itself is already saved; the player will retry the map
      // the next time word-level playback is requested.
    }
  }
}

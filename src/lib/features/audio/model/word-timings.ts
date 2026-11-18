/** Word timing maps generated from quran-align's EveryAyah-aligned data. */
export type WordTimingSegment = [wordStart: number, wordEnd: number, startMs: number, endMs: number]
export type VerseWordTimings = Record<string, WordTimingSegment[]>

const filesByReciter: Record<string, string> = {
  alafasy: "alafasy",
  husary: "husary",
  minshawi: "minshawy",
  abdulbasit: "abdul-basit-murattal",
  "abdulbasit-mujawwad": "abdul-basit-mujawwad",
  shaatree: "shaatree",
  "hani-rifai": "hani-rifai",
  "husary-muallim": "husary-muallim",
  "minshawi-mujawwad": "minshawy-mujawwad",
  tablaway: "tablaway",
  shuraym: "shuraym",
}

const timingPromises = new Map<string, Promise<VerseWordTimings>>()

/**
 * The name shown to people. These maps let a selected phrase inside an ayah
 * play on its own, so "word-level playback" says what the data is for without
 * exposing the implementation word "timings".
 */
export const WORD_PLAYBACK_LABEL = "Word-level playback"

/** Where a reciter's word-timing map lives, or null when it has none. */
export function wordTimingsPath(reciterId: string): string | null {
  const file = filesByReciter[reciterId]
  return file ? `/data/audio-timings/${file}.json` : null
}

/** EveryAyah recordings in the pinned quran-align archive have word timings. */
export function hasWordTimings(reciterId: string): boolean {
  return filesByReciter[reciterId] !== undefined
}

export function wordTimingsFor(reciterId: string): Promise<VerseWordTimings> {
  const path = wordTimingsPath(reciterId)
  if (!path) return Promise.reject(new Error("Word-level playback is unavailable for this reciter"))
  let promise = timingPromises.get(path)
  if (!promise) {
    promise = fetch(path)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} loading word-level playback data`)
        }
        return response.json() as Promise<VerseWordTimings>
      })
      .catch((error: unknown) => {
        timingPromises.delete(path)
        throw error
      })
    timingPromises.set(path, promise)
  }
  return promise
}

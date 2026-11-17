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

/** EveryAyah recordings in the pinned quran-align archive have word timings. */
export function hasWordTimings(reciterId: string): boolean {
  return filesByReciter[reciterId] !== undefined
}

export function wordTimingsFor(reciterId: string): Promise<VerseWordTimings> {
  const file = filesByReciter[reciterId]
  if (!file) return Promise.reject(new Error("Word-level timing is unavailable for this reciter"))
  let promise = timingPromises.get(file)
  if (!promise) {
    promise = fetch(`/data/audio-timings/${file}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status} loading word timings`)
        return response.json() as Promise<VerseWordTimings>
      })
      .catch((error: unknown) => {
        timingPromises.delete(file)
        throw error
      })
    timingPromises.set(file, promise)
  }
  return promise
}

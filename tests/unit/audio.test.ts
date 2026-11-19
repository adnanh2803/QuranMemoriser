import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AyahMeta } from "../../src/lib/domain/schemas"
import {
  ayahUrl,
  RECITERS,
  reciterById,
  storedReciterId,
} from "../../src/lib/features/audio/data/audio-repository"
import { parseCachedAyah } from "../../src/lib/features/audio/data/offline-audio-repository"
import { AudioPlayer, type AudioTrack } from "../../src/lib/features/audio/model/player.svelte"
import {
  tracksForJuz,
  tracksForKeys,
  tracksForSelection,
  tracksForSurah,
} from "../../src/lib/features/audio/model/playlists"
import {
  buildSelectionPlaylist,
  selectionPlaybackLabel,
} from "../../src/lib/features/audio/model/selection-playback"
import {
  hasWordTimings,
  type VerseWordTimings,
  wordTimingsPath,
} from "../../src/lib/features/audio/model/word-timings"
import type {
  CommandContext,
  WordIdentity,
} from "../../src/lib/features/mushaf/data/mushaf-repository"
import { SelectionEngine } from "../../src/lib/features/mushaf/model/selection.svelte"

/** An index over the first three surahs (7 + 286 + 200) for key lookups. */
const VERSE_COUNTS = [7, 286, 200]

const context: CommandContext = {
  indexOf(key: string): number | undefined {
    const [surah, ayah] = key.split(":").map(Number) as [number, number]
    const count = VERSE_COUNTS[surah - 1]
    if (count === undefined || ayah < 1 || ayah > count) return undefined
    let base = 0
    for (let s = 1; s < surah; s++) base += VERSE_COUNTS[s - 1] ?? 0
    return base + ayah
  },
  keysBetween: () => [],
  wordIndex: (_word: WordIdentity) => undefined,
  verseWordCount: () => undefined,
}

/** One ayah metadata row, only the juz cut fields matter. */
function metaRow(surah: number, ayah: number, juz: number): AyahMeta {
  return {
    surah,
    ayah,
    page: 1,
    juz,
    hizb: 1,
    rubElHizb: 1,
    ruku: 1,
    manzil: 1,
    sajdah: null,
    text: "",
  }
}

/** The first three juz boundaries as mushaf order runs. */
const AYAHS: AyahMeta[] = [
  metaRow(1, 1, 1),
  metaRow(1, 2, 1),
  metaRow(1, 7, 2),
  metaRow(2, 1, 2),
  metaRow(2, 2, 3),
  metaRow(2, 3, 3),
]

class FakeAudio {
  listeners = new Map<string, Array<() => void>>()
  src = ""
  crossOrigin: string | null = null
  preload = ""
  ended = false
  playCount = 0
  currentTime = 0
  duration = Number.NaN
  readyState = 0

  addEventListener(type: string, listener: () => void): void {
    const existing = this.listeners.get(type) ?? []
    existing.push(listener)
    this.listeners.set(type, existing)
  }
  play(): Promise<void> {
    this.playCount += 1
    return Promise.resolve()
  }
  load(): void {}
  pause(): void {}
  removeAttribute(name: string): void {
    if (name === "src") this.src = ""
  }
  getAttribute(name: string): string | null {
    return name === "src" && this.src !== "" ? this.src : null
  }
  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener()
  }
}

const TRACKS: AudioTrack[] = [
  { key: "1:1", surah: 1, ayah: 1 },
  { key: "1:2", surah: 1, ayah: 2 },
]

function playerWith(tracks: AudioTrack[]): { player: AudioPlayer; audio: FakeAudio } {
  const audio = new FakeAudio()
  const player = new AudioPlayer(() => audio as unknown as HTMLAudioElement)
  player.play(tracks, { kind: "surah", label: "test" })
  audio.fire("playing")
  return { player, audio }
}

describe("playlist builders", () => {
  it("builds a surah playlist in printed order", () => {
    expect(tracksForSurah(2, 4).map((track) => track.key)).toEqual(["2:1", "2:2", "2:3", "2:4"])
  })

  it("builds a selection playlist from the command context", () => {
    const tracks = tracksForKeys(context, ["1:2", "2:286", "9:9"])
    expect(tracks.map((track) => track.key)).toEqual(["1:2", "2:286"])
    expect(tracks[0]).toEqual({ key: "1:2", surah: 1, ayah: 2 })
  })

  it("cuts a juz playlist exactly on the juz field", () => {
    expect(tracksForJuz(AYAHS, 2).map((track) => track.key)).toEqual(["1:7", "2:1"])
    expect(tracksForJuz(AYAHS, 1).map((track) => track.key)).toEqual(["1:1", "1:2"])
  })
})

/** Word slots per verse, numbered as the sheet draws them (medallion last). */
const wordContext: CommandContext = {
  ...context,
  verseWordCount(key: string): number | undefined {
    if (key === "1:1") return 5
    if (key === "1:2") return 4
    return undefined
  },
}

/** Word timings in the quran-align shape: zero-based slots, end exclusive. */
const TIMINGS: VerseWordTimings = {
  "1:1": [
    [0, 1, 1000, 2000],
    [1, 2, 2000, 3000],
    [2, 3, 3000, 4000],
    [3, 4, 4000, 5000],
  ],
  "1:2": [
    [0, 1, 0, 1000],
    [1, 2, 1000, 2000],
    [2, 3, 2000, 3000],
  ],
}

describe("selection clips", () => {
  it("plays whole verses uncut", () => {
    const run = { start: { surah: 1, ayah: 1, word: 1 }, end: { surah: 1, ayah: 1, word: 5 } }
    expect(tracksForSelection(wordContext, ["1:1"], run, TIMINGS)).toEqual([
      { key: "1:1", surah: 1, ayah: 1 },
    ])
  })

  it("cuts a mid-verse run to its word timings with a little padding", () => {
    const run = { start: { surah: 1, ayah: 1, word: 2 }, end: { surah: 1, ayah: 1, word: 3 } }
    const tracks = tracksForSelection(wordContext, ["1:1"], run, TIMINGS)
    expect(tracks).toHaveLength(1)
    expect(tracks?.[0]?.startSeconds).toBeCloseTo(1.93)
    expect(tracks?.[0]?.endSeconds).toBeCloseTo(4.07)
  })

  it("clips only the boundary verses of a longer run", () => {
    const run = { start: { surah: 1, ayah: 1, word: 3 }, end: { surah: 1, ayah: 2, word: 2 } }
    const tracks = tracksForSelection(wordContext, ["1:1", "1:2"], run, TIMINGS)
    expect(tracks?.map((track) => track.key)).toEqual(["1:1", "1:2"])
    expect(tracks?.[0]?.startSeconds).toBeCloseTo(2.93)
    expect(tracks?.[0]?.endSeconds).toBeCloseTo(5.07)
    expect(tracks?.[1]?.startSeconds).toBe(0)
    expect(tracks?.[1]?.endSeconds).toBeCloseTo(2.07)
  })

  it("refuses a partial verse without word timings", () => {
    const run = { start: { surah: 1, ayah: 1, word: 2 }, end: { surah: 1, ayah: 1, word: 3 } }
    expect(tracksForSelection(wordContext, ["1:1"], run, {})).toBeNull()
  })

  it("refuses timings that leave a gap under the run", () => {
    const gapped: VerseWordTimings = {
      "1:1": [
        [0, 1, 1000, 2000],
        [2, 3, 3000, 4000],
      ],
    }
    const run = { start: { surah: 1, ayah: 1, word: 1 }, end: { surah: 1, ayah: 1, word: 3 } }
    expect(tracksForSelection(wordContext, ["1:1"], run, gapped)).toBeNull()
  })
})

describe("audio urls", () => {
  it("pads the surah and ayah to three digits", () => {
    expect(ayahUrl(RECITERS[0]!, 112, 4)).toBe(
      "https://everyayah.com/data/Alafasy_128kbps/112004.mp3",
    )
  })

  it("resolves reciters by id with the default fallback", () => {
    expect(reciterById("husary").folder).toBe("Husary_64kbps")
    expect(reciterById("unknown").id).toBe("alafasy")
  })
})

describe("offline recitations", () => {
  it("reads an EveryAyah cache key back into a surah, reciter and ayah", () => {
    expect(parseCachedAyah("https://everyayah.com/data/Alafasy_128kbps/002255.mp3")).toEqual({
      surah: 2,
      reciterId: "alafasy",
      ayah: 255,
    })
  })

  it("ignores cache keys that are not known recitations", () => {
    expect(parseCachedAyah("https://everyayah.com/data/Unknown/001001.mp3")).toBeNull()
    expect(parseCachedAyah("https://example.com/data/Alafasy_128kbps/001001.mp3")).toBeNull()
    expect(parseCachedAyah("https://everyayah.com/data/Alafasy_128kbps/001001.ogg")).toBeNull()
  })

  it("marks the one reciter without word-level playback", () => {
    expect(
      RECITERS.filter((reciter) => !hasWordTimings(reciter.id)).map((item) => item.id),
    ).toEqual(["sudais"])
    expect(wordTimingsPath("alafasy")).toBe("/data/audio-timings/alafasy.json")
    expect(wordTimingsPath("sudais")).toBeNull()
  })

  it("publishes a bitrate for every reciter", () => {
    expect(RECITERS.every((reciter) => reciter.bitrateKbps >= 64)).toBe(true)
  })
})

describe("audio player", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("plays the first track on start", () => {
    const { player, audio } = playerWith(TRACKS)
    expect(player.active).toBe(true)
    expect(player.current?.key).toBe("1:1")
    expect(audio.src).toBe("https://everyayah.com/data/Alafasy_128kbps/001001.mp3")
    expect(audio.crossOrigin).toBe("anonymous")
    expect(player.playing).toBe(true)
  })

  it("can load a playlist without auto-playing it", () => {
    const audio = new FakeAudio()
    const player = new AudioPlayer(() => audio as unknown as HTMLAudioElement)
    player.play(TRACKS, { kind: "selection", label: "test" }, false)
    expect(player.active).toBe(true)
    expect(player.current?.key).toBe("1:1")
    expect(audio.src).toContain("001001")
    expect(player.playing).toBe(false)
    expect(player.loading).toBe(false)
    expect(audio.playCount).toBe(0)
  })

  it("walks forward on ended and keeps the last track when the playlist ends", () => {
    const { player, audio } = playerWith(TRACKS)
    audio.fire("ended")
    expect(player.current?.key).toBe("1:2")
    expect(audio.src).toBe("https://everyayah.com/data/Alafasy_128kbps/001002.mp3")
    audio.fire("ended")
    expect(player.playing).toBe(false)
    expect(player.current?.key).toBe("1:2")
    expect(player.active).toBe(true)
    expect(audio.playCount).toBe(2)
  })

  it("starts a clipped track at its first selected word", () => {
    const audio = new FakeAudio()
    const player = new AudioPlayer(() => audio as unknown as HTMLAudioElement)
    player.play([{ key: "1:1", surah: 1, ayah: 1, startSeconds: 1.5, endSeconds: 3 }], {
      kind: "selection",
      label: "words",
    })
    expect(player.position).toBe(1.5)
    audio.fire("loadedmetadata")
    expect(audio.currentTime).toBe(1.5)
  })

  it("moves on when a clip reaches its end time", () => {
    const { player, audio } = playerWith([
      { key: "1:1", surah: 1, ayah: 1, startSeconds: 1, endSeconds: 2 },
      { key: "1:2", surah: 1, ayah: 2 },
    ])
    audio.currentTime = 2
    audio.fire("timeupdate")
    expect(player.current?.key).toBe("1:2")
    expect(audio.src).toContain("001002")
  })

  it("steps with the bar's buttons, bounded at the ends", () => {
    const { player, audio } = playerWith(TRACKS)
    player.prev()
    expect(player.current?.key).toBe("1:1")
    player.next()
    expect(audio.src).toContain("001002")
    player.next()
    expect(player.current?.key).toBe("1:2")
  })

  it("pauses and resumes through toggle", () => {
    const { player, audio } = playerWith(TRACKS)
    player.toggle()
    audio.fire("pause")
    expect(player.playing).toBe(false)
    player.toggle()
    audio.fire("playing")
    expect(player.playing).toBe(true)
    expect(audio.playCount).toBe(2)
  })

  it("switching reciters reloads the current ayah", () => {
    const { player, audio } = playerWith(TRACKS)
    player.setReciter("husary")
    expect(audio.src).toBe("https://everyayah.com/data/Husary_64kbps/001001.mp3")
    expect(player.reciterId).toBe("husary")
    expect(localStorage.getItem("qm.reciter")).toBe("husary")
  })

  it("restores the stored reciter on the next player", () => {
    localStorage.setItem("qm.reciter", "husary")
    const audio = new FakeAudio()
    const player = new AudioPlayer(() => audio as unknown as HTMLAudioElement)
    expect(player.reciterId).toBe("husary")
  })

  it("reports a missing offline copy without clearing the playlist", async () => {
    const { player, audio } = playerWith(TRACKS)
    audio.fire("error")
    await vi.waitFor(() => expect(player.error).toContain("Not saved offline"))
    expect(player.active).toBe(true)
  })

  it("falls back to a saved blob when the network copy fails", async () => {
    const audio = new FakeAudio()
    const player = new AudioPlayer(
      () => audio as unknown as HTMLAudioElement,
      async (url) => (url.endsWith("001001.mp3") ? "blob:saved-1" : null),
    )
    player.play(TRACKS, { kind: "surah", label: "test" })
    expect(audio.src).toContain("001001")

    audio.fire("error")
    await vi.waitFor(() => expect(audio.src).toBe("blob:saved-1"))
    expect(player.error).toBeNull()
    expect(player.current?.key).toBe("1:1")
    expect(audio.crossOrigin).toBeNull()

    audio.fire("playing")
    expect(player.playing).toBe(true)
  })

  it("reports a saved file that cannot be opened", async () => {
    const audio = new FakeAudio()
    const player = new AudioPlayer(
      () => audio as unknown as HTMLAudioElement,
      async () => "blob:damaged",
    )
    player.play(TRACKS, { kind: "surah", label: "test" })

    audio.fire("error")
    await vi.waitFor(() => expect(audio.src).toBe("blob:damaged"))
    audio.fire("error")
    expect(player.error).toContain("Saved audio could not open")
  })
})

describe("stored reciter", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("falls back to the default when nothing valid was saved", () => {
    localStorage.setItem("qm.reciter", "nonsense")
    expect(storedReciterId()).toBe("alafasy")
  })
})

describe("selection playback", () => {
  function engineFor(wholeVerses: boolean): SelectionEngine {
    const engine = new SelectionEngine()
    engine.setRun(
      {
        start: { surah: 1, ayah: 1, word: wholeVerses ? 1 : 2 },
        end: { surah: 1, ayah: 1, word: wholeVerses ? 7 : 3 },
      },
      wholeVerses ? 7 : 2,
      ["1:1"],
      wholeVerses,
    )
    return engine
  }

  it("names verse and word selections for the dock", () => {
    expect(selectionPlaybackLabel(engineFor(true))).toBe("1:1 selected")
    expect(selectionPlaybackLabel(engineFor(false))).toBe("2 words selected")
  })

  it("bumps a revision for every selection change", () => {
    const engine = new SelectionEngine()
    expect(engine.revision).toBe(0)
    engine.setPending({ surah: 1, ayah: 1, word: 1 })
    expect(engine.revision).toBe(1)
    engine.setRun(
      { start: { surah: 1, ayah: 1, word: 1 }, end: { surah: 1, ayah: 1, word: 7 } },
      7,
      ["1:1"],
      true,
    )
    expect(engine.revision).toBe(2)
    engine.clear()
    expect(engine.revision).toBe(3)
  })

  it("builds a whole-verse selection playlist for the current reciter", async () => {
    const result = await buildSelectionPlaylist(
      Promise.resolve(context),
      engineFor(true),
      "alafasy",
    )
    expect(result).toEqual({
      ok: true,
      tracks: [{ key: "1:1", surah: 1, ayah: 1 }],
      label: "1:1 selected",
    })
  })

  it("refuses a word selection for a reciter without word timings", async () => {
    const result = await buildSelectionPlaylist(
      Promise.resolve(context),
      engineFor(false),
      "sudais",
    )
    expect(result).toEqual({
      ok: false,
      error: "Word-level playback is unavailable for Abdurrahman As-Sudais",
    })
  })
})

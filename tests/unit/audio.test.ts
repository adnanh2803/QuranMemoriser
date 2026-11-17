import { beforeEach, describe, expect, it } from "vitest"

import type { AyahMeta } from "../../src/lib/domain/schemas"
import {
  RECITERS,
  ayahUrl,
  reciterById,
  storedReciterId,
} from "../../src/lib/features/audio/data/audio-repository"
import { tracksForJuz, tracksForKeys, tracksForSurah } from "../../src/lib/features/audio/model/playlists"
import { AudioPlayer, type AudioTrack } from "../../src/lib/features/audio/model/player.svelte"
import type { CommandContext, WordIdentity } from "../../src/lib/features/mushaf/data/mushaf-repository"

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

  addEventListener(type: string, listener: () => void): void {
    const existing = this.listeners.get(type) ?? []
    existing.push(listener)
    this.listeners.set(type, existing)
  }
  play(): Promise<void> {
    this.playCount += 1
    return Promise.resolve()
  }
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
    expect(tracks.map((track) => track.key)).toEqual(["1:2"])
    expect(tracks[0]).toEqual({ key: "1:2", surah: 1, ayah: 2 })
  })

  it("cuts a juz playlist exactly on the juz field", () => {
    expect(tracksForJuz(AYAHS, 2).map((track) => track.key)).toEqual(["1:7", "2:1"])
    expect(tracksForJuz(AYAHS, 1).map((track) => track.key)).toEqual(["1:1", "1:2"])
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

  it("walks forward on ended and stops at the playlist end", () => {
    const { player, audio } = playerWith(TRACKS)
    audio.fire("ended")
    expect(player.current?.key).toBe("1:2")
    expect(audio.src).toBe("https://everyayah.com/data/Alafasy_128kbps/001002.mp3")
    audio.fire("ended")
    expect(player.active).toBe(false)
    expect(audio.src).toBe("")
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

  it("reports load failures without clearing the playlist", () => {
    const { player, audio } = playerWith(TRACKS)
    audio.fire("error")
    expect(player.error).toContain("could not load")
    expect(player.active).toBe(true)
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

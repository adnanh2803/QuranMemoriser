/**
 * The audio player: one hidden HTMLAudioElement walking a playlist of
 * per-ayah files, advancing on ended and retaining the final track when done.
 * State lives in runes so the bar re-renders; the element is created
 * lazily on first play and kept across playlists — iOS only chains further
 * playback from an element that has already played under a user gesture.
 */
import type { VerseKey } from "../../../domain/schemas"
import { ayahUrl, reciterById, storedReciterId } from "../data/audio-repository"
import { hasWordTimings, wordTimingsFor } from "./word-timings"

/** One playable ayah, addressed the way the mushaf prints it. */
export interface AudioTrack {
  key: VerseKey
  surah: number
  ayah: number
  /** Optional clip bounds in seconds for word-range playback. */
  startSeconds?: number
  endSeconds?: number
}

/** What a playlist was started from, shown under the current ayah. */
export interface AudioSource {
  kind: "selection" | "surah" | "juz"
  label: string
}

export type RepeatMode = "off" | "track" | "playlist"
export type TimingStatus = "loading" | "ready" | "unavailable" | "error"

export class AudioPlayer {
  tracks = $state<AudioTrack[]>([])
  /** 0-based position in tracks; -1 while nothing is loaded. */
  index = $state(-1)
  playing = $state(false)
  loading = $state(false)
  position = $state(0)
  duration = $state(0)
  playbackRate = $state(1)
  repeatMode = $state<RepeatMode>("off")
  reciterId = $state(storedReciterId())
  timingStatus = $state<TimingStatus>("loading")
  source = $state<AudioSource | null>(null)
  error = $state<string | null>(null)

  #element: HTMLAudioElement | null = null
  #createElement: () => HTMLAudioElement
  #localSource: (url: string) => Promise<string | null>
  #finishedIndex = -1
  #sourceUrl: string | null = null
  #sourceIsLocal = false
  #localAttempted = false
  #loadId = 0
  #objectUrl: string | null = null

  /**
   * The element factory is injectable so tests can drive a fake. The local
   * source resolver returns a blob URL for a saved ayah, used as a fallback
   * when the service worker cannot serve the network URL offline.
   */
  constructor(
    createElement: () => HTMLAudioElement = () => new Audio(),
    localSource: (url: string) => Promise<string | null> = async () => null,
  ) {
    this.#createElement = createElement
    this.#localSource = localSource
    void this.loadTimings(this.reciterId)
  }

  active = $derived(this.index >= 0 && this.tracks.length > 0)
  current = $derived(this.tracks[this.index] ?? null)
  reciter = $derived(reciterById(this.reciterId))
  progress = $derived.by(() => {
    const track = this.current
    if (track === null) return 0
    const start = track.startSeconds ?? 0
    const end = track.endSeconds ?? this.duration
    return end > start ? Math.max(0, Math.min(1, (this.position - start) / (end - start))) : 0
  })
  elapsed = $derived(Math.max(0, this.position - (this.current?.startSeconds ?? 0)))
  playDuration = $derived(
    this.current?.endSeconds !== undefined
      ? Math.max(0, this.current.endSeconds - (this.current.startSeconds ?? 0))
      : this.duration,
  )

  /** Start a playlist from its first ayah, replacing whatever played. */
  play(tracks: AudioTrack[], source: AudioSource): void {
    if (tracks.length === 0) return
    this.tracks = tracks
    this.source = source
    this.error = null
    this.index = 0
    this.position = tracks[0]?.startSeconds ?? 0
    this.duration = 0
    this.#finishedIndex = -1
    this.load(true)
  }

  toggle(): void {
    if (!this.active) return
    if (this.playing) {
      this.element().pause()
      return
    }
    if (this.#finishedIndex === this.index) {
      this.load(true)
      return
    }
    this.resume()
  }

  next(): void {
    this.step(1)
  }

  prev(): void {
    this.step(-1)
  }

  /** Switch reciters: the current ayah restarts, the playlist position stays. */
  setReciter(id: string): void {
    const hasClips = this.tracks.some(
      (track) => track.startSeconds !== undefined || track.endSeconds !== undefined,
    )
    if (this.source?.kind === "selection" && hasClips && !hasWordTimings(id)) {
      this.error = `Word-level playback is unavailable for ${reciterById(id).label}`
      return
    }
    this.reciterId = id
    localStorage.setItem("qm.reciter", id)
    void this.loadTimings(id)
    if (this.active) this.load(this.playing)
  }

  reloadTimings(): void {
    void this.loadTimings(this.reciterId)
  }

  private async loadTimings(id: string): Promise<void> {
    if (!hasWordTimings(id)) {
      if (this.reciterId === id) this.timingStatus = "unavailable"
      return
    }
    this.timingStatus = "loading"
    try {
      await wordTimingsFor(id)
      if (this.reciterId === id) this.timingStatus = "ready"
    } catch {
      if (this.reciterId === id) this.timingStatus = "error"
    }
  }

  stop(): void {
    if (this.#element !== null) {
      this.#element.pause()
      this.#element.removeAttribute("src")
    }
    this.revokeObjectUrl()
    this.#sourceUrl = null
    this.#sourceIsLocal = false
    this.#localAttempted = false
    this.#loadId += 1
    this.tracks = []
    this.index = -1
    this.playing = false
    this.loading = false
    this.error = null
    this.source = null
    this.#finishedIndex = -1
    this.position = 0
    this.duration = 0
  }

  private element(): HTMLAudioElement {
    if (this.#element !== null) return this.#element
    const element = this.#createElement()
    element.preload = "auto"
    element.playbackRate = this.playbackRate
    // CORS mode: the service worker can then cache the response for offline
    // replay, which EveryAyah allows with its wildcard header. Downloaded
    // ayahs also have the Cache API blob fallback below.
    element.crossOrigin = "anonymous"
    element.addEventListener("playing", () => {
      this.loading = false
      this.playing = true
      this.error = null
      this.announce()
    })
    element.addEventListener("pause", () => {
      if (!element.ended) this.playing = false
    })
    element.addEventListener("waiting", () => {
      this.loading = true
    })
    element.addEventListener("loadedmetadata", () => {
      this.duration = Number.isFinite(element.duration) ? element.duration : 0
      this.position = this.current?.startSeconds ?? 0
    })
    element.addEventListener("ended", () => {
      this.finishTrack()
    })
    element.addEventListener("timeupdate", () => {
      this.position = element.currentTime
      this.duration = Number.isFinite(element.duration) ? element.duration : this.duration
      const track = this.current
      if (track?.endSeconds !== undefined && element.currentTime >= track.endSeconds) {
        this.finishTrack()
      }
    })
    element.addEventListener("error", () => {
      // An emptied src on stop must not read as a failure.
      if (this.#sourceUrl === null) return
      if (this.#sourceIsLocal || this.#localAttempted) {
        this.loading = false
        this.playing = false
        this.error = this.failureMessage()
        return
      }
      void this.tryLocalSource()
    })
    this.#element = element
    return element
  }

  private load(autoplay: boolean): void {
    const track = this.current
    if (track === null) return
    this.revokeObjectUrl()
    const source = ayahUrl(this.reciter, track.surah, track.ayah)
    this.#sourceUrl = source
    this.#sourceIsLocal = false
    this.#localAttempted = false
    this.#loadId += 1
    this.startSource(source, track, autoplay, false)
  }

  /**
   * The media request failed. If the ayah was downloaded, swap to its Cache
   * API blob so playback does not depend on the service worker having taken
   * control yet. This is the difference between "saved" and "playable" on a
   * first offline visit.
   */
  private async tryLocalSource(): Promise<void> {
    const source = this.#sourceUrl
    const track = this.current
    if (source === null || track === null || this.#localAttempted) return
    this.#localAttempted = true
    const loadId = this.#loadId
    this.loading = true
    this.error = null
    try {
      const local = await this.#localSource(source)
      if (loadId !== this.#loadId || this.current !== track || this.#sourceUrl !== source) {
        if (local !== null) this.revokeUrl(local)
        return
      }
      if (local === null) {
        this.loading = false
        this.playing = false
        this.error = this.failureMessage()
        return
      }
      this.#objectUrl = local
      this.#sourceIsLocal = true
      this.startSource(local, track, true, true)
    } catch {
      if (loadId !== this.#loadId) return
      this.loading = false
      this.playing = false
      this.error = this.failureMessage()
    }
  }

  private startSource(
    source: string,
    track: AudioTrack,
    autoplay: boolean,
    isLocal: boolean,
  ): void {
    const element = this.element()
    element.src = source
    this.position = track.startSeconds ?? 0
    this.duration = 0
    element.playbackRate = this.playbackRate
    this.#finishedIndex = -1
    if (track.startSeconds !== undefined && track.startSeconds > 0) {
      const seekToSelection = () => {
        if (element.src === source && this.current === track) {
          element.currentTime = track.startSeconds ?? 0
        }
      }
      if (element.readyState >= 1) seekToSelection()
      else element.addEventListener("loadedmetadata", seekToSelection, { once: true })
    }
    if (autoplay) {
      this.loading = true
      element.play().catch(() => {
        this.loading = false
        this.playing = false
        this.error = isLocal
          ? "Saved offline — tap Play to start"
          : "Playback could not start — tap Play to retry"
      })
    }
  }

  private failureMessage(): string {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false
    return offline
      ? "Not saved offline for this reciter"
      : "Audio could not load — check your connection"
  }

  private revokeObjectUrl(): void {
    if (this.#objectUrl === null) return
    this.revokeUrl(this.#objectUrl)
    this.#objectUrl = null
  }

  private revokeUrl(url: string): void {
    if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url)
  }

  private resume(): void {
    const element = this.element()
    // A retry is also a chance to find audio downloaded after the first
    // attempt failed, so reload a failed network source and look in the
    // offline cache again.
    if (!this.#sourceIsLocal) {
      this.#localAttempted = false
      if (element.error) {
        this.load(true)
        return
      }
    }
    this.loading = true
    element.play().catch(() => {
      this.loading = false
      this.playing = false
      this.error = "Playback could not start — tap Play to retry"
    })
  }

  private step(delta: number): void {
    const target = this.index + delta
    if (target < 0 || target >= this.tracks.length) return
    this.index = target
    this.load(true)
  }

  private finishTrack(): void {
    if (this.index < 0 || this.#finishedIndex === this.index) return
    this.#finishedIndex = this.index
    if (this.repeatMode === "track") {
      this.load(true)
      return
    }
    if (this.index < this.tracks.length - 1) {
      this.index += 1
      this.load(true)
    } else if (this.repeatMode === "playlist") {
      this.index = 0
      this.load(true)
    } else {
      const element = this.#element
      element?.pause()
      this.playing = false
      this.loading = false
      this.position = this.current?.endSeconds ?? this.duration
    }
  }

  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) return
    this.playbackRate = rate
    if (this.#element !== null) this.#element.playbackRate = rate
  }

  setRepeatMode(mode: RepeatMode): void {
    this.repeatMode = mode
  }

  seekFraction(fraction: number): void {
    const track = this.current
    if (track === null || !Number.isFinite(fraction)) return
    const start = track.startSeconds ?? 0
    const end = track.endSeconds ?? this.duration
    if (end <= start) return
    this.seekTo(start + Math.max(0, Math.min(1, fraction)) * (end - start))
  }

  seekBy(seconds: number): void {
    if (Number.isFinite(seconds)) this.seekTo(this.position + seconds)
  }

  private seekTo(seconds: number): void {
    const track = this.current
    const element = this.#element
    if (track === null || element === null) return
    const start = track.startSeconds ?? 0
    const end = track.endSeconds ?? this.duration
    if (end <= start) return
    const target = Math.max(start, Math.min(end, seconds))
    try {
      element.currentTime = target
      this.position = target
    } catch {
      // Seeking is unavailable until the browser has audio metadata.
    }
  }

  /** Lock-screen metadata and controls when the platform offers them. */
  private announce(): void {
    if (!("mediaSession" in navigator)) return
    const track = this.current
    if (track === null) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.key,
      artist: this.reciter.label,
      album: "QuranMemoriser",
    })
    navigator.mediaSession.setActionHandler("play", () => this.resume())
    navigator.mediaSession.setActionHandler("pause", () => this.element().pause())
    navigator.mediaSession.setActionHandler("previoustrack", () => this.step(-1))
    navigator.mediaSession.setActionHandler("nexttrack", () => this.step(1))
  }
}

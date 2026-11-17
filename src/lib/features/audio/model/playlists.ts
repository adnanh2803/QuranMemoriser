/**
 * Playlist builders: from a selection's verse keys, a whole surah, or a
 * whole juz to the ordered tracks the player walks. A juz is cut exactly
 * on the juz field of the shipped ayah rows, which run in mushaf order.
 */
import { parseVerseKey, verseKey, type AyahMeta, type VerseKey } from "../../../domain/schemas"
import type { CommandContext } from "../../mushaf/data/mushaf-repository"
import type { SelectionRun } from "../../mushaf/model/selection.svelte"
import type { AudioTrack } from "./player.svelte"
import type { VerseWordTimings } from "./word-timings"

/** The verses a selection covers, in mushaf order, dropping unknown keys. */
export function tracksForKeys(context: CommandContext, keys: VerseKey[]): AudioTrack[] {
  const tracks: AudioTrack[] = []
  for (const key of keys) {
    const parsed = parseVerseKey(key)
    if (parsed === null || context.indexOf(key) === undefined) continue
    const [surah, ayah] = parsed
    tracks.push({ key, surah, ayah })
  }
  return tracks
}

/** Build a selection playlist, clipping only its partial boundary verses. */
export function tracksForSelection(
  context: CommandContext,
  keys: VerseKey[],
  run: SelectionRun,
  timings: VerseWordTimings,
): AudioTrack[] | null {
  const startKey = verseKey(run.start.surah, run.start.ayah)
  const endKey = verseKey(run.end.surah, run.end.ayah)
  const tracks: AudioTrack[] = []

  for (const track of tracksForKeys(context, keys)) {
    const totalSlots = context.verseWordCount(track.key)
    if (totalSlots === undefined || totalSlots < 2) return null
    const firstWord = track.key === startKey ? run.start.word : 1
    const lastWord = track.key === endKey ? Math.min(run.end.word, totalSlots - 1) : totalSlots - 1
    if (firstWord <= 1 && lastWord >= totalSlots - 1) {
      tracks.push(track)
      continue
    }

    const segments = timings[track.key]
    if (!segments || firstWord < 1 || lastWord < firstWord) return null
    const wantedStart = firstWord - 1
    const wantedEnd = lastWord
    const matching = segments
      .filter(([from, to]) => from < wantedEnd && to > wantedStart)
      .sort((a, b) => a[0] - b[0])

    let coveredTo = wantedStart
    let startMs = Number.POSITIVE_INFINITY
    let endMs = 0
    for (const [from, to, start, end] of matching) {
      if (from > coveredTo) return null
      coveredTo = Math.max(coveredTo, to)
      startMs = Math.min(startMs, start)
      endMs = Math.max(endMs, end)
      if (coveredTo >= wantedEnd) break
    }
    if (coveredTo < wantedEnd || !Number.isFinite(startMs) || endMs <= startMs) return null

    // Keep a little breathing room around the estimated word boundaries.
    const paddingMs = 70
    tracks.push({
      ...track,
      startSeconds: Math.max(0, startMs - paddingMs) / 1000,
      endSeconds: (endMs + paddingMs) / 1000,
    })
  }
  return tracks
}

/** Every ayah of a surah, first to last. */
export function tracksForSurah(surah: number, verseCount: number): AudioTrack[] {
  const tracks: AudioTrack[] = []
  for (let ayah = 1; ayah <= verseCount; ayah++) {
    tracks.push({ key: verseKey(surah, ayah), surah, ayah })
  }
  return tracks
}

/** Every ayah of a juz, exactly on the shipped juz numbering. */
export function tracksForJuz(ayahs: AyahMeta[], juz: number): AudioTrack[] {
  return ayahs
    .filter((meta) => meta.juz === juz)
    .map((meta) => ({ key: verseKey(meta.surah, meta.ayah), surah: meta.surah, ayah: meta.ayah }))
}

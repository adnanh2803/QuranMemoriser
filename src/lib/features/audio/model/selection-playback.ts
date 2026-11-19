/**
 * Shared selection-to-playlist preparation. The selection banner uses it when
 * starting playback; the reader uses it again when the selection changes under
 * an open player, so both paths agree on clipping, wording and reciter support.
 */
import type { VerseKey } from "../../../domain/schemas"
import type { CommandContext } from "../../mushaf/data/mushaf-repository"
import type { SelectionEngine } from "../../mushaf/model/selection.svelte"
import { reciterById } from "../data/audio-repository"
import type { AudioTrack } from "./player.svelte"
import { tracksForKeys, tracksForSelection } from "./playlists"
import { hasWordTimings, wordTimingsFor } from "./word-timings"

/** Short wording for the selection itself, without the word "selected". */
export function selectionSummary(selection: SelectionEngine): string {
  if (!selection.wholeVerses) {
    return `${selection.size} ${selection.size === 1 ? "word" : "words"}`
  }
  const keys = selection.verseKeys()
  return keys.length === 1 ? (keys[0] ?? "Selection") : `${keys.length} verses`
}

/** Wording used by the selection dock and the player's selection label. */
export function selectionPlaybackLabel(selection: SelectionEngine): string {
  return `${selectionSummary(selection)} selected`
}

export type SelectionPlaylistResult =
  | { ok: true; tracks: AudioTrack[]; label: string }
  | { ok: false; error: string }
  | null

/**
 * Build the playlist for the current selection and reciter. Returns null while
 * a start is only pending; a failure carries a short message for the player.
 */
export async function buildSelectionPlaylist(
  context: Promise<CommandContext>,
  selection: SelectionEngine,
  reciterId: string,
): Promise<SelectionPlaylistResult> {
  const run = selection.run
  if (run === null) return null
  const keys: VerseKey[] = selection.verseKeys()
  if (keys.length === 0) return null

  const commandContext = await context
  let tracks = tracksForKeys(commandContext, keys)
  if (tracks.length === 0) return { ok: false, error: "No playable verses in this selection" }

  if (!selection.wholeVerses) {
    if (!hasWordTimings(reciterId)) {
      return {
        ok: false,
        error: `Word-level playback is unavailable for ${reciterById(reciterId).label}`,
      }
    }
    const timings = await wordTimingsFor(reciterId)
    const clipped = tracksForSelection(commandContext, keys, run, timings)
    if (!clipped) {
      return { ok: false, error: "Word timing is unavailable for part of this selection" }
    }
    tracks = clipped
  }

  return { ok: true, tracks, label: selectionPlaybackLabel(selection) }
}

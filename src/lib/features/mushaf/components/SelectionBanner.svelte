<!--
  The selection banner: what is selected, with copy and clear. It floats over
  the reading area and only exists while ayahs are selected.
-->
<script lang="ts">
import { parseVerseKey, type VerseKey } from "../../../domain/schemas"
import type { AudioPlayer } from "../../audio/model/player.svelte"
import { tracksForKeys, tracksForSelection } from "../../audio/model/playlists"
import { hasWordTimings, wordTimingsFor } from "../../audio/model/word-timings"
import type { BookmarkRepository, WordRangeBookmark } from "../data/bookmark-repository"
import type { CommandContext, MushafRepository } from "../data/mushaf-repository"
import type { SelectionEngine } from "../model/selection.svelte"

interface Props {
  selection: SelectionEngine
  repository: MushafRepository
  bookmarks: BookmarkRepository
  player: AudioPlayer
  /** The selection commands' context, resolved once playback starts. */
  context: Promise<CommandContext>
  /** Lifted above the audio bar while a playlist is loaded. */
  raised: boolean
  onBookmarks: (keys: VerseKey[]) => void
  onWordBookmarks: (ranges: WordRangeBookmark[]) => void
}

let {
  selection,
  repository,
  bookmarks,
  player,
  context,
  raised,
  onBookmarks,
  onWordBookmarks,
}: Props = $props()

let copied = $state<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const count = $derived(selection.size)
const pending = $derived(selection.pending)
/** The marked start's hint: where the range begins, and what comes next. */
const pendingLabel = $derived(
  pending ? `${pending.surah}:${pending.ayah} · word ${pending.word} — tap the end` : "",
)
const selectionLabel = $derived.by(() => {
  // A run that covers its verses from the first word to the end reads as
  // verses; anything shorter reads by its printed slots.
  if (!selection.wholeVerses) return `${count} ${count === 1 ? "word" : "words"} selected`
  const keys = selection.verseKeys()
  return keys.length === 1 ? `${keys[0]} selected` : `${keys.length} verses selected`
})

function flash(message: string): void {
  copied = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (copied = null), 2200)
}

async function copySelected(): Promise<void> {
  const keys = selection.verseKeys()
  if (keys.length === 0) return
  const [ayahs, surahs] = await Promise.all([repository.ayahs(), repository.surahs()])
  const byKey = new Map<string, string>()
  for (const ayah of ayahs) {
    byKey.set(`${ayah.surah}:${ayah.ayah}`, ayah.text)
  }
  const lines: string[] = []
  let openSurah = 0
  for (const key of keys) {
    const parsed = parseVerseKey(key)
    if (!parsed) continue
    const [surah, ayah] = parsed
    const summary = surahs.find((s) => s.surah === surah)
    if (summary && summary.surah !== openSurah) {
      openSurah = summary.surah
      lines.push(`— ${summary.name} (Surah ${summary.surah}) —`)
    }
    const text = byKey.get(key)
    if (text) lines.push(`${surah}:${ayah} ${text}`)
  }
  const copiedText = lines.join("\n")
  if (await writeClipboard(copiedText)) {
    flash(`Copied ${keys.length} ${keys.length === 1 ? "verse" : "verses"}`)
  } else {
    flash("Copy failed")
  }
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API unavailable (permissions or insecure context): fall back
    // to a transient textarea and the legacy command.
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    let ok = false
    try {
      ok = document.execCommand("copy")
    } catch {
      ok = false
    }
    textarea.remove()
    return ok
  }
}

function clearSelection(): void {
  selection.clear()
}

/** Play the selection's verses, verse by verse. */
async function playSelected(): Promise<void> {
  const keys = selection.verseKeys()
  if (keys.length === 0) return
  try {
    const commandContext = await context
    let tracks = tracksForKeys(commandContext, keys)
    if (tracks.length === 0) {
      flash("No playable verses in this selection")
      return
    }

    if (!selection.wholeVerses) {
      if (!hasWordTimings(player.reciterId)) {
        flash(`Word-level playback is unavailable for ${player.reciter.label}`)
        return
      }
      const run = selection.run
      if (!run) return
      const timings = await wordTimingsFor(player.reciterId)
      const selectedTracks = tracksForSelection(commandContext, keys, run, timings)
      if (!selectedTracks) {
        flash("Word timing is unavailable for part of this selection")
        return
      }
      tracks = selectedTracks
    }
    player.play(tracks, {
      kind: "selection",
      label: selection.wholeVerses
        ? keys.length === 1
          ? (keys[0] ?? "Selection")
          : `${keys.length} verses`
        : `${selection.size} selected words`,
    })
  } catch (error) {
    flash(error instanceof Error ? error.message : "Could not prepare recitation")
  }
}

function bookmarkSelected(): void {
  const keys = selection.verseKeys()
  try {
    if (!selection.wholeVerses && selection.run) {
      onWordBookmarks(bookmarks.addWordRange(selection.run))
      flash(`Bookmarked ${selection.size} ${selection.size === 1 ? "word" : "words"}`)
      return
    }
    onBookmarks(bookmarks.add(keys))
    flash(`Bookmarked ${keys.length} ${keys.length === 1 ? "verse" : "verses"}`)
  } catch (error) {
    flash(error instanceof Error ? error.message : String(error))
  }
}
</script>

{#if count > 0 || pending}
  <div
    class="pointer-events-none fixed {raised ? 'bottom-[20rem]' : 'bottom-6'} left-2 right-2 z-20 flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-hairline/60 bg-surface-raised/70 px-3 py-2 shadow-md backdrop-blur-sm sm:right-auto sm:left-1/2 sm:w-max sm:-translate-x-1/2 sm:flex-nowrap sm:gap-2 sm:rounded-full sm:pr-2 sm:pl-4 [@media(max-height:40rem)]:top-2 [@media(max-height:40rem)]:bottom-auto"
    role="status"
  >
    {#if pending}
      <span
        class="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold tracking-wide text-white uppercase"
      >
        Start
      </span>
      <span class="min-w-0 text-center text-sm text-ink sm:whitespace-nowrap">
        {pendingLabel}
      </span>
    {:else}
      <span class="min-w-0 text-center text-sm text-ink sm:whitespace-nowrap">
        {selectionLabel}
      </span>
    {/if}
    {#if !pending}
      <button
        class="pointer-events-auto inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-accent px-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onclick={playSelected}
        aria-label={selection.wholeVerses ? "Play selected verses" : "Play selected words"}
        title="Play selection"
      >
        <svg class="mr-1.5" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z"></path>
        </svg>
        Play
      </button>
      <button
        class="pointer-events-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-accent-soft hover:text-ink active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onclick={copySelected}
        aria-label="Copy selection"
        title="Copy selection"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2"></rect>
          <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"></path>
        </svg>
      </button>
      <button
        class="pointer-events-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-accent-soft hover:text-ink active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onclick={bookmarkSelected}
        aria-label="Bookmark selection"
        title="Bookmark selection"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.5L6 21V4.75z"></path>
        </svg>
      </button>
    {/if}
    <button
      class="pointer-events-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-accent-soft hover:text-ink active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      onclick={clearSelection}
      aria-label="Clear selection"
      title="Clear selection"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <path d="m7 7 10 10M17 7 7 17"></path>
      </svg>
    </button>
  </div>
{/if}

{#if copied !== null}
  <div
    class="fixed {raised ? 'bottom-[24rem]' : 'bottom-22'} left-2 right-2 z-20 mx-auto w-fit max-w-[calc(100vw-1rem)] rounded-full border border-hairline bg-surface px-4 py-2 text-center text-xs text-ink shadow-md sm:right-auto sm:left-1/2 sm:-translate-x-1/2 [@media(max-height:40rem)]:top-14 [@media(max-height:40rem)]:bottom-auto"
  >
    {copied}
  </div>
{/if}

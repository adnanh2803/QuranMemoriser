<!-- The recitation dock: position, transport, speed, repeat and reciter controls. -->
<script lang="ts">
import type { SurahSummary } from "../../../domain/schemas"
import type { SelectionEngine } from "../../mushaf/model/selection.svelte"
import { RECITERS } from "../data/audio-repository"
import type { AudioPlayer } from "../model/player.svelte"
import { selectionSummary } from "../model/selection-playback"
import { WORD_PLAYBACK_LABEL } from "../model/word-timings"

interface Props {
  player: AudioPlayer
  surahs: SurahSummary[]
  selection: SelectionEngine
}

let { player, surahs, selection }: Props = $props()

const selectionInfo = $derived(selection.run === null ? null : selectionSummary(selection))

const label = $derived.by(() => {
  const track = player.current
  if (track === null) return ""
  const summary = surahs.find((item) => item.surah === track.surah)
  return summary ? `${track.key} · ${summary.name}` : track.key
})

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`
}
</script>

{#if player.active}
  <section
    class="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 grid max-h-[calc(100dvh-5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[min(64rem,calc(100vw-1rem))] -translate-x-1/2 gap-4 overflow-y-auto overscroll-contain rounded-3xl border border-hairline/60 bg-surface-raised/70 p-4 shadow-xl backdrop-blur-md sm:bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:gap-5 sm:p-6"
    aria-label="Recitation player"
  >
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2.5">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 10v4h4l5 4V6l-5 4H3z"></path>
            <path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a9 9 0 0 1 0 11"></path>
          </svg>
        </div>
        <div class="min-w-0">
          <div class="flex min-w-0 items-baseline gap-2">
            <span class="truncate text-base font-semibold text-ink sm:text-lg">{label}</span>
            <span class="shrink-0 rounded-full bg-bg px-2 py-0.5 text-xs tabular-nums text-ink-muted">{player.index + 1} / {player.tracks.length}</span>
          </div>
          <div class="mt-0.5 truncate text-sm text-ink-muted">{player.error ?? player.source?.label ?? player.reciter.label}</div>
          {#if selectionInfo}
            <div class="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-ink-muted">
              <span class="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 font-medium text-accent">Selected</span>
              <span class="truncate">{selectionInfo}</span>
            </div>
          {/if}
        </div>
      </div>
      <button
        class="shrink-0 rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink"
        onclick={() => player.stop()}
        aria-label="Stop recitation"
        title="Stop"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M18 6 6 18M6 6l12 12"></path>
        </svg>
      </button>
    </div>

    <div class="grid gap-2">
      <div class="flex items-center justify-center gap-2 sm:gap-4">
      <button
        class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-30"
        onclick={() => player.prev()}
        disabled={player.index <= 0}
        aria-label="Previous ayah"
        title="Previous ayah"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5 9 12l10 7V5zM5 5v14"></path></svg>
      </button>
      <button
        class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink"
        onclick={() => player.seekBy(-10)}
        aria-label="Back 10 seconds"
        title="Back 10 seconds"
      >
        <span class="text-xs font-semibold tabular-nums">−10</span>
      </button>
      <button
        class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-lg transition hover:brightness-105 active:scale-95 sm:h-16 sm:w-16"
        onclick={() => player.toggle()}
        aria-label={player.playing ? "Pause" : "Play"}
      >
        {#if player.loading}
          <span class="block h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
        {:else if player.playing}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z"></path></svg>
        {/if}
      </button>
      <button
        class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink"
        onclick={() => player.seekBy(10)}
        aria-label="Forward 10 seconds"
        title="Forward 10 seconds"
      >
        <span class="text-xs font-semibold tabular-nums">+10</span>
      </button>
      <button
        class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-30"
        onclick={() => player.next()}
        disabled={player.index >= player.tracks.length - 1}
        aria-label="Next ayah"
        title="Next ayah"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 5 10 7-10 7V5zM19 5v14"></path></svg>
      </button>
      </div>
      <div class="min-w-0 px-1 sm:px-3">
        <div class="mb-1.5 flex items-center justify-between text-xs tabular-nums text-ink-muted">
          <span>{formatTime(player.elapsed)}</span>
          <span>{formatTime(player.playDuration)}</span>
        </div>
        <input
          class="h-2 w-full cursor-pointer accent-accent disabled:cursor-default disabled:opacity-40"
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={player.progress}
          oninput={(event) => player.seekFraction(Number(event.currentTarget.value))}
          disabled={player.duration <= 0}
          aria-label="Seek within recitation"
        />
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2 border-t border-hairline pt-3 sm:gap-3 sm:pt-4">
      <label class="min-w-0 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        Speed
        <select
          class="mt-1.5 block w-full rounded-xl border border-hairline bg-bg px-2.5 py-2 text-sm normal-case tracking-normal text-ink outline-none focus:border-accent"
          value={player.playbackRate}
          onchange={(event) => player.setPlaybackRate(Number(event.currentTarget.value))}
          aria-label="Playback speed"
        >
          {#each [0.75, 0.9, 1, 1.1, 1.25, 1.5] as speed (speed)}
            <option value={speed}>{speed}×</option>
          {/each}
        </select>
      </label>
      <label class="min-w-0 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        Repeat
        <select
          class="mt-1.5 block w-full rounded-xl border border-hairline bg-bg px-2.5 py-2 text-sm normal-case tracking-normal text-ink outline-none focus:border-accent"
          value={player.repeatMode}
          onchange={(event) => player.setRepeatMode(event.currentTarget.value as "off" | "track" | "playlist")}
          aria-label="Repeat mode"
        >
          <option value="off">Off</option>
          <option value="track">This ayah</option>
          <option value="playlist">{player.source?.kind === "selection" ? "Selection" : "Playlist"}</option>
        </select>
      </label>
      <label class="min-w-0 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        Reciter
        <select
          class="mt-1.5 block w-full rounded-xl border border-hairline bg-bg px-2.5 py-2 text-sm normal-case tracking-normal text-ink outline-none focus:border-accent"
          value={player.reciterId}
          onchange={(event) => player.setReciter(event.currentTarget.value)}
          aria-label="Reciter"
        >
          {#each RECITERS as reciter (reciter.id)}
            <option value={reciter.id}>{reciter.label}</option>
          {/each}
        </select>
        <span
          class="mt-1 flex min-h-4 items-center justify-between gap-1 text-[10px] font-normal normal-case tracking-normal text-ink-muted"
          aria-live="polite"
        >
          {#if player.timingStatus === "loading"}
            Checking {WORD_PLAYBACK_LABEL.toLowerCase()}…
          {:else if player.timingStatus === "ready"}
            {WORD_PLAYBACK_LABEL} ready
          {:else if player.timingStatus === "unavailable"}
            Whole ayahs only
          {:else}
            Word playback check failed
            <button
              class="pointer-events-auto rounded px-1 font-semibold text-accent hover:bg-accent-soft"
              onclick={() => player.reloadTimings()}
            >
              Retry
            </button>
          {/if}
        </span>
      </label>
    </div>
  </section>
{/if}

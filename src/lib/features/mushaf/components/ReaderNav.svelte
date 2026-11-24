<script lang="ts">
import type { SurahSummary } from "../../../domain/schemas"
import { PAGE_COUNT } from "../model/reader-page"

interface Props {
  surahs: SurahSummary[]
  juz: number | null
  current: number
  onOpenNav: () => void
  onPlaySurah: () => void
  onPlayJuz: () => void
  onTurn: (by: number) => void
}

let { surahs, juz, current, onOpenNav, onPlaySurah, onPlayJuz, onTurn }: Props = $props()
</script>

<div class="flex min-w-0 flex-wrap items-center gap-1 md:justify-start">
  <button
    class="flex items-center gap-1.5 rounded-lg border border-hairline bg-bg px-2.5 py-1.5 text-sm shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
    onclick={onOpenNav}
    aria-label="Go to surah, page, juz, or hizb"
    title="Go to..."
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>
    </svg>
    Go to...
  </button>
  <button
    class="flex items-center gap-1 rounded-lg border border-hairline bg-bg px-2 py-1.5 text-sm shadow-sm transition hover:border-accent/30 hover:bg-accent-soft disabled:opacity-40"
    onclick={onPlaySurah}
    disabled={surahs.length === 0}
    aria-label="Play this surah"
    title="Play this surah"
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z"></path></svg>
    Surah
  </button>
  <button
    class="flex items-center gap-1 rounded-lg border border-hairline bg-bg px-2 py-1.5 text-sm shadow-sm transition hover:border-accent/30 hover:bg-accent-soft disabled:opacity-40"
    onclick={onPlayJuz}
    disabled={juz === null}
    aria-label="Play this juz"
    title="Play this juz"
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z"></path></svg>
    Juz
  </button>
  <!-- The mushaf turns like the print: forward is to the left. -->
  <button
    class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-accent active:scale-95"
    onclick={() => onTurn(1)}
    aria-label="Next page"
    title="Next page (←)"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 5l-7 7 7 7"></path>
    </svg>
  </button>
  <div class="flex items-center gap-2 rounded-lg border border-hairline bg-bg px-3 py-1.5 text-sm whitespace-nowrap shadow-sm">
    {#if juz !== null}
      <span class="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Juz {juz}</span>
    {/if}
    <span class="font-semibold tabular-nums">{current} <span class="text-ink-muted">/</span> {PAGE_COUNT}</span>
  </div>
  <button
    class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-accent active:scale-95"
    onclick={() => onTurn(-1)}
    aria-label="Previous page"
    title="Previous page (→)"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 5l7 7-7 7"></path>
    </svg>
  </button>
</div>
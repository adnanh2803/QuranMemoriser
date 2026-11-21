<script lang="ts">
import type { SurahSummary } from "../../../domain/schemas"
import { PAGE_COUNT } from "../model/reader-page"

interface Props {
  surahs: SurahSummary[]
  juz: number | null
  current: number
  pageInput: string
  onGoSurah: (surah: number) => void
  onGoJuz: (juz: number) => void
  onPlaySurah: () => void
  onPlayJuz: () => void
  onGoPage: () => void
  onTurn: (by: number) => void
  onPageInputChange: (value: string) => void
}

let {
  surahs,
  juz,
  current,
  pageInput,
  onGoSurah,
  onGoJuz,
  onPlaySurah,
  onPlayJuz,
  onGoPage,
  onTurn,
  onPageInputChange,
}: Props = $props()
</script>

<div class="flex min-w-0 flex-wrap items-center gap-1 md:justify-start">
  <select
    class="max-w-36 rounded-lg border border-hairline bg-bg px-2.5 py-1.5 text-sm shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
    aria-label="Go to surah"
    onchange={(event) => onGoSurah(Number(event.currentTarget.value))}
  >
    <option value="" selected={surahs.length === 0}>Surah</option>
    {#each surahs as surah (surah.surah)}
      <option value={surah.surah}>{surah.surah}. {surah.name}</option>
    {/each}
  </select>
  <select
    class="rounded-lg border border-hairline bg-bg px-2.5 py-1.5 text-sm shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
    aria-label="Go to juz"
    onchange={(event) => onGoJuz(Number(event.currentTarget.value))}
  >
    <option value="" selected>Juz</option>
    {#each Array.from({ length: 30 }, (_, index) => index + 1) as juzNumber (juzNumber)}
      <option value={juzNumber}>{juzNumber}</option>
    {/each}
  </select>
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
  <form
    class="flex items-center gap-1"
    onsubmit={(event) => {
      event.preventDefault()
      onGoPage()
    }}
  >
    <input
      class="w-16 rounded-lg border border-hairline bg-bg px-2 py-1.5 text-sm tabular-nums shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
      type="number"
      min="1"
      max={PAGE_COUNT}
      value={pageInput}
      oninput={(event) => onPageInputChange(event.currentTarget.value)}
      aria-label="Go to page"
    />
    <button
      class="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
      >Go</button
    >
  </form>
  <!-- The mushaf turns like the print: forward is to the left. -->
  <button
    class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-accent active:scale-95"
    onclick={() => onTurn(1)}
    aria-label="Next page"
    title="Next page (←)"
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M15 5l-7 7 7 7"></path>
    </svg>
  </button>
  <div
    class="flex items-center gap-2 rounded-lg border border-hairline bg-bg px-3 py-1.5 text-sm whitespace-nowrap shadow-sm"
  >
    {#if juz !== null}
      <span class="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
        Juz {juz}
      </span>
    {/if}
    <span class="font-semibold tabular-nums"
      >{current} <span class="text-ink-muted">/</span> {PAGE_COUNT}</span
    >
  </div>
  <button
    class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-accent active:scale-95"
    onclick={() => onTurn(-1)}
    aria-label="Previous page"
    title="Previous page (→)"
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M9 5l7 7-7 7"></path>
    </svg>
  </button>
</div>

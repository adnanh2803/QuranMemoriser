<!-- Reciter-first list: pick a reciter, then manage its offline surahs. -->
<script lang="ts">
import type { SurahSummary } from "../../../domain/schemas"
import { RECITERS, type Reciter } from "../data/audio-repository"
import type { CachedRecitation } from "../data/offline-audio-repository"
import { hasWordTimings, WORD_PLAYBACK_LABEL } from "../model/word-timings"

interface Props {
  surahs: SurahSummary[]
  inventory: CachedRecitation[]
  onOpen: (reciterId: string) => void
}

interface ReciterStats {
  savedSurahs: number
  completeSurahs: number
  savedAyahs: number
}

let { surahs, inventory, onOpen }: Props = $props()

const verseCountBySurah = $derived(new Map(surahs.map((surah) => [surah.surah, surah.verseCount])))

const statsByReciter = $derived.by(() => {
  const map = new Map<string, ReciterStats>()
  for (const reciter of RECITERS) {
    map.set(reciter.id, { savedSurahs: 0, completeSurahs: 0, savedAyahs: 0 })
  }
  for (const item of inventory) {
    const stats = map.get(item.reciterId)
    if (!stats) continue
    stats.savedSurahs += 1
    stats.savedAyahs += item.ayahs
    const verseCount = verseCountBySurah.get(item.surah)
    if (verseCount !== undefined && item.ayahs >= verseCount) stats.completeSurahs += 1
  }
  return map
})
</script>

<section aria-labelledby="offline-reciters-heading" class="space-y-4">
  <div class="px-1">
    <h3 id="offline-reciters-heading" class="text-base font-semibold">Choose a reciter</h3>
  </div>

  <div class="grid gap-3 md:grid-cols-2">
    {#each RECITERS as reciter (reciter.id)}
      {@const stats = statsByReciter.get(reciter.id) ?? { savedSurahs: 0, completeSurahs: 0, savedAyahs: 0 }}
      {@const supportsWords = hasWordTimings(reciter.id)}
      <button
        type="button"
        class="group flex w-full items-start gap-3 rounded-2xl border border-hairline bg-surface px-4 py-4 text-left transition hover:border-accent/30 hover:bg-accent-soft/20"
        data-reciter={reciter.id}
        onclick={() => onOpen(reciter.id)}
      >
        <span class="min-w-0 flex-1">
          <span class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium {supportsWords ? 'bg-accent-soft text-accent' : 'bg-bg text-ink-muted'}"
              title={supportsWords ? WORD_PLAYBACK_LABEL : "Whole ayahs only"}
            >
              {#if supportsWords}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h16"></path></svg>
                <span>Words</span>
              {:else}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"></path></svg>
                <span>Ayahs</span>
              {/if}
            </span>
            <span class="text-sm font-medium leading-snug">{reciter.label}</span>
          </span>
          <span class="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span class="inline-flex items-center gap-1" title={stats.savedSurahs === 0 ? "No offline surahs saved" : `${stats.completeSurahs} of ${stats.savedSurahs} saved surahs complete`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"></path><path d="m7.5 10.5 4.5 4.5 4.5-4.5"></path><path d="M5 19h14"></path></svg>
              {#if stats.savedSurahs === 0}
                <span>Not saved</span>
              {:else}
                <span class="tabular-nums">{stats.completeSurahs}/{stats.savedSurahs} surahs</span>
              {/if}
            </span>
          </span>
        </span>
        <span class="mt-1 shrink-0 text-ink-muted transition group-hover:text-accent" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 6 6 6-6 6"></path>
          </svg>
        </span>
      </button>
    {/each}
  </div>
</section>

<!-- A searchable checkbox list, so offline downloads can cover several surahs at once. -->
<script lang="ts">
import type { SurahSummary } from "../../../domain/schemas"

interface Props {
  surahs: SurahSummary[]
  selected: Set<number>
  savedSurahs: ReadonlySet<number>
  currentSurah: number | null
  disabled: boolean
  onChange: (selected: Set<number>) => void
}

let { surahs, selected, savedSurahs, currentSurah, disabled, onChange }: Props = $props()

let query = $state("")

const selectedSurahs = $derived(surahs.filter((surah) => selected.has(surah.surah)))
const selectedAyahs = $derived(selectedSurahs.reduce((total, surah) => total + surah.verseCount, 0))
const filteredSurahs = $derived.by(() => {
  const needle = query.trim().toLowerCase()
  if (needle === "") return surahs
  return surahs.filter((surah) =>
    [String(surah.surah), surah.name, surah.transliteration, surah.englishName, surah.arabicName]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  )
})
const selectedNames = $derived(selectedSurahs.map((surah) => surah.name).join(", "))

function toggle(surah: SurahSummary, checked: boolean): void {
  const next = new Set(selected)
  if (checked) next.add(surah.surah)
  else next.delete(surah.surah)
  onChange(next)
}

function selectAll(): void {
  if (disabled) return
  onChange(new Set(surahs.map((surah) => surah.surah)))
}

function clearSelection(): void {
  if (disabled) return
  onChange(new Set())
}

function selectCurrent(): void {
  if (disabled || currentSurah === null) return
  onChange(new Set([currentSurah]))
}
</script>

<section aria-labelledby="surah-picker-heading">
  <div class="mb-2 flex flex-wrap items-end justify-between gap-2">
    <div class="min-w-0">
      <h3 id="surah-picker-heading" class="text-sm font-semibold">Surahs</h3>
      <p class="text-[11px] text-ink-muted">
        {selected.size} selected · {selectedAyahs} ayahs
      </p>
    </div>
    <div class="flex items-center gap-1 text-xs">
      {#if currentSurah !== null}
        <button
          class="rounded-lg px-2 py-1.5 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
          onclick={selectCurrent}
          disabled={disabled}
          title="Select the surah shown on the current page"
        >Current</button>
      {/if}
      <button
        class="rounded-lg px-2 py-1.5 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
        onclick={selectAll}
        disabled={disabled}
        title="Select all 114 surahs"
      >Select all</button>
      <button
        class="rounded-lg px-2 py-1.5 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
        onclick={clearSelection}
        disabled={disabled}
      >Clear</button>
    </div>
  </div>

  <div class="overflow-hidden rounded-2xl border border-hairline bg-bg">
    <div class="border-b border-hairline p-2">
      <label class="relative block">
        <span class="sr-only">Find a surah</span>
        <svg
          class="pointer-events-none absolute left-2.5 top-2.5 text-ink-muted"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-3.5-3.5"></path>
        </svg>
        <input
          type="search"
          class="block w-full rounded-xl border border-hairline bg-surface py-2 pl-8 pr-3 text-sm outline-none focus:border-accent"
          placeholder="Find a surah"
          bind:value={query}
        />
      </label>
    </div>

    <div
      class="grid max-h-56 gap-0.5 overflow-y-auto overscroll-contain p-1.5 sm:grid-cols-2 sm:max-h-64"
      role="group"
      aria-labelledby="surah-picker-heading"
    >
      {#each filteredSurahs as surah (surah.surah)}
        <label
          class="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-xs transition hover:bg-accent-soft has-checked:border-accent/30 has-checked:bg-accent-soft/60"
          data-surah={surah.surah}
        >
          <input
            class="h-4 w-4 shrink-0 accent-accent"
            type="checkbox"
            checked={selected.has(surah.surah)}
            disabled={disabled}
            onchange={(event) => toggle(surah, event.currentTarget.checked)}
          />
          <span class="w-6 shrink-0 tabular-nums text-ink-muted">{surah.surah}</span>
          <span class="truncate">{surah.name}</span>
          {#if savedSurahs.has(surah.surah)}
            <span
              class="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
              title="Some recitations saved"
            ></span>
          {/if}
        </label>
      {:else}
        <p class="col-span-full px-3 py-6 text-center text-xs text-ink-muted">
          {query.trim() === "" ? "Surahs are still loading…" : `No surahs match “${query}”.`}
        </p>
      {/each}
    </div>

    <p class="line-clamp-2 border-t border-hairline px-3 py-2 text-[11px] text-ink-muted">
      {#if selectedSurahs.length === 0}
        Choose at least one surah.
      {:else}
        <span class="font-medium text-ink">Selected:</span>
        {selectedNames}
      {/if}
    </p>
  </div>
</section>

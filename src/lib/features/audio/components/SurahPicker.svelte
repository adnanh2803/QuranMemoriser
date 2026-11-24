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

<section aria-labelledby="surah-picker-heading" class="space-y-3">
  <div class="flex items-center gap-2">
    <h3 id="surah-picker-heading" class="text-base font-semibold">Surahs</h3>
    {#if selected.size > 0}
      <span class="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium tabular-nums text-accent">{selected.size}</span>
    {/if}
  </div>

  <div class="flex items-center gap-2">
    <label class="relative block min-w-0 flex-1">
      <span class="sr-only">Find a surah</span>
      <svg
        class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
        width="15"
        height="15"
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
        class="block w-full rounded-xl border border-hairline bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-accent"
        placeholder="Find a surah"
        bind:value={query}
      />
    </label>
    <div class="flex shrink-0 items-center gap-1">
      {#if currentSurah !== null}
        <button
          type="button"
          class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
          onclick={selectCurrent}
          disabled={disabled}
          aria-label="Select current surah"
          title="Select current surah"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2"></path></svg>
        </button>
      {/if}
      <button
        type="button"
        class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
        onclick={selectAll}
        disabled={disabled}
        aria-label="Select all surahs"
        title="Select all surahs"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"></path><path d="m9 6 2 2 4-4"></path></svg>
      </button>
      <button
        type="button"
        class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
        onclick={clearSelection}
        disabled={disabled}
        aria-label="Clear surah selection"
        title="Clear selection"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>
      </button>
    </div>
  </div>

  <div
    class="grid max-h-[min(26rem,45dvh)] grid-cols-2 gap-x-1 gap-y-0.5 overflow-y-auto overscroll-contain sm:max-h-[min(30rem,50dvh)]"
    role="group"
    aria-labelledby="surah-picker-heading"
  >
    {#each filteredSurahs as surah (surah.surah)}
      <label
        class="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-xl border border-transparent px-2 py-2 text-xs transition hover:bg-accent-soft has-checked:border-accent/30 has-checked:bg-accent-soft/60 sm:gap-2.5 sm:px-3 sm:text-sm"
        data-surah={surah.surah}
      >
        <input
          class="h-4 w-4 shrink-0 accent-accent"
          type="checkbox"
          checked={selected.has(surah.surah)}
          disabled={disabled}
          onchange={(event) => toggle(surah, event.currentTarget.checked)}
        />
        <span class="w-5 shrink-0 tabular-nums text-ink-muted sm:w-7">{surah.surah}</span>
        <span class="truncate">{surah.name}</span>
        {#if savedSurahs.has(surah.surah)}
          <span
            class="ml-auto h-2 w-2 shrink-0 rounded-full bg-accent"
            title="Some recitations saved"
          ></span>
        {/if}
      </label>
    {:else}
      <p class="col-span-full px-3 py-8 text-center text-sm text-ink-muted">
        {query.trim() === "" ? "Surahs are still loading…" : `No surahs match “${query}”.`}
      </p>
    {/each}
  </div>

  {#if selectedSurahs.length > 0}
    <p class="line-clamp-2 text-xs text-ink-muted">
      <span class="font-medium text-ink">Selected:</span> {selectedNames}
    </p>
  {/if}
</section>

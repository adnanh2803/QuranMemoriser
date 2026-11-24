<script lang="ts">
import type { AyahMeta, MushafMeta, SurahSummary } from "../../../domain/schemas"
import { PAGE_COUNT } from "../model/reader-page"

type NavTab = "surah" | "page" | "juz" | "hizb"

interface Props {
  open: boolean
  surahs: SurahSummary[]
  ayahs: AyahMeta[]
  meta: MushafMeta | null
  current: number
  onClose: () => void
  onGoSurah: (surah: number) => void
  onGoJuz: (juz: number) => void
  onGoPage: (page: number) => void
}

let { open, surahs, ayahs, meta, current, onClose, onGoSurah, onGoJuz, onGoPage }: Props = $props()

let tab = $state<NavTab>("surah")
let query = $state("")
let searchInput = $state<HTMLInputElement | null>(null)

const surahNameById = $derived(new Map(surahs.map((s) => [s.surah, s.name])))
const surahArabicById = $derived(new Map(surahs.map((s) => [s.surah, s.arabicName])))
const ayahTextByKey = $derived(new Map(ayahs.map((a) => [`${a.surah}:${a.ayah}`, a.text])))

function ayahPreview(surah: number, ayah: number, max = 70): string {
  const text = ayahTextByKey.get(`${surah}:${ayah}`) ?? ""
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
}

const firstAyahByPage = $derived.by(() => {
  const map = new Map<number, { surah: number; ayah: number }>()
  for (const a of ayahs) {
    const prev = map.get(a.page)
    if (!prev || a.surah < prev.surah || (a.surah === prev.surah && a.ayah < prev.ayah)) {
      map.set(a.page, { surah: a.surah, ayah: a.ayah })
    }
  }
  return map
})

function surahForPage(page: number): SurahSummary | undefined {
  return surahs.find((s) => page >= s.firstPage && page <= s.lastPage)
}

function pageLabel(page: number): string {
  const first = firstAyahByPage.get(page)
  if (first) {
    const name = surahNameById.get(first.surah) ?? ""
    return `${name} ${first.surah}:${first.ayah}`
  }
  const surah = surahForPage(page)
  if (surah) return `${surah.name} ${surah.surah}:1`
  return `Page ${page}`
}

function pageAr(page: number): string {
  const first = firstAyahByPage.get(page)
  if (first) return surahArabicById.get(first.surah) ?? ""
  return surahForPage(page)?.arabicName ?? ""
}

function pageRef(page: number): string {
  const first = firstAyahByPage.get(page)
  if (first) return `${first.surah}:${first.ayah}`
  const surah = surahForPage(page)
  return surah ? `${surah.surah}:1` : ""
}

const filteredSurahs = $derived.by(() => {
  const q = query.trim().toLowerCase()
  if (!q) return surahs
  return surahs.filter(
    (s) =>
      String(s.surah).includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.transliteration.toLowerCase().includes(q) ||
      s.englishName.toLowerCase().includes(q) ||
      s.arabicName.includes(query.trim()),
  )
})

const pageNumbers = $derived.by(() => {
  const q = query.trim()
  const all = Array.from({ length: PAGE_COUNT }, (_, i) => i + 1)
  return q ? all.filter((p) => String(p).includes(q)) : all
})

const juzNumbers = $derived.by(() => {
  const q = query.trim()
  const all = Array.from({ length: 30 }, (_, i) => i + 1)
  return q ? all.filter((j) => String(j).includes(q)) : all
})

const hizbNumbers = $derived.by(() => {
  const q = query.trim()
  const all = Array.from({ length: 60 }, (_, i) => i + 1)
  return q ? all.filter((h) => String(h).includes(q)) : all
})

function juzStartPage(juz: number): number {
  return meta?.juzPages[juz - 1] ?? 1
}

function hizbStartPage(hizb: number): number {
  const idx = meta?.pageHizbs.indexOf(hizb) ?? -1
  return idx >= 0 ? idx + 1 : 1
}

function selectTab(next: NavTab): void {
  tab = next
  query = ""
  searchInput?.focus()
}

function goSurah(surah: number): void {
  onGoSurah(surah)
  onClose()
}

function goPage(page: number): void {
  onGoPage(page)
  onClose()
}

function goJuz(juz: number): void {
  onGoJuz(juz)
  onClose()
}

function goHizb(hizb: number): void {
  onGoPage(hizbStartPage(hizb))
  onClose()
}

function onKeydown(event: KeyboardEvent): void {
  if (!open) return
  if (event.key === "Escape") {
    event.preventDefault()
    onClose()
  }
}

const tabLabel: Record<NavTab, string> = {
  surah: "Surah",
  page: "Page",
  juz: "Juz",
  hizb: "Hizb",
}

const placeholder: Record<NavTab, string> = {
  surah: "Find surah by name or number",
  page: "Find page number",
  juz: "Find juz number",
  hizb: "Find hizb number",
}

const statusText = $derived.by(() => {
  const q = query.trim()
  if (tab === "surah") return q ? `${filteredSurahs.length} surahs` : "114 surahs"
  if (tab === "page") return q ? `${pageNumbers.length} pages` : "604 pages"
  if (tab === "juz") return q ? `${juzNumbers.length} juz` : "30 juz"
  return q ? `${hizbNumbers.length} hizb` : "60 hizb"
})
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="fixed inset-0 z-50 bg-transparent text-ink" role="dialog" aria-modal="true" aria-label="Navigate">
    <div class="absolute inset-0 bg-page" aria-hidden="true"></div>
    <div class="relative flex h-full flex-col">
    <div class="border-b border-hairline px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold tracking-tight">Go to</h2>
          <p class="mt-0.5 text-xs text-ink-muted">Current page {current} · {pageLabel(current)}</p>
        </div>
        <button
          class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-accent"
          onclick={onClose}
          aria-label="Close navigation"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-bg p-1" role="tablist" aria-label="Navigation category">
        {#each (["surah", "page", "juz", "hizb"] as NavTab[]) as t (t)}
          <button
            role="tab"
            aria-selected={tab === t}
            class="rounded-lg px-2 py-2 text-sm font-medium transition {tab === t ? 'bg-page text-accent shadow-sm' : 'text-ink-muted hover:text-ink'}"
            onclick={() => selectTab(t)}
          >{tabLabel[t]}</button>
        {/each}
      </div>

      <div class="mt-3">
        <input
          class="w-full rounded-xl border border-hairline bg-bg px-3 py-2.5 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          type="search"
          value={query}
          oninput={(e) => (query = e.currentTarget.value)}
          placeholder={placeholder[tab]}
          aria-label={placeholder[tab]}
        />
        <div class="px-1 pt-2 text-xs text-ink-muted">{statusText}</div>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-3">
      {#if tab === "surah"}
        <div class="flex flex-col">
          {#each filteredSurahs as surah (surah.surah)}
            <button class="nav-row" onclick={() => goSurah(surah.surah)}>
              <span class="nav-left">
                <span class="nav-num">{surah.surah}</span>
                <span class="nav-main-col">
                  <span class="nav-name">{surah.name}</span>
                  <span class="nav-preview ar" dir="rtl">{ayahPreview(surah.surah, 1, 55)}</span>
                </span>
              </span>
              <span class="nav-right ar" dir="rtl">{surah.arabicName}</span>
            </button>
          {:else}
            <div class="px-3 py-10 text-center text-sm text-ink-muted">No surahs match.</div>
          {/each}
        </div>
      {:else if tab === "page"}
        <div class="flex flex-col">
          {#each pageNumbers as page (page)}
            {@const first = firstAyahByPage.get(page)}
            <button class="nav-row" onclick={() => goPage(page)}>
              <span class="nav-left">
                <span class="nav-main-col">
                  <span class="nav-num">Page {page}</span>
                  <span class="nav-sub">{pageLabel(page)}</span>
                  {#if first}<span class="nav-preview ar" dir="rtl">{ayahPreview(first.surah, first.ayah, 55)}</span>{/if}
                </span>
              </span>
            </button>
          {:else}
            <div class="px-3 py-10 text-center text-sm text-ink-muted">No pages match.</div>
          {/each}
        </div>
      {:else if tab === "juz"}
        <div class="flex flex-col">
          {#each juzNumbers as juz (juz)}
            {@const p = juzStartPage(juz)}
            {@const first = firstAyahByPage.get(p)}
            <button class="nav-row" onclick={() => goJuz(juz)}>
              <span class="nav-left">
                <span class="nav-main-col">
                  <span class="nav-num">Juz {juz}</span>
                  <span class="nav-sub">{pageLabel(p)}</span>
                  {#if first}<span class="nav-preview ar" dir="rtl">{ayahPreview(first.surah, first.ayah, 55)}</span>{/if}
                </span>
              </span>
            </button>
          {:else}
            <div class="px-3 py-10 text-center text-sm text-ink-muted">No juz match.</div>
          {/each}
        </div>
      {:else}
        <div class="flex flex-col">
          {#each hizbNumbers as hizb (hizb)}
            {@const p = hizbStartPage(hizb)}
            {@const first = firstAyahByPage.get(p)}
            <button class="nav-row" onclick={() => goHizb(hizb)}>
              <span class="nav-left">
                <span class="nav-main-col">
                  <span class="nav-num">Hizb {hizb}</span>
                  <span class="nav-sub">{pageLabel(p)}</span>
                  {#if first}<span class="nav-preview ar" dir="rtl">{ayahPreview(first.surah, first.ayah, 55)}</span>{/if}
                </span>
              </span>
            </button>
          {:else}
            <div class="px-3 py-10 text-center text-sm text-ink-muted">No hizb match.</div>
          {/each}
        </div>
      {/if}
    </div>
    </div>
  </div>
{/if}

<style>
  .nav-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 10px;
    border-radius: 12px;
    text-align: left;
    transition: background-color 120ms ease;
  }
  .nav-row:hover { background: var(--color-accent-soft); }
  .nav-left { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
  .nav-main-col { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
  .nav-num { font-size: 14px; font-weight: 500; color: var(--color-ink); font-variant-numeric: tabular-nums; }
  .nav-sub { font-size: 12px; color: var(--color-ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nav-preview { font-size: 12px; color: color-mix(in srgb, var(--color-ink-muted) 85%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .nav-name { font-size: 14px; font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav-right { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 0; flex-shrink: 0; max-width: 45%; overflow: hidden; }
  .ar {
    font-family: "Amiri", "Noto Naskh Arabic", "Scheherazade New", "Traditional Arabic", serif;
    font-size: 17px;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
</style>

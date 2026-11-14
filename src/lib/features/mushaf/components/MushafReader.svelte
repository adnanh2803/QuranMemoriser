<!--
  The mushaf reader: 604 sheets in one vertical scroller.

  Every sheet is mounted as a shell that reserves its height (its line count
  on the 15-line grid), so the scroll never moves under the reader. Sheets
  near the viewport are filled with their lines, their own page font is
  registered and loaded as they come into reach, and everything further out
  is let go. Neighbouring fonts are warmed ahead of a turn.
-->
<script lang="ts">
import "../mushaf.css"
import { untrack } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import {
  type AyahMeta,
  type MushafMeta,
  type PageChunk,
  type SurahSummary,
  type VerseKey,
} from "../../../domain/schemas"
import type { BookmarkRepository } from "../data/bookmark-repository"
import type { CommandContext, MushafRepository } from "../data/mushaf-repository"
import type { PageFontRegistry } from "../data/page-fonts"
import {
  dispatchSelection,
  ExtendToAyah,
  type SelectionEngine,
  TapAyah,
} from "../model/selection.svelte"
import AyahList from "./AyahList.svelte"
import MushafSheet from "./MushafSheet.svelte"
import SelectionBanner from "./SelectionBanner.svelte"

interface Props {
  repository: MushafRepository
  bookmarks: BookmarkRepository
  fonts: PageFontRegistry
  selection: SelectionEngine
  context: Promise<CommandContext>
}

let { repository, bookmarks, fonts, selection, context }: Props = $props()

const PAGE_COUNT = 604
/** Sheets kept filled on either side of the viewport. */
const WINDOW = 3
const LAST_PAGE_KEY = "qm.page"

const pages = Array.from({ length: PAGE_COUNT }, (_, index) => index + 1)

let viewport = $state<HTMLElement | null>(null)
let current = $state<number>(restorePage())
let meta = $state<MushafMeta | null>(null)
let surahs = $state<SurahSummary[]>([])
let ayahs = $state<AyahMeta[]>([])
let searchQuery = $state("")
let searchResults = $state<AyahMeta[]>([])
let searchError = $state<string | null>(null)
let loadError = $state<string | null>(null)
let listView = $state(false)
let pageInput = $state("1")
let bookmarksOpen = $state(false)
let savedBookmarks = $state<VerseKey[]>([])
/** Loaded page chunks. SvelteMap (not $state(new Map())) — Map mutations
 * must notify dependents, which only the reactive built-in does. */
const chunks = new SvelteMap<number, PageChunk>()

const juz = $derived(meta ? repository.juzOfPage(current, meta) : null)
const fitBody = $derived(meta?.fit.body ?? 19.76)
const centreBelow = $derived(meta?.fit.centreBelow ?? 0.55)

function restorePage(): number {
  const saved = Number.parseInt(localStorage.getItem(LAST_PAGE_KEY) ?? "", 10)
  return saved >= 1 && saved <= PAGE_COUNT ? saved : 1
}

// Reader-wide constants (juz starts, type scale).
$effect(() => {
  let cancelled = false
  Promise.all([repository.meta(), repository.surahs()])
    .then(([loadedMeta, loadedSurahs]) => {
      if (cancelled) return
      meta = loadedMeta
      surahs = loadedSurahs
    })
    .catch((error: unknown) => {
      if (!cancelled) loadError = error instanceof Error ? error.message : String(error)
    })
  try {
    savedBookmarks = bookmarks.list()
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error)
  }
  return () => {
    cancelled = true
  }
})

// Load the chunks of the open window and its neighbours; let go of the rest.
$effect(() => {
  const center = current
  const from = Math.max(1, center - WINDOW)
  const to = Math.min(PAGE_COUNT, center + WINDOW)
  for (let page = from; page <= to; page++) {
    if (!untrack(() => chunks.has(page))) {
      repository
        .pageChunk(page)
        .then((chunk) => chunks.set(page, chunk))
        .catch((error: unknown) => {
          loadError = error instanceof Error ? error.message : String(error)
        })
    }
  }
  for (const page of untrack(() => [...chunks.keys()])) {
    if (page < from - 1 || page > to + 1) chunks.delete(page)
  }
  // Fonts of the window plus one more page in each direction, so a turn
  // finds its leaves warm.
  for (let page = Math.max(1, center - WINDOW - 1); page <= Math.min(PAGE_COUNT, to + 1); page++) {
    fonts.warm(page)
  }
})

$effect(() => {
  const query = searchQuery.trim()
  if (!query) {
    searchResults = []
    searchError = null
    return
  }
  let cancelled = false
  const timer = setTimeout(() => {
    repository
      .search(query, 12)
      .then((matches) => {
        if (!cancelled) {
          searchResults = matches
          searchError = null
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) searchError = error instanceof Error ? error.message : String(error)
      })
  }, 180)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
})

$effect(() => {
  pageInput = String(current)
})

/* ---- which sheet is on screen ------------------------------------------ */

let tops: number[] = []

function measure(): void {
  const container = viewport
  if (!container) return
  const sheets = container.querySelectorAll<HTMLElement>(".sheet")
  tops = []
  for (const sheet of sheets) {
    tops.push(sheet.offsetTop)
  }
}

function pageAt(y: number): number {
  if (tops.length === 0) return current
  let low = 0
  let high = tops.length - 1
  let found = 0
  while (low <= high) {
    const mid = (low + high) >> 1
    const top = tops[mid]
    if (top !== undefined && top <= y) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return Math.min(PAGE_COUNT, found + 1)
}

let scrollFrame = 0

function onScroll(): void {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const container = viewport
    if (!container || listView) return
    const page = pageAt(container.scrollTop + container.clientHeight * 0.4)
    if (page !== current) {
      current = page
      localStorage.setItem(LAST_PAGE_KEY, String(page))
    }
  })
}

// Sheet heights depend only on the type size, which follows the viewport
// width: re-measure when the scroller's width changes.
$effect(() => {
  const container = viewport
  if (!container) return
  const observer = new ResizeObserver(() => {
    requestAnimationFrame(measure)
  })
  observer.observe(container)
  return () => observer.disconnect()
})

function scrollToPage(page: number, behavior: ScrollBehavior = "auto"): void {
  const container = viewport
  if (!container) return
  const top = tops[page - 1]
  if (top === undefined) return
  container.scrollTo({ top: Math.max(0, top - 8), behavior })
  current = page
  pageInput = String(page)
  listView = false
  localStorage.setItem(LAST_PAGE_KEY, String(page))
}

function goToPage(): void {
  const page = Number.parseInt(pageInput, 10)
  if (Number.isInteger(page) && page >= 1 && page <= PAGE_COUNT) {
    scrollToPage(page)
  } else {
    pageInput = String(current)
  }
}

function goToSurah(surah: number): void {
  const entry = surahs.find((item) => item.surah === surah)
  if (entry) scrollToPage(entry.firstPage)
}

function goToJuz(juzNumber: number): void {
  const page = meta?.juzPages[juzNumber - 1]
  if (page !== undefined) scrollToPage(page)
}

function openList(): void {
  if (ayahs.length > 0) {
    listView = true
    viewport?.scrollTo({ top: 0 })
    return
  }
  repository
    .ayahs()
    .then((loaded) => {
      ayahs = loaded
      listView = true
      viewport?.scrollTo({ top: 0 })
    })
    .catch((error: unknown) => {
      loadError = error instanceof Error ? error.message : String(error)
    })
}

function toggleView(): void {
  if (!listView) {
    openList()
    return
  }
  listView = false
  requestAnimationFrame(() => {
    measure()
    scrollToPage(current)
  })
}

function openSearchResult(ayah: AyahMeta): void {
  searchQuery = ""
  scrollToPage(ayah.page)
}

function jumpToBookmark(key: VerseKey): void {
  repository
    .ayahs()
    .then((all) => {
      const ayah = all.find((item) => `${item.surah}:${item.ayah}` === key)
      if (ayah) {
        bookmarksOpen = false
        scrollToPage(ayah.page)
      }
    })
    .catch((error: unknown) => {
      loadError = error instanceof Error ? error.message : String(error)
    })
}

function removeBookmark(key: VerseKey): void {
  try {
    savedBookmarks = bookmarks.remove(key)
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error)
  }
}

function turn(by: number): void {
  scrollToPage(Math.min(PAGE_COUNT, Math.max(1, current + by)), "smooth")
}

// Mount: restore the last page after the first layout has settled.
$effect(() => {
  if (!viewport) return
  requestAnimationFrame(() => {
    measure()
    scrollToPage(current)
  })
})

/* ---- controls ------------------------------------------------------------ */

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (
    target &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
  ) {
    return
  }
  // The mushaf turns like the print: forward is to the left. Long jumps are
  // instant — animating across hundreds of sheets is a slow blur.
  if (event.key === "ArrowLeft" || event.key === "PageDown") {
    event.preventDefault()
    turn(1)
  } else if (event.key === "ArrowRight" || event.key === "PageUp") {
    event.preventDefault()
    turn(-1)
  } else if (event.key === "Home") {
    event.preventDefault()
    scrollToPage(1)
  } else if (event.key === "End") {
    event.preventDefault()
    scrollToPage(PAGE_COUNT)
  }
}

function tapAyah(key: VerseKey, extend: boolean): void {
  if (listView) {
    const ayah = ayahs.find((item) => `${item.surah}:${item.ayah}` === key)
    if (ayah) {
      current = ayah.page
      pageInput = String(ayah.page)
      localStorage.setItem(LAST_PAGE_KEY, String(ayah.page))
    }
  }
  dispatchSelection(selection, extend ? new ExtendToAyah(key) : new TapAyah(key), context)
}

function cycleTheme(): void {
  const themes = ["parchment", "sepia", "night"]
  const now = document.documentElement.dataset.theme ?? "parchment"
  const at = themes.indexOf(now)
  const next = themes[(at + 1) % themes.length]
  if (next === undefined) return
  document.documentElement.dataset.theme = next
  localStorage.setItem("qm.theme", next)
}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="relative flex h-dvh flex-col overflow-hidden bg-bg text-ink">
  <header
    class="z-10 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-hairline bg-surface/90 px-3 py-2 backdrop-blur"
  >
    <div class="flex min-w-0 items-center gap-1">
      <span class="px-2 text-sm font-semibold tracking-tight">QuranMemoriser</span>
    </div>
    <div class="flex flex-wrap items-center gap-1">
      <select
        class="max-w-36 rounded-lg border border-hairline bg-surface px-2 py-2 text-sm"
        aria-label="Go to surah"
        onchange={(event) => goToSurah(Number(event.currentTarget.value))}
      >
        <option value="" selected={surahs.length === 0}>Surah</option>
        {#each surahs as surah (surah.surah)}
          <option value={surah.surah}>{surah.surah}. {surah.name}</option>
        {/each}
      </select>
      <select
        class="rounded-lg border border-hairline bg-surface px-2 py-2 text-sm"
        aria-label="Go to juz"
        onchange={(event) => goToJuz(Number(event.currentTarget.value))}
      >
        <option value="" selected>Juz</option>
        {#each Array.from({ length: 30 }, (_, index) => index + 1) as juzNumber (juzNumber)}
          <option value={juzNumber}>{juzNumber}</option>
        {/each}
      </select>
      <form class="flex items-center gap-1" onsubmit={(event) => { event.preventDefault(); goToPage() }}>
        <input
          class="w-16 rounded-lg border border-hairline bg-surface px-2 py-2 text-sm tabular-nums"
          type="number"
          min="1"
          max={PAGE_COUNT}
          bind:value={pageInput}
          aria-label="Go to page"
        />
        <button class="rounded-lg border border-hairline px-2 py-2 text-sm hover:bg-accent-soft">Go</button>
      </form>
      <!-- The mushaf turns like the print: forward is to the left. -->
      <button
        class="rounded-lg p-2 transition hover:bg-accent-soft active:scale-95"
        onclick={() => turn(1)}
        aria-label="Next page"
        title="Next page (←)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 5l-7 7 7 7"></path>
        </svg>
      </button>
      <div class="flex items-center gap-3 px-2 text-sm whitespace-nowrap">
        {#if juz !== null}
          <span class="text-ink-muted">Juz {juz}</span>
        {/if}
        <span class="font-medium tabular-nums">{current} / {PAGE_COUNT}</span>
      </div>
      <button
        class="rounded-lg p-2 transition hover:bg-accent-soft active:scale-95"
        onclick={() => turn(-1)}
        aria-label="Previous page"
        title="Previous page (→)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 5l7 7-7 7"></path>
        </svg>
      </button>
    </div>
    <div class="relative flex items-center gap-1">
      <div class="relative">
        <input
          class="w-40 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm sm:w-56"
          type="search"
          bind:value={searchQuery}
          placeholder="Search Quran"
          aria-label="Search Quran"
        />
        {#if searchQuery.trim()}
          <div class="absolute right-0 top-full z-30 mt-1 max-h-80 w-80 max-w-[90vw] overflow-auto rounded-xl border border-hairline bg-surface-raised p-2 shadow-lg">
            {#if searchError}
              <p class="p-2 text-sm text-red-700">{searchError}</p>
            {:else if searchResults.length === 0}
              <p class="p-2 text-sm text-ink-muted">Searching or no matches</p>
            {:else}
              {#each searchResults as result (`${result.surah}:${result.ayah}`)}
                <button
                  class="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent-soft"
                  onclick={() => openSearchResult(result)}
                >
                  <span class="font-medium">{result.surah}:{result.ayah}</span>
                  <span class="ml-2 text-ink-muted" dir="rtl">{result.text}</span>
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
      <button
        class="rounded-lg border border-hairline px-3 py-2 text-sm hover:bg-accent-soft"
        onclick={toggleView}
        aria-pressed={listView}
      >{listView ? "Mushaf" : "Ayah list"}</button>
      <button
        class="rounded-lg border border-hairline px-3 py-2 text-sm hover:bg-accent-soft"
        onclick={() => (bookmarksOpen = !bookmarksOpen)}
        aria-expanded={bookmarksOpen}
      >Bookmarks ({savedBookmarks.length})</button>
      {#if bookmarksOpen}
        <div class="absolute right-0 top-full z-30 mt-1 max-h-80 w-64 overflow-auto rounded-xl border border-hairline bg-surface-raised p-2 shadow-lg">
          {#if savedBookmarks.length === 0}
            <p class="p-2 text-sm text-ink-muted">No bookmarks yet</p>
          {:else}
            {#each savedBookmarks as key (key)}
              <div class="flex items-center gap-1">
                <button class="flex-1 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent-soft" onclick={() => jumpToBookmark(key)}>{key}</button>
                <button class="rounded px-2 py-1 text-ink-muted hover:bg-accent-soft" aria-label="Remove bookmark {key}" onclick={() => removeBookmark(key)}>×</button>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
      <button
        class="rounded-lg p-2 transition hover:bg-accent-soft active:scale-95"
        onclick={cycleTheme}
        aria-label="Change theme"
        title="Change theme"
      >
        <!-- sun/moon theme glyph -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="12" cy="12" r="4.2"></circle>
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"></path>
        </svg>
      </button>
    </div>
  </header>

  <main
    bind:this={viewport}
    onscroll={onScroll}
    class="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
  >
    {#if loadError}
      <p class="mx-auto mt-6 max-w-xl rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{loadError}</p>
    {/if}
    {#if listView}
      <AyahList scrollElement={viewport} {ayahs} {selection} onTap={tapAyah} />
    {:else}
      <div class="sheet-anchor flex flex-col items-center gap-4 px-3 pt-4 pb-16">
        {#each pages as page (page)}
          <MushafSheet
            {page}
            chunk={chunks.get(page) ?? null}
            {juz}
            {fitBody}
            {centreBelow}
            {fonts}
            {selection}
            onTap={tapAyah}
          />
        {/each}
      </div>
    {/if}
  </main>

  <SelectionBanner {selection} {repository} {bookmarks} {context} onBookmarks={(keys) => (savedBookmarks = keys)} />
</div>

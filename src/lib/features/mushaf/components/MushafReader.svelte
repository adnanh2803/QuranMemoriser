<!--
  The mushaf reader: one page on screen, with horizontal slide turns.

  All page text chunks are loaded up front so navigation never waits for data.
  Only the visible page is mounted; its QCF font and neighboring fonts are
  warmed ahead of a turn.
-->
<script lang="ts">
import "../mushaf.css"
import { SvelteMap } from "svelte/reactivity"
import { fly } from "svelte/transition"
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
const LAST_PAGE_KEY = "qm.page"

const pages = Array.from({ length: PAGE_COUNT }, (_, index) => index + 1)

let viewport = $state<HTMLElement | null>(null)
let current = $state<number>(restorePage())
let turnDirection = $state(1)
let meta = $state<MushafMeta | null>(null)
let surahs = $state<SurahSummary[]>([])
let ayahs = $state<AyahMeta[]>([])
let searchQuery = $state("")
let searchResults = $state<AyahMeta[]>([])
let searchLoading = $state(false)
let searchError = $state<string | null>(null)
let loadError = $state<string | null>(null)
let listView = $state(false)
let mobileHeaderOpen = $state(false)
let pageInput = $state("1")
let bookmarksOpen = $state(false)
let savedBookmarks = $state<VerseKey[]>([])
let swipeOrigin: { x: number; y: number } | null = null
let suppressTapUntil = 0
/** All page chunks are loaded up front so page turns never wait on text data. */
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

// The offline page chunks total only a few megabytes; keep them ready for turns.
$effect(() => {
  let cancelled = false
  for (const page of pages) {
    repository
      .pageChunk(page)
      .then((chunk) => {
        if (!cancelled) chunks.set(page, chunk)
      })
      .catch((error: unknown) => {
        if (!cancelled) loadError = error instanceof Error ? error.message : String(error)
      })
  }
  return () => {
    cancelled = true
  }
})

// Warm the visible page's font and its neighbors to keep slide turns immediate.
$effect(() => {
  const page = current
  for (
    let neighbor = Math.max(1, page - 1);
    neighbor <= Math.min(PAGE_COUNT, page + 1);
    neighbor++
  ) {
    fonts.warm(neighbor)
  }
})

$effect(() => {
  const query = searchQuery.trim()
  if (!query) {
    searchResults = []
    searchLoading = false
    searchError = null
    return
  }
  searchResults = []
  searchLoading = true
  searchError = null
  let cancelled = false
  const timer = setTimeout(() => {
    repository
      .search(query, 12)
      .then((matches) => {
        if (!cancelled) {
          searchResults = matches
          searchLoading = false
          searchError = null
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          searchLoading = false
          searchError = error instanceof Error ? error.message : String(error)
        }
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

function showPage(page: number): void {
  const target = Math.min(PAGE_COUNT, Math.max(1, page))
  if (target !== current) turnDirection = target > current ? -1 : 1
  current = target
  pageInput = String(target)
  listView = false
  localStorage.setItem(LAST_PAGE_KEY, String(target))
}

function goToPage(): void {
  const page = Number.parseInt(pageInput, 10)
  if (Number.isInteger(page) && page >= 1 && page <= PAGE_COUNT) {
    showPage(page)
  } else {
    pageInput = String(current)
  }
}

function goToSurah(surah: number): void {
  const entry = surahs.find((item) => item.surah === surah)
  if (entry) showPage(entry.firstPage)
}

function goToJuz(juzNumber: number): void {
  const page = meta?.juzPages[juzNumber - 1]
  if (page !== undefined) showPage(page)
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
  if (viewport) viewport.scrollTop = 0
}

function openSearchResult(ayah: AyahMeta): void {
  searchQuery = ""
  showPage(ayah.page)
}

function jumpToBookmark(key: VerseKey): void {
  repository
    .ayahs()
    .then((all) => {
      const ayah = all.find((item) => `${item.surah}:${item.ayah}` === key)
      if (ayah) {
        bookmarksOpen = false
        showPage(ayah.page)
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
  showPage(current + by)
}

/* ---- controls ------------------------------------------------------------ */

function onPagePointerDown(event: PointerEvent): void {
  if (listView || (event.pointerType === "mouse" && event.button !== 0)) return
  swipeOrigin = { x: event.clientX, y: event.clientY }
}

function onPagePointerUp(event: PointerEvent): void {
  const origin = swipeOrigin
  swipeOrigin = null
  if (listView || !origin) return
  const deltaX = event.clientX - origin.x
  const deltaY = event.clientY - origin.y
  if (Math.abs(deltaX) < 56 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return
  suppressTapUntil = Date.now() + 350
  turn(deltaX > 0 ? 1 : -1)
}

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
    showPage(1)
  } else if (event.key === "End") {
    event.preventDefault()
    showPage(PAGE_COUNT)
  }
}

function tapAyah(key: VerseKey, extend: boolean): void {
  if (Date.now() < suppressTapUntil) return
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

<svelte:window
  onkeydown={onKeydown}
  onpointerup={onPagePointerUp}
  onpointercancel={() => (swipeOrigin = null)}
/>

<div
  class="relative flex h-dvh flex-col overflow-hidden bg-bg text-ink"
  style="--reader-chrome: {mobileHeaderOpen ? '236px' : '172px'}"
>
  <header
    class="{mobileHeaderOpen ? 'grid' : 'hidden'} z-10 shrink-0 grid-cols-1 items-center gap-x-4 gap-y-1.5 border-b border-hairline bg-surface/95 px-4 py-1.5 shadow-sm backdrop-blur-md md:grid md:grid-cols-[auto_minmax(0,1fr)] md:gap-y-2 md:px-6 md:py-2"
  >
    <div class="flex w-full min-w-0 items-center gap-2.5">
      <img
        src="/icons/icon.svg"
        alt=""
        class="h-8 w-8 rounded-xl border border-hairline bg-bg p-1.5 shadow-sm md:h-9 md:w-9"
      />
      <div class="min-w-0">
        <div class="text-sm font-semibold tracking-tight">QuranMemoriser</div>
        <div class="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Madinah Mushaf
        </div>
      </div>
      <button
        class="ml-auto rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-accent md:hidden"
        onclick={() => (mobileHeaderOpen = false)}
        aria-label="Hide controls"
        title="Hide controls"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 9 6 6 6-6"></path>
        </svg>
      </button>
    </div>
    <div class="flex min-w-0 flex-wrap items-center gap-1 md:justify-start">
      <select
        class="max-w-36 rounded-lg border border-hairline bg-bg px-2.5 py-1.5 text-sm shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        aria-label="Go to surah"
        onchange={(event) => goToSurah(Number(event.currentTarget.value))}
      >
        <option value="" selected={surahs.length === 0}>Surah</option>
        {#each surahs as surah (surah.surah)}
          <option value={surah.surah}>{surah.surah}. {surah.name}</option>
        {/each}
      </select>
      <select
        class="rounded-lg border border-hairline bg-bg px-2.5 py-1.5 text-sm shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
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
          class="w-16 rounded-lg border border-hairline bg-bg px-2 py-1.5 text-sm tabular-nums shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          type="number"
          min="1"
          max={PAGE_COUNT}
          bind:value={pageInput}
          aria-label="Go to page"
        />
        <button class="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">Go</button>
      </form>
      <!-- The mushaf turns like the print: forward is to the left. -->
      <button
        class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-accent active:scale-95"
        onclick={() => turn(1)}
        aria-label="Next page"
        title="Next page (←)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
        <span class="font-semibold tabular-nums">{current} <span class="text-ink-muted">/</span> {PAGE_COUNT}</span>
      </div>
      <button
        class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-accent active:scale-95"
        onclick={() => turn(-1)}
        aria-label="Previous page"
        title="Previous page (→)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 5l7 7-7 7"></path>
        </svg>
      </button>
    </div>
    <div
      class="relative col-span-full flex w-full flex-wrap items-center justify-start gap-1.5 md:col-span-2"
    >
      <div class="relative min-w-0 flex-1 sm:flex-none">
        <svg
          class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-4-4"></path>
        </svg>
        <input
          class="w-full rounded-lg border border-hairline bg-bg py-1.5 pr-3 pl-9 text-sm shadow-sm outline-none transition placeholder:text-ink-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 sm:w-56"
          type="search"
          bind:value={searchQuery}
          placeholder="Search Arabic or verse"
          aria-label="Search Quran"
        />
        {#if searchQuery.trim()}
          <div class="absolute right-0 top-full z-30 mt-2 max-h-80 w-80 max-w-[90vw] overflow-auto rounded-xl border border-hairline bg-surface-raised p-2 shadow-xl ring-1 ring-black/5">
            {#if searchError}
              <p class="p-2 text-sm text-red-700">{searchError}</p>
            {:else if searchLoading}
              <p class="flex items-center gap-2 p-2 text-sm text-ink-muted">
                <span class="h-2 w-2 animate-pulse rounded-full bg-accent"></span>
                Searching the Quran…
              </p>
            {:else if searchResults.length === 0}
              <p class="p-2 text-sm text-ink-muted">No matching verses</p>
            {:else}
              <p class="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Search results
              </p>
              {#each searchResults as result (`${result.surah}:${result.ayah}`)}
                <button
                  class="block w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent-soft"
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
        class="rounded-lg border border-hairline px-3 py-1.5 text-sm transition hover:bg-accent-soft"
        class:bg-accent-soft={listView}
        class:text-accent={listView}
        class:font-medium={listView}
        onclick={toggleView}
        aria-pressed={listView}
      >{listView ? "Mushaf" : "Ayah list"}</button>
      <button
        class="rounded-lg border border-hairline px-3 py-1.5 text-sm transition hover:bg-accent-soft"
        onclick={() => (bookmarksOpen = !bookmarksOpen)}
        aria-expanded={bookmarksOpen}
        aria-label="Bookmarks ({savedBookmarks.length})"
      >
        Saved
        <span class="ml-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
          {savedBookmarks.length}
        </span>
      </button>
      {#if bookmarksOpen}
        <div class="absolute right-0 top-full z-30 mt-2 max-h-80 w-64 overflow-auto rounded-xl border border-hairline bg-surface-raised p-2 shadow-xl ring-1 ring-black/5">
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
        class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-accent active:scale-95"
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

  {#if !mobileHeaderOpen}
    <button
      class="absolute top-2 right-3 z-20 rounded-xl border border-hairline bg-surface/95 p-2 text-ink-muted shadow-md backdrop-blur-md transition hover:bg-accent-soft hover:text-accent md:hidden"
      onclick={() => (mobileHeaderOpen = true)}
      aria-label="Show controls"
      title="Show controls"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 6h16M4 12h16M4 18h16"></path>
      </svg>
    </button>
  {/if}

  <main
    bind:this={viewport}
    onpointerdown={onPagePointerDown}
    class="relative min-h-0 flex-1 overflow-x-hidden"
    class:overflow-y-auto={listView}
    class:overflow-hidden={!listView}
  >
    {#if loadError}
      <p class="mx-auto mt-6 max-w-xl rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{loadError}</p>
    {/if}
    {#if listView}
      <AyahList scrollElement={viewport} {ayahs} {selection} onTap={tapAyah} />
    {:else}
      <div class="page-stage sheet-anchor">
        {#key current}
          <div
            class="page-slide"
            in:fly={{ x: turnDirection * 96, duration: 240 }}
            out:fly={{ x: -turnDirection * 96, duration: 240 }}
          >
            <MushafSheet
              page={current}
              chunk={chunks.get(current) ?? null}
              {juz}
              {fitBody}
              {centreBelow}
              {fonts}
              {selection}
              onTap={tapAyah}
            />
          </div>
        {/key}
      </div>
    {/if}
  </main>

  <SelectionBanner {selection} {repository} {bookmarks} {context} onBookmarks={(keys) => (savedBookmarks = keys)} />
</div>

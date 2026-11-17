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
import {
  type BookmarkRepository,
  type WordRangeBookmark,
  wordRangeBookmarkKey,
} from "../data/bookmark-repository"
import type { CommandContext, MushafRepository } from "../data/mushaf-repository"
import type { PageFontRegistry } from "../data/page-fonts"
import AudioBar from "../../audio/components/AudioBar.svelte"
import { RECITERS, ayahUrl } from "../../audio/data/audio-repository"
import { tracksForJuz, tracksForSurah } from "../../audio/model/playlists"
import { AudioPlayer } from "../../audio/model/player.svelte"
import {
  dispatchSelection,
  ExtendRun,
  type RunCandidate,
  type SelectionRun,
  type SelectionEngine,
  TapRun,
} from "../model/selection.svelte"
import type { WordLedger } from "../model/word-ledger"
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
let savedWordBookmarks = $state<WordRangeBookmark[]>([])
let downloadSurah = $state(1)
let downloadProgress = $state<{
  surah: number
  done: number
  total: number
  error: string | null
} | null>(null)
let downloadedAudio = $state<{ surah: number; voices: { id: string; ayahs: number }[] }[]>([])
let audioInventoryError = $state<string | null>(null)
let swipeOrigin: { x: number; y: number } | null = null
let suppressTapUntil = 0
/** The recitation player: created once, lives across playlists. */
const player = new AudioPlayer()
/** All page chunks are loaded up front so page turns never wait on text data. */
const chunks = new SvelteMap<number, PageChunk>()
/** Slot indexes within verses, once every chunk has landed. */
let ledger = $state<WordLedger | null>(null)

const juz = $derived(meta ? repository.juzOfPage(current, meta) : null)
const currentSurah = $derived(surahOfPage(current))
const downloadSummary = $derived(surahs.find((item) => item.surah === downloadSurah) ?? null)
const currentDownload = $derived(
  downloadProgress?.surah === downloadSurah ? downloadProgress : null,
)
const selectedSurahDownloaded = $derived.by(() => {
  if (downloadSummary === null) return false
  const downloaded = downloadedAudio.find((item) => item.surah === downloadSurah)
  return (
    downloaded?.voices.length === RECITERS.length &&
    downloaded.voices.every((voice) => voice.ayahs >= downloadSummary.verseCount)
  )
})
const fitBody = $derived(meta?.fit.body ?? 19.76)
const centreBelow = $derived(meta?.fit.centreBelow ?? 0.55)
const savedBookmarkCount = $derived(savedBookmarks.length + savedWordBookmarks.length)

function wordRangeLabel(range: SelectionRun): string {
  const start = `${range.start.surah}:${range.start.ayah} word ${range.start.word}`
  const end = `${range.end.surah}:${range.end.ayah} word ${range.end.word}`
  return `${start}–${end}`
}

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
      downloadSurah = surahOfPage(current)?.surah ?? 1
      void refreshDownloadedAudio()
    })
    .catch((error: unknown) => {
      if (!cancelled) loadError = error instanceof Error ? error.message : String(error)
    })
  try {
    savedBookmarks = bookmarks.list()
    savedWordBookmarks = bookmarks.listWordRanges()
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error)
  }
  return () => {
    cancelled = true
  }
})

// The offline page chunks total only a few megabytes; keep them ready for turns.
// The word ledger shares the same cached page promises and builds last.
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
  repository.wordLedger().then(
    (built) => {
      if (!cancelled) ledger = built
    },
    () => {},
  )
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

/** The surah a page belongs to, by its printed page span. */
function surahOfPage(page: number): SurahSummary | null {
  return surahs.find((item) => page >= item.firstPage && page <= item.lastPage) ?? null
}

function playCurrentSurah(): void {
  const summary = currentSurah
  if (summary === null) return
  player.play(tracksForSurah(summary.surah, summary.verseCount), {
    kind: "surah",
    label: summary.name,
  })
}

/** Read the audio cache into a compact offline-download inventory. */
async function refreshDownloadedAudio(): Promise<void> {
  if (!("caches" in globalThis)) return
  try {
    const cache = await caches.open("qm-recitation")
    const grouped = new Map<number, Map<string, Set<number>>>()
    for (const request of await cache.keys()) {
      const url = new URL(request.url)
      const match = url.pathname.match(/\/data\/([^/]+)\/(\d{6})\.mp3$/)
      if (!match) continue
      const reciter = RECITERS.find((item) => item.folder === match[1])
      if (!reciter) continue
      const reference = match[2] ?? ""
      const surah = Number(reference.slice(0, 3))
      const ayah = Number(reference.slice(3))
      const voices = grouped.get(surah) ?? new Map<string, Set<number>>()
      const ayahs = voices.get(reciter.id) ?? new Set<number>()
      ayahs.add(ayah)
      voices.set(reciter.id, ayahs)
      grouped.set(surah, voices)
    }
    downloadedAudio = [...grouped.entries()]
      .map(([surah, voices]) => ({
        surah,
        voices: [...voices.entries()]
          .map(([id, ayahs]) => ({ id, ayahs: ayahs.size }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => a.surah - b.surah)
    audioInventoryError = null
  } catch (error) {
    audioInventoryError = error instanceof Error ? error.message : String(error)
  }
}

/** Cache every ayah from every listed reciter for offline playback. */
async function downloadSelectedSurah(): Promise<void> {
  const summary = downloadSummary
  if (
    summary === null ||
    (downloadProgress !== null && downloadProgress.done < downloadProgress.total && downloadProgress.error === null)
  ) return
  if (!("caches" in globalThis)) {
    downloadProgress = {
      surah: summary.surah,
      done: 0,
      total: summary.verseCount * RECITERS.length,
      error: "Offline downloads are not supported in this browser",
    }
    return
  }

  const total = summary.verseCount * RECITERS.length
  downloadProgress = { surah: summary.surah, done: 0, total, error: null }
  try {
    const cache = await caches.open("qm-recitation")
    let next = 0
    let failure: string | null = null
    const workers = Array.from({ length: Math.min(4, total) }, async () => {
      while (next < total && failure === null) {
        const taskIndex = next++
        const reciter = RECITERS[Math.floor(taskIndex / summary.verseCount)]
        const ayah = (taskIndex % summary.verseCount) + 1
        if (!reciter) continue
        try {
          const url = ayahUrl(reciter, summary.surah, ayah)
          if (!(await cache.match(url))) {
            const response = await fetch(url, { mode: "cors" })
            if (!response.ok) {
              failure = `${reciter.label}, ayah ${ayah}: HTTP ${response.status}`
              break
            }
            await cache.put(url, response.clone())
          }
          if (downloadProgress?.surah === summary.surah) {
            downloadProgress = { ...downloadProgress, done: downloadProgress.done + 1 }
          }
        } catch (error) {
          failure = error instanceof Error ? error.message : String(error)
        }
      }
    })
    await Promise.all(workers)
    if (failure !== null) throw new Error(failure)
    await refreshDownloadedAudio()
  } catch (error) {
    downloadProgress = {
      surah: summary.surah,
      done: downloadProgress?.done ?? 0,
      total,
      error: error instanceof Error ? error.message : String(error),
    }
    await refreshDownloadedAudio()
  }
}

function playCurrentJuz(): void {
  const juzNumber = juz
  if (juzNumber === null) return
  repository
    .ayahs()
    .then((all) => {
      player.play(tracksForJuz(all, juzNumber), { kind: "juz", label: `Juz ${juzNumber}` })
    })
    .catch((error: unknown) => {
      loadError = error instanceof Error ? error.message : String(error)
    })
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

function jumpToWordBookmark(range: WordRangeBookmark): void {
  repository
    .ayahs()
    .then((all) => {
      const ayah = all.find((item) => item.surah === range.start.surah && item.ayah === range.start.ayah)
      if (ayah) {
        bookmarksOpen = false
        showPage(ayah.page)
      }
    })
    .catch((error: unknown) => {
      loadError = error instanceof Error ? error.message : String(error)
    })
}

function removeWordBookmark(range: WordRangeBookmark): void {
  try {
    savedWordBookmarks = bookmarks.removeWordRange(range)
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

/** Every selection gesture lands here: replace, or extend when asked. */
function select(candidate: RunCandidate, extend: boolean): void {
  if (Date.now() < suppressTapUntil) return
  dispatchSelection(selection, extend ? new ExtendRun(candidate) : new TapRun(candidate), context)
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
  select({ kind: "verse", key }, extend)
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
  class="relative flex h-[100svh] flex-col overflow-hidden bg-bg text-ink"
>
  {#if mobileHeaderOpen}
    <button
      class="fixed inset-0 z-30 bg-black/25 md:hidden"
      onclick={() => (mobileHeaderOpen = false)}
      aria-label="Close controls"
    ></button>
  {/if}
  <header
    class="{mobileHeaderOpen ? 'fixed inset-y-0 right-0 z-40 flex w-[min(22rem,88vw)] flex-col gap-y-3 overflow-y-auto border-l border-hairline bg-surface px-4 py-4 shadow-xl' : 'hidden'} md:relative md:inset-auto md:z-10 md:grid md:w-auto md:shrink-0 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-x-4 md:gap-y-2 md:overflow-visible md:border-l-0 md:border-b md:bg-surface/95 md:px-6 md:py-2 md:shadow-sm md:backdrop-blur-md"
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
      <button
        class="flex items-center gap-1 rounded-lg border border-hairline bg-bg px-2 py-1.5 text-sm shadow-sm transition hover:border-accent/30 hover:bg-accent-soft disabled:opacity-40"
        onclick={playCurrentSurah}
        disabled={surahs.length === 0}
        aria-label="Play this surah"
        title="Play this surah"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z"></path></svg>
        Surah
      </button>
      <button
        class="flex items-center gap-1 rounded-lg border border-hairline bg-bg px-2 py-1.5 text-sm shadow-sm transition hover:border-accent/30 hover:bg-accent-soft disabled:opacity-40"
        onclick={playCurrentJuz}
        disabled={juz === null}
        aria-label="Play this juz"
        title="Play this juz"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z"></path></svg>
        Juz
      </button>
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
    <section class="col-span-full w-full border-t border-hairline pt-3 md:col-span-2" aria-labelledby="offline-audio-title">
      <div class="mb-2 flex items-center justify-between gap-2">
        <h2 id="offline-audio-title" class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Offline audio</h2>
        <button
          class="rounded-md px-2 py-1 text-xs text-ink-muted transition hover:bg-accent-soft hover:text-ink"
          onclick={refreshDownloadedAudio}
          aria-label="Refresh downloaded audio list"
        >Refresh</button>
      </div>
      <label class="mb-2 block text-xs text-ink-muted" for="offline-audio-surah">Surah</label>
      <div class="flex items-center gap-2">
        <select
          id="offline-audio-surah"
          class="min-w-0 flex-1 rounded-lg border border-hairline bg-bg px-2.5 py-2 text-sm shadow-sm outline-none focus:border-accent"
          bind:value={downloadSurah}
          disabled={downloadProgress !== null && downloadProgress.done < downloadProgress.total && downloadProgress.error === null}
          aria-label="Choose surah to download"
        >
          {#each surahs as surah (surah.surah)}
            <option value={surah.surah}>{surah.surah}. {surah.name}</option>
          {/each}
        </select>
        <button
          class="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          onclick={downloadSelectedSurah}
          disabled={downloadSummary === null || (downloadProgress !== null && downloadProgress.done < downloadProgress.total && downloadProgress.error === null)}
        >
          {#if currentDownload !== null && currentDownload.done < currentDownload.total && currentDownload.error === null}
            {currentDownload.done}/{currentDownload.total}
          {:else if currentDownload !== null && currentDownload.done === currentDownload.total && currentDownload.error === null}
            Downloaded
          {:else if selectedSurahDownloaded}
            Downloaded
          {:else}
            Download all voices
          {/if}
        </button>
      </div>
      <p class="mt-1 text-[11px] text-ink-muted">Downloads {RECITERS.length} reciters for offline playback.</p>
      {#if currentDownload?.error}
        <p class="mt-2 text-xs text-red-700" role="alert">Download failed: {currentDownload.error}</p>
      {/if}
      <div class="mt-3 border-t border-hairline pt-2">
        <h3 class="mb-1 text-xs font-medium text-ink">Downloaded audio</h3>
        {#if audioInventoryError}
          <p class="text-xs text-red-700">{audioInventoryError}</p>
        {:else if downloadedAudio.length === 0}
          <p class="text-xs text-ink-muted">No audio files are cached yet.</p>
        {:else}
          <ul class="max-h-40 space-y-2 overflow-y-auto pr-1">
            {#each downloadedAudio as item (item.surah)}
              {@const summary = surahs.find((surah) => surah.surah === item.surah)}
              <li class="rounded-lg bg-bg px-2.5 py-2 text-xs">
                <div class="font-medium text-ink">{item.surah}. {summary?.name ?? `Surah ${item.surah}`}</div>
                {#each item.voices as voice (voice.id)}
                  {@const reciter = RECITERS.find((entry) => entry.id === voice.id)}
                  <div class="mt-0.5 text-ink-muted">{reciter?.label ?? voice.id}: {voice.ayahs}/{summary?.verseCount ?? "?"} ayahs</div>
                {/each}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>
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
        aria-label="Bookmarks ({savedBookmarkCount})"
      >
        Saved
        <span class="ml-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
          {savedBookmarkCount}
        </span>
      </button>
      {#if bookmarksOpen}
        <div class="absolute right-0 top-full z-30 mt-2 max-h-80 w-64 overflow-auto rounded-xl border border-hairline bg-surface-raised p-2 shadow-xl ring-1 ring-black/5">
          {#if savedBookmarkCount === 0}
            <p class="p-2 text-sm text-ink-muted">No bookmarks yet</p>
          {:else}
            {#each savedBookmarks as key (key)}
              <div class="flex items-center gap-1">
                <button class="flex-1 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent-soft" onclick={() => jumpToBookmark(key)}>{key}</button>
                <button class="rounded px-2 py-1 text-ink-muted hover:bg-accent-soft" aria-label="Remove bookmark {key}" onclick={() => removeBookmark(key)}>×</button>
              </div>
            {/each}
            {#each savedWordBookmarks as range (wordRangeBookmarkKey(range))}
              {@const label = wordRangeLabel(range)}
              <div class="flex items-center gap-1">
                <button
                  class="flex-1 rounded-lg px-3 py-2 text-left text-sm leading-snug hover:bg-accent-soft"
                  onclick={() => jumpToWordBookmark(range)}
                  title="Go to bookmarked word range"
                >
                  <span class="mr-1 text-[10px] font-semibold text-accent uppercase">Words</span>
                  {label}
                </button>
                <button
                  class="rounded px-2 py-1 text-ink-muted hover:bg-accent-soft"
                  aria-label="Remove word bookmark {label}"
                  onclick={() => removeWordBookmark(range)}
                >
                  ×
                </button>
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
      class="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-20 rounded-xl border border-hairline bg-surface/95 p-2 text-ink-muted shadow-md backdrop-blur-md transition hover:bg-accent-soft hover:text-accent md:hidden"
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
    class="relative min-h-0 flex-1 overflow-x-hidden overscroll-none"
    class:overflow-y-auto={listView}
    class:overflow-hidden={!listView}
  >
    {#if loadError}
      <p class="mx-auto mt-6 max-w-xl rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{loadError}</p>
    {/if}
    {#if listView}
      <AyahList scrollElement={viewport} {ayahs} {selection} bookmarks={savedBookmarks} onTap={tapAyah} />
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
              {ledger}
              bookmarkedKeys={savedBookmarks}
              bookmarkedWordRanges={savedWordBookmarks}
              onSelect={select}
            />
          </div>
        {/key}
      </div>
    {/if}
  </main>

  <SelectionBanner
    {selection}
    {repository}
    {bookmarks}
    {player}
    {context}
    raised={player.active}
    onBookmarks={(keys) => (savedBookmarks = keys)}
    onWordBookmarks={(ranges) => (savedWordBookmarks = ranges)}
  />
  <AudioBar {player} {surahs} />
</div>

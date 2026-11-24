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
import AudioBar from "../../audio/components/AudioBar.svelte"
import OfflineAudioDialog from "../../audio/components/OfflineAudioDialog.svelte"
import type { OfflineAudioRepository } from "../../audio/data/offline-audio-repository"
import { AudioPlayer } from "../../audio/model/player.svelte"
import { tracksForJuz, tracksForSurah } from "../../audio/model/playlists"
import type { BookmarkRepository, WordRangeBookmark } from "../data/bookmark-repository"
import type { CommandContext, MushafRepository } from "../data/mushaf-repository"
import type { PageFontRegistry } from "../data/page-fonts"
import { ReaderBookmarks } from "../model/reader-bookmarks.svelte"
import { surahOfPage } from "../model/reader-helpers"
import { clampPage, LAST_PAGE_KEY, PAGE_COUNT, restorePage } from "../model/reader-page"
import {
  dispatchSelection,
  ExtendRun,
  type RunCandidate,
  type SelectionEngine,
  TapRun,
} from "../model/selection.svelte"
import type { WordLedger } from "../model/word-ledger"
import AyahList from "./AyahList.svelte"
import MushafSheet from "./MushafSheet.svelte"
import ReaderMenu from "./ReaderMenu.svelte"
import ReaderNavDialog from "./ReaderNavDialog.svelte"
import SelectionBanner from "./SelectionBanner.svelte"

interface Props {
  repository: MushafRepository
  bookmarks: BookmarkRepository
  fonts: PageFontRegistry
  selection: SelectionEngine
  offlineAudio: OfflineAudioRepository
  context: Promise<CommandContext>
}

let { repository, bookmarks, fonts, selection, offlineAudio, context }: Props = $props()

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
let menuOpen = $state(false)

// svelte-ignore state_referenced_locally - repository instance is stable for component lifetime
const readerBookmarks = new ReaderBookmarks(bookmarks)
let offlineAudioOpen = $state(false)
let navOpen = $state(false)
let swipeOrigin: { x: number; y: number } | null = null
let suppressTapUntil = 0
/** The recitation player: created once, lives across playlists. */
const player = new AudioPlayer(
  () => new Audio(),
  (url) => offlineAudio.localPlaybackUrl(url),
)

/** While a selection playlist is open, a new selection replaces its tracks. */
let lastSelectionRevision = -1
let suppressSelectionPlay = false

function selectionPlayStarted(): void {
  suppressSelectionPlay = true
}

$effect(() => {
  const isSelectionPlaylist = player.active && player.source?.kind === "selection"
  const revision = selection.revision
  if (!isSelectionPlaylist || selection.run === null) {
    lastSelectionRevision = -1
    return
  }
  if (revision === lastSelectionRevision) return
  if (suppressSelectionPlay) {
    suppressSelectionPlay = false
    lastSelectionRevision = revision
    return
  }
  lastSelectionRevision = revision

  // Changing the selection stops playback instead of auto-playing or repeating.
  player.stop()
})

/** All page chunks are loaded up front so page turns never wait on text data. */
const chunks = new SvelteMap<number, PageChunk>()
/** Slot indexes within verses, once every chunk has landed. */
let ledger = $state<WordLedger | null>(null)

const juz = $derived(meta ? repository.juzOfPage(current, meta) : null)
const hizb = $derived(meta ? repository.hizbOfPage(current, meta) : null)
const currentSurah = $derived(surahOfPage(surahs, current))
const fitBody = $derived(meta?.fit.body ?? 19.76)
const centreBelow = $derived(meta?.fit.centreBelow ?? 0.55)
const revelations = $derived(
  new Map(surahs.map((surah) => [surah.surah, surah.revelation] as const)),
)

// Formatting and page helpers live in ../model/reader-helpers and ../model/reader-page.

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
  const bookmarkError = readerBookmarks.load()
  if (bookmarkError) loadError = bookmarkError
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

function showPage(page: number): void {
  const target = clampPage(page)
  if (target !== current) turnDirection = target > current ? -1 : 1
  current = target
  listView = false
  menuOpen = false
  localStorage.setItem(LAST_PAGE_KEY, String(target))
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
// surahOfPage is provided by ../model/reader-helpers.

function playCurrentSurah(): void {
  const summary = currentSurah
  if (summary === null) return
  menuOpen = false
  player.play(tracksForSurah(summary.surah, summary.verseCount), {
    kind: "surah",
    label: summary.name,
  })
}

function playCurrentJuz(): void {
  const juzNumber = juz
  if (juzNumber === null) return
  menuOpen = false
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
  menuOpen = false
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
        readerBookmarks.open = false
        showPage(ayah.page)
      }
    })
    .catch((error: unknown) => {
      loadError = error instanceof Error ? error.message : String(error)
    })
}

function removeBookmark(key: VerseKey): void {
  const error = readerBookmarks.remove(key)
  if (error) loadError = error
}

function jumpToWordBookmark(range: WordRangeBookmark): void {
  repository
    .ayahs()
    .then((all) => {
      const ayah = all.find(
        (item) => item.surah === range.start.surah && item.ayah === range.start.ayah,
      )
      if (ayah) {
        readerBookmarks.open = false
        showPage(ayah.page)
      }
    })
    .catch((error: unknown) => {
      loadError = error instanceof Error ? error.message : String(error)
    })
}

function removeWordBookmark(range: WordRangeBookmark): void {
  const error = readerBookmarks.removeWordRange(range)
  if (error) loadError = error
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
  if (offlineAudioOpen) return
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
      localStorage.setItem(LAST_PAGE_KEY, String(ayah.page))
    }
  }
  select({ kind: "verse", key }, extend)
}

function openOfflineAudio(): void {
  menuOpen = false
  offlineAudioOpen = true
}

function openNav(): void {
  menuOpen = false
  navOpen = true
}

function cycleTheme(): void {
  const themes = ["parchment", "sepia", "night"] as const
  const colors: Record<string, string> = {
    parchment: "#fffdf7",
    sepia: "#fdf8ec",
    night: "#211e1b",
  }
  const now = document.documentElement.dataset.theme ?? "parchment"
  const at = themes.indexOf(now as (typeof themes)[number])
  const next = themes[(at + 1) % themes.length]
  if (next === undefined) return
  document.documentElement.dataset.theme = next
  localStorage.setItem("qm.theme", next)
  const color = colors[next] ?? "#fffdf7"
  document.documentElement.style.backgroundColor = color
  document.documentElement.style.colorScheme = next === "night" ? "dark" : "light"
  document.body.style.backgroundColor = color
  const menu = document.getElementById("reader-menu")
  if (menu) {
    const bg = menu.querySelector(":scope > div") as HTMLElement | null
    if (bg) bg.style.backgroundColor = color
  }
  document.querySelectorAll<HTMLElement>(".offline-audio,[role='dialog']").forEach((el) => {
    if (getComputedStyle(el).position !== "fixed") return
    const bg = el.querySelector(":scope > div[aria-hidden='true']") as HTMLElement | null
    if (bg) bg.style.backgroundColor = color
    else el.style.backgroundColor = color
  })
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.remove()
  meta = document.createElement("meta")
  meta.setAttribute("name", "theme-color")
  meta.setAttribute("content", color)
  document.head.appendChild(meta)
}
</script>

<svelte:window
  onkeydown={onKeydown}
  onpointerup={onPagePointerUp}
  onpointercancel={() => (swipeOrigin = null)}
/>

<div
  class="relative flex h-[100svh] flex-col overflow-hidden bg-page text-ink"
>
  <ReaderMenu
    open={menuOpen}
    onClose={() => (menuOpen = false)}
    onOpen={() => (menuOpen = true)}
    onOpenOfflineAudio={openOfflineAudio}
  />

  {#if !menuOpen && !navOpen && !offlineAudioOpen}
    <button
      class="absolute top-[max(0.5rem,env(safe-area-inset-top))] left-[max(0.75rem,env(safe-area-inset-left))] z-20 flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition hover:bg-accent-soft hover:text-accent"
      onclick={cycleTheme}
      aria-label="Change theme"
      title="Change theme"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      >
        <circle cx="12" cy="12" r="4.2"></circle>
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"></path>
      </svg>
    </button>
  {/if}

  {#if !menuOpen && !navOpen && !offlineAudioOpen && currentSurah}
    <button
      class="absolute top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 z-20 grid w-[min(28rem,calc(100%-7rem))] -translate-x-1/2 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 overflow-hidden rounded-full border border-hairline bg-surface/95 px-4 py-1.5 text-sm font-medium text-ink shadow-md backdrop-blur-md hover:transition-colors hover:duration-150 hover:bg-accent-soft hover:text-accent"
      onclick={openNav}
      aria-label="Current surah: {currentSurah.name}{juz ? `, Juz ${juz}` : ""}{hizb ? `, Hizb ${hizb}` : ""}. Open navigation"
      title="Go to surah, page, juz, or hizb"
    >
      <span class="shrink-0 text-left text-xs text-ink-muted tabular-nums">{juz ? `Juz ${juz}` : ""}</span>
      <span class="min-w-0 truncate text-center text-sm font-semibold"><span class="tabular-nums text-ink-muted">{currentSurah.surah}.</span> {currentSurah.name}</span>
      <span class="shrink-0 text-right text-xs text-ink-muted tabular-nums">{hizb ? `Hizb ${hizb}` : ""}</span>
    </button>
  {/if}

  <main
    bind:this={viewport}
    onpointerdown={onPagePointerDown}
    class="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-none bg-page pt-14"
  >
    {#if loadError}
      <p class="mx-auto mt-6 max-w-xl rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{loadError}</p>
    {/if}
    {#if listView}
      <AyahList scrollElement={viewport} {ayahs} {selection} bookmarks={readerBookmarks.saved} onTap={tapAyah} />
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
              {revelations}
              {fitBody}
              {centreBelow}
              {fonts}
              {selection}
              {ledger}
              bookmarkedKeys={readerBookmarks.saved}
              bookmarkedWordRanges={readerBookmarks.wordRanges}
              onSelect={select}
            />
          </div>
        {/key}
      </div>
    {/if}
  </main>

  {#if !player.active}
    <SelectionBanner
      {selection}
      {repository}
      {bookmarks}
      {player}
      {context}
      onPlay={selectionPlayStarted}
      onBookmarks={(keys) => (readerBookmarks.saved = keys)}
      onWordBookmarks={(ranges) => (readerBookmarks.wordRanges = ranges)}
    />
  {/if}
  <AudioBar {player} {surahs} {selection} />
  <ReaderNavDialog
    open={navOpen}
    {surahs}
    {ayahs}
    {meta}
    {current}
    onClose={() => (navOpen = false)}
    onGoSurah={goToSurah}
    onGoJuz={goToJuz}
    onGoPage={showPage}
  />
  <OfflineAudioDialog
    open={offlineAudioOpen}
    {surahs}
    initialSurah={currentSurah?.surah ?? null}
    currentReciterId={player.reciterId}
    repository={offlineAudio}
    onClose={() => (offlineAudioOpen = false)}
  />
</div>

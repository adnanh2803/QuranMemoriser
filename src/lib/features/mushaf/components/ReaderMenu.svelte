<script lang="ts">
import type { AyahMeta, SurahSummary, VerseKey } from "../../../domain/schemas"
import type { WordRangeBookmark } from "../data/bookmark-repository"
import ReaderNav from "./ReaderNav.svelte"
import ReaderTools from "./ReaderTools.svelte"

interface Props {
  open: boolean
  surahs: SurahSummary[]
  juz: number | null
  current: number
  pageInput: string
  searchQuery: string
  searchError: string | null
  searchLoading: boolean
  searchResults: AyahMeta[]
  listView: boolean
  bookmarksOpen: boolean
  savedBookmarks: VerseKey[]
  savedWordBookmarks: WordRangeBookmark[]
  savedBookmarkCount: number
  onClose: () => void
  onOpen: () => void
  onGoSurah: (surah: number) => void
  onGoJuz: (juz: number) => void
  onPlaySurah: () => void
  onPlayJuz: () => void
  onGoPage: () => void
  onTurn: (by: number) => void
  onOpenOfflineAudio: () => void
  onOpenSearchResult: (ayah: AyahMeta) => void
  onToggleView: () => void
  onToggleBookmarks: () => void
  onCycleTheme: () => void
  onJumpBookmark: (key: VerseKey) => void
  onRemoveBookmark: (key: VerseKey) => void
  onJumpWordBookmark: (range: WordRangeBookmark) => void
  onRemoveWordBookmark: (range: WordRangeBookmark) => void
  onPageInputChange: (value: string) => void
  onSearchQueryChange: (value: string) => void
}

let {
  open,
  surahs,
  juz,
  current,
  pageInput,
  searchQuery,
  searchError,
  searchLoading,
  searchResults,
  listView,
  bookmarksOpen,
  savedBookmarks,
  savedWordBookmarks,
  savedBookmarkCount,
  onClose,
  onOpen,
  onGoSurah,
  onGoJuz,
  onPlaySurah,
  onPlayJuz,
  onGoPage,
  onTurn,
  onOpenOfflineAudio,
  onOpenSearchResult,
  onToggleView,
  onToggleBookmarks,
  onCycleTheme,
  onJumpBookmark,
  onRemoveBookmark,
  onJumpWordBookmark,
  onRemoveWordBookmark,
  onPageInputChange,
  onSearchQueryChange,
}: Props = $props()
</script>

{#if open}
  <button class="fixed inset-0 z-30 bg-black/25" onclick={onClose} aria-label="Dismiss menu"
  ></button>
{/if}
<header
  id="reader-menu"
  class={open
    ? "fixed inset-y-0 right-0 z-40 flex w-[min(22rem,88vw)] flex-col gap-y-3 overflow-y-auto border-l border-hairline bg-surface px-4 py-4 shadow-xl"
    : "hidden"}
>
  <div class="flex w-full min-w-0 items-center gap-2.5">
    <img
      src="{import.meta.env.BASE_URL}icons/icon.svg"
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
      class="ml-auto rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-accent"
      onclick={onClose}
      aria-label="Close menu"
      title="Close menu"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 6 6 18M6 6l12 12"></path>
      </svg>
    </button>
  </div>

  <ReaderNav
    {surahs}
    {juz}
    {current}
    {pageInput}
    {onGoSurah}
    {onGoJuz}
    {onPlaySurah}
    {onPlayJuz}
    {onGoPage}
    {onTurn}
    {onPageInputChange}
  />

  <ReaderTools
    {surahs}
    {searchQuery}
    {searchError}
    {searchLoading}
    {searchResults}
    {listView}
    {bookmarksOpen}
    {savedBookmarks}
    {savedWordBookmarks}
    {savedBookmarkCount}
    {onOpenOfflineAudio}
    {onOpenSearchResult}
    {onToggleView}
    {onToggleBookmarks}
    {onCycleTheme}
    {onJumpBookmark}
    {onRemoveBookmark}
    {onJumpWordBookmark}
    {onRemoveWordBookmark}
    {onSearchQueryChange}
  />
</header>

{#if !open}
  <button
    class="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-20 rounded-xl border border-hairline bg-surface/95 p-2 text-ink-muted shadow-md backdrop-blur-md transition hover:bg-accent-soft hover:text-accent"
    onclick={onOpen}
    aria-label="Show controls"
    aria-expanded={open}
    aria-controls="reader-menu"
    title="Show controls"
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    >
      <path d="M4 6h16M4 12h16M4 18h16"></path>
    </svg>
  </button>
{/if}

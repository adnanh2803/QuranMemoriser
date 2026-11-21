<script lang="ts">
import type { AyahMeta, SurahSummary, VerseKey } from "../../../domain/schemas"
import { type WordRangeBookmark, wordRangeBookmarkKey } from "../data/bookmark-repository"
import {
  verseSurah,
  wordRangeLabel,
  wordRangeSurahs,
  wordRangeTitle,
} from "../model/reader-helpers"

interface Props {
  surahs: SurahSummary[]
  searchQuery: string
  searchError: string | null
  searchLoading: boolean
  searchResults: AyahMeta[]
  listView: boolean
  bookmarksOpen: boolean
  savedBookmarks: VerseKey[]
  savedWordBookmarks: WordRangeBookmark[]
  savedBookmarkCount: number
  onOpenOfflineAudio: () => void
  onOpenSearchResult: (ayah: AyahMeta) => void
  onToggleView: () => void
  onToggleBookmarks: () => void
  onCycleTheme: () => void
  onJumpBookmark: (key: VerseKey) => void
  onRemoveBookmark: (key: VerseKey) => void
  onJumpWordBookmark: (range: WordRangeBookmark) => void
  onRemoveWordBookmark: (range: WordRangeBookmark) => void
  onSearchQueryChange: (value: string) => void
}

let {
  surahs,
  searchQuery,
  searchError,
  searchLoading,
  searchResults,
  listView,
  bookmarksOpen,
  savedBookmarks,
  savedWordBookmarks,
  savedBookmarkCount,
  onOpenOfflineAudio,
  onOpenSearchResult,
  onToggleView,
  onToggleBookmarks,
  onCycleTheme,
  onJumpBookmark,
  onRemoveBookmark,
  onJumpWordBookmark,
  onRemoveWordBookmark,
  onSearchQueryChange,
}: Props = $props()
</script>

<button
  class="col-span-full flex w-full items-center gap-3 rounded-2xl border border-hairline bg-bg px-3 py-3 text-left shadow-sm transition hover:border-accent/30 hover:bg-accent-soft md:col-span-2"
  onclick={onOpenOfflineAudio}
  aria-label="Open offline recitations"
>
  <span
    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"
    aria-hidden="true"
  >
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 4v11"></path>
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5"></path>
      <path d="M5 19h14"></path>
    </svg>
  </span>
  <span class="min-w-0 flex-1">
    <span class="block text-sm font-medium">Offline recitations</span>
    <span class="block text-xs text-ink-muted"
      >Choose a surah and the reciters to save on this device</span
    >
  </span>
  <svg
    class="shrink-0 text-ink-muted"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="m9 5 7 7-7 7"></path>
  </svg>
</button>
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
      value={searchQuery}
      oninput={(event) => onSearchQueryChange(event.currentTarget.value)}
      placeholder="Search Arabic or verse"
      aria-label="Search Quran"
    />
    {#if searchQuery.trim()}
      <div
        class="absolute right-0 top-full z-30 mt-2 max-h-80 w-80 max-w-[90vw] overflow-auto rounded-xl border border-hairline bg-surface-raised p-2 shadow-xl ring-1 ring-black/5"
      >
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
              onclick={() => onOpenSearchResult(result)}
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
    onclick={onToggleView}
    aria-pressed={listView}>{listView ? "Mushaf" : "Ayah list"}</button
  >
  <button
    class="rounded-lg border border-hairline px-3 py-1.5 text-sm transition hover:bg-accent-soft"
    onclick={onToggleBookmarks}
    aria-expanded={bookmarksOpen}
    aria-label="Bookmarks ({savedBookmarkCount})"
  >
    Saved
    <span class="ml-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
      {savedBookmarkCount}
    </span>
  </button>
  {#if bookmarksOpen}
    <div
      class="absolute right-0 top-full z-30 mt-2 max-h-80 w-72 overflow-auto rounded-xl border border-hairline bg-surface-raised p-2 shadow-xl ring-1 ring-black/5"
    >
      {#if savedBookmarkCount === 0}
        <div class="flex items-start gap-2.5 px-2.5 py-3">
          <span class="mt-1 h-7 w-[3px] shrink-0 rounded-full bg-hairline" aria-hidden="true"
          ></span>
          <div>
            <p class="text-sm font-medium">No bookmarks yet</p>
            <p class="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Select an ayah or a phrase, then tap the bookmark in the selection bar.
            </p>
          </div>
        </div>
      {:else}
        {#if savedBookmarks.length > 0}
          <p
            class="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase"
          >
            Verses
          </p>
          {#each savedBookmarks as key (key)}
            <div class="flex items-center gap-0.5">
              <button
                class="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1.5 pr-1 pl-2 text-left transition hover:bg-accent-soft"
                onclick={() => onJumpBookmark(key)}
                aria-label={key}
                title={`${key} · ${verseSurah(surahs, key)}`}
              >
                <span class="h-7 w-[3px] shrink-0 rounded-full bg-bookmark" aria-hidden="true"
                ></span>
                <span class="min-w-0">
                  <span class="block text-sm font-medium">{key}</span>
                  <span class="block truncate text-[11px] text-ink-muted"
                    >{verseSurah(surahs, key)}</span
                  >
                </span>
              </button>
              <button
                class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink"
                aria-label="Remove bookmark {key}"
                onclick={() => onRemoveBookmark(key)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                >
                  <path d="m3.5 3.5 7 7M10.5 3.5l-7 7"></path>
                </svg>
              </button>
            </div>
          {/each}
        {/if}
        {#if savedWordBookmarks.length > 0}
          <p
            class="px-2.5 pt-3 pb-1 text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase"
          >
            Word ranges
          </p>
          {#each savedWordBookmarks as range (wordRangeBookmarkKey(range))}
            {@const title = wordRangeTitle(range)}
            <div class="flex items-center gap-0.5">
              <button
                class="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1.5 pr-1 pl-2 text-left transition hover:bg-accent-soft"
                onclick={() => onJumpWordBookmark(range)}
                aria-label={title}
                title={`${title} · ${wordRangeSurahs(surahs, range)}`}
              >
                <span class="h-7 w-[3px] shrink-0 rounded-full bg-bookmark" aria-hidden="true"
                ></span>
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium">{title}</span>
                  <span class="block truncate text-[11px] text-ink-muted"
                    >{wordRangeSurahs(surahs, range)}</span
                  >
                </span>
              </button>
              <button
                class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink"
                aria-label="Remove word bookmark {wordRangeLabel(range)}"
                onclick={() => onRemoveWordBookmark(range)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                >
                  <path d="m3.5 3.5 7 7M10.5 3.5l-7 7"></path>
                </svg>
              </button>
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  {/if}
  <button
    class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-accent active:scale-95"
    onclick={onCycleTheme}
    aria-label="Change theme"
    title="Change theme"
  >
    <!-- sun/moon theme glyph -->
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
    >
      <circle cx="12" cy="12" r="4.2"></circle>
      <path
        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"
      ></path>
    </svg>
  </button>
</div>

<script lang="ts">
import { createVirtualizer } from "@tanstack/svelte-virtual"
import { untrack } from "svelte"
import { type AyahMeta, type VerseKey, verseKey } from "../../../domain/schemas"
import type { SelectionEngine } from "../model/selection.svelte"

interface Props {
  scrollElement: HTMLElement | null
  ayahs: AyahMeta[]
  selection: SelectionEngine
  bookmarks: VerseKey[]
  onTap: (key: VerseKey, extend: boolean) => void
}

let { scrollElement, ayahs, selection, bookmarks, onTap }: Props = $props()
const bookmarkedSet = $derived(new Set(bookmarks))

const virtualizer = createVirtualizer<HTMLElement, HTMLElement>({
  count: 0,
  getScrollElement: () => scrollElement,
  estimateSize: () => 88,
  overscan: 8,
})

$effect(() => {
  const count = ayahs.length
  const element = scrollElement
  untrack(() => $virtualizer.setOptions({ count, getScrollElement: () => element }))
})

function measureElement(element: HTMLElement): void {
  $virtualizer.measureElement(element)
}
</script>

<div class="relative mx-auto max-w-3xl px-3 py-4" style="height: {$virtualizer.getTotalSize()}px">
  {#each $virtualizer.getVirtualItems() as item (item.key)}
    {@const ayah = ayahs[item.index]}
    {#if ayah}
      {@const key = verseKey(ayah.surah, ayah.ayah)}
      {@const isBookmarked = bookmarkedSet.has(key)}
      <article
        class="absolute left-3 right-3 rounded-xl border border-hairline bg-surface px-4 py-3 shadow-sm {isBookmarked ? 'border-accent/50' : ''}"
        class:bg-accent-soft={selection.has(key) || isBookmarked}
        data-index={item.index}
        use:measureElement
        style="top: 0; transform: translateY({item.start}px)"
      >
        <div class="mb-2 flex items-center justify-between gap-3 text-xs text-ink-muted">
          <span class="inline-flex items-center gap-1.5">
            {ayah.surah}:{ayah.ayah}
            {#if isBookmarked}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                class="text-accent"
                role="img"
                aria-label="Bookmarked"
              >
                <path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.5L6 21V4.75z"></path>
              </svg>
            {/if}
          </span>
          <span>Page {ayah.page} · Juz {ayah.juz}</span>
        </div>
        <button
          class="w-full text-right font-quran text-2xl leading-[2.1] text-ink"
          dir="rtl"
          onclick={(event) => onTap(key, event.shiftKey)}
          aria-pressed={selection.has(key)}
          aria-label="Select verse {ayah.surah}:{ayah.ayah}"
        >
          {ayah.text}
        </button>
      </article>
    {/if}
  {/each}
</div>

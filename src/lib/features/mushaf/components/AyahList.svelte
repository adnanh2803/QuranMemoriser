<script lang="ts">
import { createVirtualizer } from "@tanstack/svelte-virtual"
import { untrack } from "svelte"
import { type AyahMeta, type VerseKey, verseKey } from "../../../domain/schemas"
import type { SelectionEngine } from "../model/selection.svelte"

interface Props {
  scrollElement: HTMLElement | null
  ayahs: AyahMeta[]
  selection: SelectionEngine
  onTap: (key: VerseKey, extend: boolean) => void
}

let { scrollElement, ayahs, selection, onTap }: Props = $props()

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
      <article
        class="absolute left-3 right-3 rounded-xl border border-hairline bg-surface px-4 py-3 shadow-sm"
        class:bg-accent-soft={selection.has(key)}
        data-index={item.index}
        use:measureElement
        style="top: 0; transform: translateY({item.start}px)"
      >
        <div class="mb-2 flex items-center justify-between gap-3 text-xs text-ink-muted">
          <span>{ayah.surah}:{ayah.ayah}</span>
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

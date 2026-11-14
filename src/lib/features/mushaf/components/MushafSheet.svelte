<script lang="ts" module>
/** Arabic-Indic numerals for the running head and folio, as the print. */
const arabicNumber = new Intl.NumberFormat("ar-EG")
</script>

<!--
  One mushaf sheet: the paper, its running head, the printed lines and the
  folio. The shell reserves the sheet's height (its line count on the 15-line
  grid); the lines are drawn once the page's chunk and its own QCF font are
  in, and settled against the measure before they are shown.
-->
<script lang="ts">
  import type { MushafWord, PageChunk } from "../../../domain/schemas"
  import { verseKey, type VerseKey } from "../../../domain/schemas"
  import type { PageFontRegistry } from "../data/page-fonts"
  import type { SelectionEngine } from "../model/selection.svelte"
  import { settleLines } from "../model/settle"
  import { SURAH_WORD, surahNameGlyph } from "../model/surah-names"

  interface Props {
    page: number
    chunk: PageChunk | null
    juz: number | null
    fitBody: number
    centreBelow: number
    fonts: PageFontRegistry
    selection: SelectionEngine
    onTap: (key: VerseKey, extend: boolean) => void
  }

  let { page, chunk, juz, fitBody, centreBelow, fonts, selection, onTap }: Props = $props()

  let box = $state<HTMLDivElement | null>(null)
  let ready = $state(false)

  const lineCount = $derived(chunk?.lines.length ?? (page <= 2 ? 8 : 15))
  /** The surah the running head names: the one at the top of the page. */
  const headSurah = $derived.by(() => {
    if (!chunk) return null
    for (const line of chunk.lines) {
      if (line.kind === "surah") return line.surah
      // A basmalah precedes the surah's first words; keep looking.
      if (line.kind === "words") return line.words[0]?.s ?? null
    }
    return null
  })

  $effect(() => {
    // Track the chunk; an empty shell stays empty.
    if (!chunk) {
      ready = false
      return
    }
    const currentChunk = chunk
    let cancelled = false
    fonts.ensure(currentChunk.page).then(
      () => {
        if (!cancelled) settleWithRetry()
      },
      () => {
        // A missing font shows glyph codes rather than a blank page.
        if (!cancelled) ready = true
      },
    )
    return () => {
      cancelled = true
    }
  })

  function settleWithRetry(attempts = 16): void {
    const el = box
    if (!el) return
    const settled = settleLines(el, centreBelow)
    if (settled || attempts <= 0) {
      ready = true
      return
    }
    // A page just shown measures as nothing until it is laid out: retry on a
    // frame, with a timer where frames have stopped.
    requestAnimationFrame(() => {
      setTimeout(() => settleWithRetry(attempts - 1), 24)
    })
  }

  // The settle ratio (line width over measure) survives a resize; re-run to
  // re-derive the shrunk percentages and the short-line threshold.
  $effect(() => {
    const el = box
    if (!el || !chunk) return
    const observer = new ResizeObserver(() => {
      ready = false
      requestAnimationFrame(() => settleWithRetry(6))
    })
    observer.observe(el)
    return () => observer.disconnect()
  })

  const tapWord = (word: MushafWord) => (event: MouseEvent) => {
    onTap(verseKey(word.s, word.a), event.shiftKey)
  }

  const isEnd = (word: MushafWord): boolean => word.e === true
  const isSelected = (word: MushafWord): boolean =>
    selection.has(verseKey(word.s, word.a))
</script>

<section
  class="sheet"
  data-page={page}
  style="--m-fit-body:{fitBody}; --m-lines:{lineCount};"
>
  <header class="sheet-head">
    {#if juz !== null}
      <span class="ph-label ph-juz">جزء {arabicNumber.format(juz)}</span>
    {:else}
      <span class="ph-label ph-juz"></span>
    {/if}
    {#if headSurah !== null}
      <span class="ph-surah"
        ><span class="sw">{SURAH_WORD}</span><span class="sn">{surahNameGlyph(headSurah)}</span></span
      >
    {/if}
    <span class="ph-label ph-page">{arabicNumber.format(page)}</span>
  </header>

  <!-- The glyphs are private-use codepoints: gibberish to reading modes, so
       the text block is hidden and whole-ayah selection is ours to draw. -->
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div
    class="mushaf"
    class:ready
    bind:this={box}
    style="font-family:'{fonts.familyFor(page)}';"
    aria-hidden="true"
  >
    {#if chunk}
      {#each chunk.lines as line (line.line)}
        {#if line.kind === "surah"}
          <div class="m-line m-surah">
            <span class="ph-surah"
              ><span class="sw">{SURAH_WORD}</span><span class="sn"
                  >{surahNameGlyph(line.surah)}</span
              ></span
            >
          </div>
        {:else if line.kind === "basmalah"}
          <div class="m-line m-basmalah">
            <span class="m-basmalah-run">{line.glyphs.split("|").join(" ")}</span>
          </div>
        {:else}
          <div class="m-line m-ayah">
            {#each line.words as word, index (index)}
              <!-- The sheet is a picture of a page: pointer-driven whole-ayah
                   selection is deliberate, and the text block is hidden. -->
              <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
              <span
                class="m-word"
                class:m-end={isEnd(word)}
                class:m-selected={isSelected(word)}
                data-s={word.s}
                data-a={word.a}
                onclick={tapWord(word)}
              >
                {#each word.g.split(" ") as part, partIndex (partIndex)}
                  {#if partIndex > 0}<i class="m-gap"></i>{/if}{part}
                {/each}
              </span>
            {/each}
          </div>
        {/if}
      {/each}
    {/if}
  </div>

  <footer class="sheet-foot">
    <span class="folio">{arabicNumber.format(page)}</span>
  </footer>
</section>

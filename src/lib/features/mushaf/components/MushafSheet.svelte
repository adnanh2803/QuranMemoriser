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
  let fontReady = $state(false)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressOrigin: { x: number; y: number } | null = null
  let longPressFired = false

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
      fontReady = false
      return
    }
    const currentChunk = chunk
    fontReady = false
    ready = false
    let cancelled = false
    fonts.ensure(currentChunk.page).then(
      () => {
        if (!cancelled) {
          fontReady = true
          settleWithRetry(16, true)
        }
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

  function settleWithRetry(attempts = 16, fresh = false): void {
    const el = box
    if (!el) return
    // A settle that ran while the page's face was still loading once measured
    // fallback-glyph widths and cached them (the lines then sat centred at
    // their tofu sizes for good). Chrome can deliver the load() resolution
    // marginally before the face is usable for layout on a cold start, so
    // never measure while the face is not check-able: reschedule instead.
    if (!document.fonts.check(`16px "${fonts.familyFor(page)}"`)) {
      if (attempts <= 0) {
        // Give up quietly: the sheet shows glyph codes rather than spinning.
        ready = true
        return
      }
      requestAnimationFrame(() => {
        setTimeout(() => settleWithRetry(attempts - 1, fresh), 24)
      })
      return
    }
    if (fresh) {
      // The font has just become usable: measure from scratch, so a cached
      // ratio from an earlier fallback-glyph pass cannot survive.
      for (const line of el.querySelectorAll<HTMLElement>(".m-line")) {
        delete line.dataset.nat
        line.classList.remove("m-short")
        line.style.fontSize = ""
        line.style.height = ""
        line.style.lineHeight = ""
      }
    }
    const settled = settleLines(el, centreBelow)
    if (settled || attempts <= 0) {
      updateWordSelectionGaps(el)
      ready = true
      return
    }
    // A page just shown measures as nothing until it is laid out: retry on a
    // frame, with a timer where frames have stopped.
    requestAnimationFrame(() => {
      setTimeout(() => settleWithRetry(attempts - 1, fresh), 24)
    })
  }

  function updateWordSelectionGaps(el: HTMLElement): void {
    for (const line of el.querySelectorAll<HTMLElement>(".m-line.m-ayah")) {
      const words = Array.from(line.querySelectorAll<HTMLElement>(".m-word"))
      const lineRect = line.getBoundingClientRect()
      const boxes = words
        .map((word) => word.getBoundingClientRect())
        .sort((a, b) => a.left - b.left)
      const gaps = boxes.slice(1).map((current, index) => {
        const previous = boxes[index]
        return previous ? current.left - previous.right : 0
      })
      const spread = gaps.length > 0 ? Math.max(0, gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length / 2) : 0
      for (const word of words) {
        word.style.setProperty("--m-word-select-spread", `${spread}px`)
        const rect = word.getBoundingClientRect()
        word.style.setProperty("--m-select-to-line-start", `${Math.max(0, lineRect.right - rect.right)}px`)
        word.style.setProperty("--m-select-to-line-end", `${Math.max(0, rect.left - lineRect.left)}px`)
      }
    }
    updateSelectionRunWidths(el)
  }

  function updateSelectionRunWidths(el: HTMLElement): void {
    for (const line of el.querySelectorAll<HTMLElement>(".m-line.m-ayah")) {
      const words = Array.from(line.querySelectorAll<HTMLElement>(".m-word"))
      for (let index = 0; index < words.length; index++) {
        const start = words[index]
        if (!start?.classList.contains("m-selected-start")) continue
        let end = index
        while (end + 1 < words.length && words[end + 1]?.classList.contains("m-selected")) end++
        const finish = words[end]
        if (!finish) continue
        const firstRect = start.getBoundingClientRect()
        const lastRect = finish.getBoundingClientRect()
        start.style.setProperty("--m-selection-run-width", `${Math.max(firstRect.right - lastRect.left, firstRect.width)}px`)
        start.style.setProperty(
          "--m-selection-run-to-line-end",
          finish.classList.contains("m-selected-page-edge-end")
            ? finish.style.getPropertyValue("--m-select-to-line-end")
            : "0px",
        )
      }
    }
  }

  // The settle ratio (line width over measure) survives a resize; re-run to
  // re-derive the shrunk percentages and the short-line threshold.
  $effect(() => {
    const el = box
    if (!el || !chunk || !fontReady) return
    const observer = new ResizeObserver(() => {
      if (!fontReady) return
      ready = false
      requestAnimationFrame(() => settleWithRetry(6))
    })
    observer.observe(el)
    return () => observer.disconnect()
  })

  $effect(() => {
    selection.mode
    selection.keys()
    selection.wordKeys()
    const el = box
    if (!el || !fontReady) return
    requestAnimationFrame(() => updateSelectionRunWidths(el))
  })

  const tapWord = (word: MushafWord) => (event: MouseEvent) => {
    if (longPressFired) {
      longPressFired = false
      return
    }
    // A tap selects the whole ayah — the primary flow, with copy and bookmark.
    // A word-level pick stays available: long-press on touch, Ctrl/Cmd+click
    // with a mouse.
    if (event.ctrlKey || event.metaKey || event.altKey) {
      selection.setMode("word")
      selection.toggleWord(`${page}:${word.s}:${word.a}:${word.g}`)
      return
    }
    selection.setMode("ayah")
    onTap(verseKey(word.s, word.a), event.shiftKey)
  }

  function beginLongPress(word: MushafWord, event: PointerEvent): void {
    if (event.pointerType === "mouse" || word.e) return
    stopLongPress()
    longPressFired = false
    longPressOrigin = { x: event.clientX, y: event.clientY }
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      longPressOrigin = null
      longPressFired = true
      selection.setMode("word")
      selection.toggleWord(`${page}:${word.s}:${word.a}:${word.g}`)
    }, 450)
  }

  function moveLongPress(event: PointerEvent): void {
    const origin = longPressOrigin
    if (!origin) return
    if (Math.abs(event.clientX - origin.x) > 12 || Math.abs(event.clientY - origin.y) > 12) {
      stopLongPress()
    }
  }

  function endLongPress(): void {
    stopLongPress()
    if (longPressFired) setTimeout(() => (longPressFired = false), 0)
  }

  function stopLongPress(): void {
    if (longPressTimer) clearTimeout(longPressTimer)
    longPressTimer = null
    longPressOrigin = null
  }

  const isEnd = (word: MushafWord): boolean => word.e === true
  const isSelected = (word: MushafWord): boolean =>
    selection.mode === "word"
      ? selection.hasWord(`${page}:${word.s}:${word.a}:${word.g}`)
      : selection.has(verseKey(word.s, word.a))
  const isSelectedStart = (words: MushafWord[], index: number): boolean => {
    const word = words[index]
    if (!word || !isSelected(word)) return false
    const previous = words[index - 1]
    return index === 0 || !previous || !isSelected(previous)
  }
  const isSelectedEnd = (words: MushafWord[], index: number): boolean => {
    const word = words[index]
    if (!word || !isSelected(word)) return false
    const next = words[index + 1]
    return index === words.length - 1 || !next || !isSelected(next)
  }
  const continuesFromPreviousLine = (lineIndex: number, words: MushafWord[]): boolean => {
    const first = words[0]
    const previousLine = chunk?.lines[lineIndex - 1]
    if (selection.mode !== "ayah" || !first || previousLine?.kind !== "words") return false
    const previous = previousLine.words.at(-1)
    return !!previous && verseKey(first.s, first.a) === verseKey(previous.s, previous.a) && isSelected(first)
  }
  const continuesToNextLine = (lineIndex: number, words: MushafWord[]): boolean => {
    const last = words.at(-1)
    const nextLine = chunk?.lines[lineIndex + 1]
    if (selection.mode !== "ayah" || !last || nextLine?.kind !== "words") return false
    const next = nextLine.words[0]
    return !!next && verseKey(last.s, last.a) === verseKey(next.s, next.a) && isSelected(last)
  }
  const isPageFirstWord = (word: MushafWord): boolean => {
    const firstLine = chunk?.lines.find((line) => line.kind === "words")
    return firstLine?.kind === "words" && firstLine.words[0] === word
  }
  const isPageLastWord = (word: MushafWord): boolean => {
    const lastLine = [...(chunk?.lines ?? [])].reverse().find((line) => line.kind === "words")
    return lastLine?.kind === "words" && lastLine.words.at(-1) === word
  }
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
      {#each chunk.lines as line, lineIndex (line.line)}
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
          <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
          <div class="m-line m-ayah">
            {#each line.words as word, index (index)}
              <!-- The sheet is a picture of a page: pointer-driven whole-ayah
                   selection is deliberate, and the text block is hidden. -->
              <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
              <span
                class="m-word"
                class:m-end={isEnd(word)}
                class:m-selected={isSelected(word)}
                class:m-selected-start={isSelectedStart(line.words, index)}
                class:m-selected-end={isSelectedEnd(line.words, index)}
                class:m-selected-run-start={isSelectedStart(line.words, index)}
                class:m-selected-continuation-start={index === 0 && continuesFromPreviousLine(lineIndex, line.words)}
                class:m-selected-continuation-end={index === line.words.length - 1 && continuesToNextLine(lineIndex, line.words)}
                class:m-selected-page-edge-start={selection.mode === "ayah" && isSelected(word) && isPageFirstWord(word)}
                class:m-selected-page-edge-end={selection.mode === "ayah" && isSelected(word) && isPageLastWord(word)}
                data-s={word.s}
                data-a={word.a}
                data-g={word.g}
                onpointerdown={(event) => beginLongPress(word, event)}
                onpointermove={moveLongPress}
                onpointerup={endLongPress}
                onpointercancel={endLongPress}
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

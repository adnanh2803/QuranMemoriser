<script lang="ts">
import { surahNameGlyph } from "../model/surah-names"

interface Props {
  surah: number
  /**
   * A compact plaque for a name that shares a line with the basmalah.
   * The band keeps the printed line's full width.
   */
  compact?: boolean
}

let { surah, compact = false }: Props = $props()
</script>

<!--
  The surah name in an ornamental cartouche, drawn in the page's ink. The
  design follows the decal's double frame, corner curls and small top/bottom
  finials, adapted to a single printed line. The compact variant keeps the
  decal's proportions for the opening lines where the basmalah shares the row.
-->
<span class="surah-title" class:surah-title--compact={compact}>
  {#if compact}
    <svg
      class="surah-title__frame"
      viewBox="0 0 360 108"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M32 8H328M32 100H328" stroke-width="1.2" />
        <path d="M32 8C16 14 8 30 8 54C8 78 16 94 32 100" stroke-width="1.1" />
        <path d="M328 8C344 14 352 30 352 54C352 78 344 94 328 100" stroke-width="1.1" />
        <path
          d="M48 16H112M248 16H312M48 92H112M248 92H312"
          stroke-width="0.55"
          stroke-opacity="0.55"
        />
        <path
          d="M48 16C36 21 30 35 30 54C30 73 36 87 48 92"
          stroke-width="0.55"
          stroke-opacity="0.55"
        />
        <path
          d="M312 16C324 21 330 35 330 54C330 73 324 87 312 92"
          stroke-width="0.55"
          stroke-opacity="0.55"
        />
        <g transform="translate(32 8)" stroke-width="0.8">
          <path d="M0 0C13 0 20 5 20 14C20 19 17 22 13 22C10 22 8 20 8 17C8 14 10 12 13 12" />
          <path d="M20 14C24 16 27 19 27 24" stroke-width="0.65" stroke-opacity="0.7" />
          <circle cx="13" cy="12" r="1.1" fill="currentColor" stroke="none" />
        </g>
        <g transform="translate(328 8) scale(-1 1)" stroke-width="0.8">
          <path d="M0 0C13 0 20 5 20 14C20 19 17 22 13 22C10 22 8 20 8 17C8 14 10 12 13 12" />
          <path d="M20 14C24 16 27 19 27 24" stroke-width="0.65" stroke-opacity="0.7" />
          <circle cx="13" cy="12" r="1.1" fill="currentColor" stroke="none" />
        </g>
        <g transform="translate(32 100) scale(1 -1)" stroke-width="0.8">
          <path d="M0 0C13 0 20 5 20 14C20 19 17 22 13 22C10 22 8 20 8 17C8 14 10 12 13 12" />
          <path d="M20 14C24 16 27 19 27 24" stroke-width="0.65" stroke-opacity="0.7" />
          <circle cx="13" cy="12" r="1.1" fill="currentColor" stroke="none" />
        </g>
        <g transform="translate(328 100) scale(-1 -1)" stroke-width="0.8">
          <path d="M0 0C13 0 20 5 20 14C20 19 17 22 13 22C10 22 8 20 8 17C8 14 10 12 13 12" />
          <path d="M20 14C24 16 27 19 27 24" stroke-width="0.65" stroke-opacity="0.7" />
          <circle cx="13" cy="12" r="1.1" fill="currentColor" stroke="none" />
        </g>
      </g>
      <g fill="currentColor" stroke="none">
        <path d="M180 1L186 9L180 17L174 9Z" />
        <path d="M180 107L186 99L180 91L174 99Z" />
      </g>
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="0.7" stroke-opacity="0.8">
        <path d="M180 17C172 17 167 22 160 25M180 17C188 17 193 22 200 25" />
        <path d="M180 91C172 91 167 86 160 83M180 91C188 91 193 86 200 83" />
      </g>
    </svg>
  {:else}
    <svg
      class="surah-title__frame"
      viewBox="0 0 1200 108"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M58 10H1142M58 98H1142" stroke-width="1.2" />
        <path d="M58 10C38 16 30 32 30 54C30 76 38 92 58 98" stroke-width="1.1" />
        <path d="M1142 10C1162 16 1170 32 1170 54C1170 76 1162 92 1142 98" stroke-width="1.1" />
        <path
          d="M76 18H220M980 18H1124M76 90H220M980 90H1124"
          stroke-width="0.55"
          stroke-opacity="0.55"
        />
        <path
          d="M76 18C60 24 52 38 52 54C52 70 60 84 76 90"
          stroke-width="0.55"
          stroke-opacity="0.55"
        />
        <path
          d="M1124 18C1140 24 1148 38 1148 54C1148 70 1140 84 1124 90"
          stroke-width="0.55"
          stroke-opacity="0.55"
        />
        <g transform="translate(58 10)" stroke-width="0.8">
          <path d="M0 0C15 0 23 6 23 16C23 22 19 26 14 26C10 26 7 23 7 19C7 16 9 14 12 14" />
          <path d="M23 16C28 18 31 22 31 27" stroke-width="0.65" stroke-opacity="0.7" />
          <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
        </g>
        <g transform="translate(1142 10) scale(-1 1)" stroke-width="0.8">
          <path d="M0 0C15 0 23 6 23 16C23 22 19 26 14 26C10 26 7 23 7 19C7 16 9 14 12 14" />
          <path d="M23 16C28 18 31 22 31 27" stroke-width="0.65" stroke-opacity="0.7" />
          <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
        </g>
        <g transform="translate(58 98) scale(1 -1)" stroke-width="0.8">
          <path d="M0 0C15 0 23 6 23 16C23 22 19 26 14 26C10 26 7 23 7 19C7 16 9 14 12 14" />
          <path d="M23 16C28 18 31 22 31 27" stroke-width="0.65" stroke-opacity="0.7" />
          <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
        </g>
        <g transform="translate(1142 98) scale(-1 -1)" stroke-width="0.8">
          <path d="M0 0C15 0 23 6 23 16C23 22 19 26 14 26C10 26 7 23 7 19C7 16 9 14 12 14" />
          <path d="M23 16C28 18 31 22 31 27" stroke-width="0.65" stroke-opacity="0.7" />
          <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
        </g>
      </g>
      <g fill="currentColor" stroke="none">
        <path d="M600 1L608 11L600 21L592 11Z" />
        <path d="M600 107L608 97L600 87L592 97Z" />
      </g>
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="0.7" stroke-opacity="0.8">
        <path d="M600 21C590 21 584 27 576 31M600 21C610 21 616 27 624 31" />
        <path d="M600 87C590 87 584 81 576 77M600 87C610 87 616 81 624 77" />
      </g>
    </svg>
  {/if}
  <span class="ph-surah">{surahNameGlyph(surah)}</span>
</span>

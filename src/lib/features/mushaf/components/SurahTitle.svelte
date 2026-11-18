<script lang="ts">
import { surahNameGlyph } from "../model/surah-names"

interface Props {
  surah: number
  /** Where the surah was revealed: Makkah or Madinah. */
  revelation?: "makkah" | "madinah"
  /**
   * A smaller name for a line that shares its height with the basmalah.
   */
  compact?: boolean
}

let { surah, revelation, compact = false }: Props = $props()
</script>

{#snippet symbol()}
  <span class="surah-title__symbol" aria-hidden="true">
    {#if revelation === "madinah"}
      <!-- A domed mosque with two minarets: the Madinan surahs. -->
      <svg viewBox="0 0 24 24" focusable="false">
        <g fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19V11M20 19V11" />
          <path d="M4 11l1-1 1 1M18 11l1-1 1 1" />
          <path d="M7 19v-5.5c0-2.7 2.2-4.8 5-4.8s5 2.1 5 4.8V19" />
          <path d="M12 5c1.6 1 2.5 2.3 2.5 3.7h-5C9.5 7.3 10.4 6 12 5Z" />
          <path d="M12 2.7v2.3" />
          <path d="M4 19h16" />
          <path d="M10.4 19v-2.7a1.6 1.6 0 0 1 3.2 0V19" />
        </g>
      </svg>
    {:else if revelation === "makkah"}
      <!-- The Kaaba: the Makkan surahs. -->
      <svg viewBox="0 0 24 24" focusable="false">
        <g fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5.5 8 12 4.5 18.5 8v9L12 20.5 5.5 17Z" />
          <path d="M5.5 8 12 11.5 18.5 8M12 11.5v9" />
          <path d="M6.1 9.8 12 13.1l5.9-3.3" />
        </g>
      </svg>
    {/if}
  </span>
{/snippet}

<!-- The surah name, made a little heavier and flanked by a symbol for its
     place of revelation. No cartouche: the printed line is the only frame. -->
<span
  class="surah-title"
  class:surah-title--compact={compact}
  data-revelation={revelation ?? "unknown"}
>
  {@render symbol()}
  <span class="ph-surah">{surahNameGlyph(surah)}</span>
  {@render symbol()}
</span>

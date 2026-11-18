<script lang="ts">
import { faKaaba } from "@fortawesome/free-solid-svg-icons/faKaaba"
import { faMosque } from "@fortawesome/free-solid-svg-icons/faMosque"
import { FontAwesomeIcon } from "@fortawesome/svelte-fontawesome"
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
      <FontAwesomeIcon icon={faMosque} />
    {:else if revelation === "makkah"}
      <FontAwesomeIcon icon={faKaaba} />
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

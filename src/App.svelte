<!--
  Composition root: the repositories and the selection engine are created
  once here and handed to the reader as its environment.
-->
<script lang="ts">
import MushafReader from "./lib/features/mushaf/components/MushafReader.svelte"
import { BookmarkRepository } from "./lib/features/mushaf/data/bookmark-repository"
import { MushafRepository } from "./lib/features/mushaf/data/mushaf-repository"
import { PageFontRegistry, registerStaticFonts } from "./lib/features/mushaf/data/page-fonts"
import { SelectionEngine } from "./lib/features/mushaf/model/selection.svelte"

const repository = new MushafRepository()
const bookmarks = new BookmarkRepository()
const fonts = new PageFontRegistry()
const selection = new SelectionEngine()
const context = repository.commandContext()

// The basmalah band and the surah names are drawn on most pages; their
// typefaces are small and live for the session.
registerStaticFonts()
</script>

<MushafReader {repository} {bookmarks} {fonts} {selection} {context} />

<!--
  The selection banner: what is selected, with copy and clear. It floats over
  the reading area and only exists while ayahs are selected.
-->
<script lang="ts">
import { parseVerseKey, type VerseKey } from "../../../domain/schemas"
import type { BookmarkRepository } from "../data/bookmark-repository"
import type { CommandContext, MushafRepository } from "../data/mushaf-repository"
import type { SelectionEngine } from "../model/selection.svelte"

interface Props {
  selection: SelectionEngine
  repository: MushafRepository
  bookmarks: BookmarkRepository
  context: Promise<CommandContext>
  onBookmarks: (keys: VerseKey[]) => void
}

let { selection, repository, bookmarks, context, onBookmarks }: Props = $props()

let copied = $state<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const count = $derived(selection.size)

function flash(message: string): void {
  copied = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (copied = null), 2200)
}

async function copySelected(): Promise<void> {
  const keys = selection.keys()
  if (keys.length === 0) return
  const commandContext = await context
  const ordered = [...keys].sort(
    (a, b) => (commandContext.indexOf(a) ?? 0) - (commandContext.indexOf(b) ?? 0),
  )
  const [ayahs, surahs] = await Promise.all([repository.ayahs(), repository.surahs()])
  const byKey = new Map<string, string>()
  for (const ayah of ayahs) {
    byKey.set(`${ayah.surah}:${ayah.ayah}`, ayah.text)
  }
  const lines: string[] = []
  let openSurah = 0
  for (const key of ordered) {
    const parsed = parseVerseKey(key)
    if (!parsed) continue
    const [surah, ayah] = parsed
    const summary = surahs.find((s) => s.surah === surah)
    if (summary && summary.surah !== openSurah) {
      openSurah = summary.surah
      lines.push(`— ${summary.name} (Surah ${summary.surah}) —`)
    }
    const text = byKey.get(key)
    if (text) lines.push(`${surah}:${ayah} ${text}`)
  }
  const copiedText = lines.join("\n")
  if (await writeClipboard(copiedText)) {
    flash(`Copied ${ordered.length} ${ordered.length === 1 ? "verse" : "verses"}`)
  } else {
    flash("Copy failed")
  }
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API unavailable (permissions or insecure context): fall back
    // to a transient textarea and the legacy command.
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    let ok = false
    try {
      ok = document.execCommand("copy")
    } catch {
      ok = false
    }
    textarea.remove()
    return ok
  }
}

function clearSelection(): void {
  selection.clear()
}

function bookmarkSelected(): void {
  try {
    onBookmarks(bookmarks.add(selection.keys()))
    flash(`Bookmarked ${selection.size} ${selection.size === 1 ? "verse" : "verses"}`)
  } catch (error) {
    flash(error instanceof Error ? error.message : String(error))
  }
}
</script>

{#if count > 0}
  <div
    class="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-hairline bg-surface-raised/95 py-2 pr-2 pl-4 shadow-lg backdrop-blur"
    role="status"
  >
    <span class="text-sm whitespace-nowrap text-ink">
      {count}
      {count === 1 ? "verse" : "verses"} selected
    </span>
    <button
      class="rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 active:scale-95"
      onclick={copySelected}
    >
      Copy
    </button>
    <button
      class="rounded-full px-3 py-1.5 text-sm text-ink-muted transition hover:bg-accent-soft hover:text-ink active:scale-95"
      onclick={bookmarkSelected}
    >
      Bookmark
    </button>
    <button
      class="rounded-full px-3 py-1.5 text-sm text-ink-muted transition hover:bg-accent-soft hover:text-ink active:scale-95"
      onclick={clearSelection}
    >
      Clear
    </button>
  </div>
{/if}

{#if copied !== null}
  <div
    class="fixed bottom-22 left-1/2 z-20 -translate-x-1/2 rounded-full border border-hairline bg-surface px-4 py-2 text-xs text-ink shadow-md"
  >
    {copied}
  </div>
{/if}

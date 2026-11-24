<!-- Manage offline surahs for one reciter. -->
<script lang="ts">
import type { SurahSummary } from "../../../domain/schemas"
import type { Reciter } from "../data/audio-repository"
import type { CachedRecitation, OfflineAudioRepository } from "../data/offline-audio-repository"
import { hasWordTimings, WORD_PLAYBACK_LABEL } from "../model/word-timings"
import SurahPicker from "./SurahPicker.svelte"

interface Props {
  reciter: Reciter
  surahs: SurahSummary[]
  initialSurah: number | null
  inventory: CachedRecitation[]
  repository: OfflineAudioRepository
  onBack: () => void
  onInventoryChange: (inventory: CachedRecitation[]) => void
  onRunningChange?: (running: boolean) => void
}

type JobStatus = "running" | "done" | "cancelled" | "error"

interface DownloadJob {
  done: number
  total: number
  status: JobStatus
  error: string | null
  currentSurah: number | null
}

let {
  reciter,
  surahs,
  initialSurah,
  inventory,
  repository,
  onBack,
  onInventoryChange,
  onRunningChange,
}: Props = $props()

let selectedSurahs = $state<Set<number>>(new Set())
let job = $state<DownloadJob | null>(null)
let actionError = $state<string | null>(null)
let controller: AbortController | null = null
let seededReciterId: string | null = null
let errorTimer: ReturnType<typeof setTimeout> | null = null

const supportsWords = $derived(hasWordTimings(reciter.id))
const chosenSurahs = $derived(surahs.filter((surah) => selectedSurahs.has(surah.surah)))
const running = $derived(job?.status === "running")
const jobPercent = $derived(job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0)

$effect(() => {
  onRunningChange?.(running)
  return () => onRunningChange?.(false)
})

$effect(() => {
  if (errorTimer) clearTimeout(errorTimer)
  if (actionError === null) return
  errorTimer = setTimeout(() => {
    actionError = null
  }, 4500)
  return () => {
    if (errorTimer) clearTimeout(errorTimer)
  }
})

const savedBySurah = $derived.by(() => {
  const map = new Map<number, CachedRecitation>()
  for (const item of inventory) {
    if (item.reciterId === reciter.id) map.set(item.surah, item)
  }
  return map
})

const savedItems = $derived(
  surahs
    .map((surah) => {
      const item = savedBySurah.get(surah.surah)
      return item ? { surah, item } : null
    })
    .filter((entry): entry is { surah: SurahSummary; item: CachedRecitation } => entry !== null),
)

$effect(() => {
  if (seededReciterId === reciter.id) return
  seededReciterId = reciter.id
  selectedSurahs = initialSurah !== null ? new Set([initialSurah]) : new Set()
  job = null
  actionError = null
})

function setSurahs(next: Set<number>): void {
  if (running) return
  if (job?.status !== "running") job = null
  selectedSurahs = next
}

async function refreshInventory(): Promise<void> {
  try {
    onInventoryChange(await repository.inventory())
    actionError = null
  } catch (error) {
    actionError = error instanceof Error ? error.message : String(error)
  }
}

async function startDownload(): Promise<void> {
  if (running || chosenSurahs.length === 0) return
  if (!repository.supported) {
    actionError = "This browser cannot keep recitations on the device."
    return
  }
  const surahsToSave = chosenSurahs
  const total = surahsToSave.reduce((sum, surah) => sum + surah.verseCount, 0)
  const abort = new AbortController()
  controller = abort
  actionError = null
  job = {
    done: 0,
    total,
    status: "running",
    error: null,
    currentSurah: surahsToSave[0]?.surah ?? null,
  }

  let completed = 0
  try {
    for (const surah of surahsToSave) {
      if (abort.signal.aborted) break
      job = { done: completed, total, status: "running", error: null, currentSurah: surah.surah }
      await repository.downloadReciter(
        reciter,
        surah.surah,
        surah.verseCount,
        (done) => {
          job = {
            done: completed + done,
            total,
            status: "running",
            error: null,
            currentSurah: surah.surah,
          }
        },
        abort.signal,
      )
      completed += surah.verseCount
      job = { done: completed, total, status: "running", error: null, currentSurah: surah.surah }
    }
    if (abort.signal.aborted) {
      job = { done: completed, total, status: "cancelled", error: null, currentSurah: null }
    } else {
      job = { done: total, total, status: "done", error: null, currentSurah: null }
    }
  } catch (error) {
    if (abort.signal.aborted) {
      job = { done: completed, total, status: "cancelled", error: null, currentSurah: null }
    } else {
      const message = error instanceof Error ? error.message : String(error)
      job = { done: completed, total, status: "error", error: message, currentSurah: null }
      actionError = message
    }
  } finally {
    controller = null
    await refreshInventory()
  }
}

function cancelDownload(): void {
  controller?.abort()
}

async function removeSaved(surah: number): Promise<void> {
  if (running) return
  try {
    await repository.removeSurahReciter(surah, reciter.id)
    await refreshInventory()
  } catch (error) {
    actionError = error instanceof Error ? error.message : String(error)
  }
}

function surahName(surah: number): string {
  return surahs.find((item) => item.surah === surah)?.name ?? `Surah ${surah}`
}
</script>

<div class="space-y-6">
  <div class="flex flex-wrap items-start gap-3">
    <button
      type="button"
      class="rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
      onclick={onBack}
      disabled={running}
      aria-label="Back to reciters"
      title={running ? "Wait for download to finish or cancel it" : "Back to reciters"}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6"></path>
      </svg>
    </button>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 class="text-xl font-semibold tracking-tight">{reciter.label}</h3>
        <span class="rounded-full bg-bg px-2 py-0.5 text-[11px] tabular-nums text-ink-muted">{reciter.bitrateKbps} kbps</span>
        <span
          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium {supportsWords ? 'bg-accent-soft text-accent' : 'bg-bg text-ink-muted'}"
          title={supportsWords ? WORD_PLAYBACK_LABEL : "Whole ayahs only"}
        >
          {#if supportsWords}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h16"></path></svg>
            <span>Words</span>
          {:else}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"></path></svg>
            <span>Ayahs</span>
          {/if}
        </span>
      </div>
    </div>
  </div>

  {#if job}
    <section class="rounded-2xl border border-hairline bg-bg/40 p-4 sm:p-5" aria-live="polite">
      <div class="flex items-center justify-between gap-2 text-sm">
        <span class="font-medium">
          {#if job.status === "running"}Downloading…{:else if job.status === "done"}Download complete{:else if job.status === "cancelled"}Download cancelled{:else}Download issue{/if}
        </span>
        <span class="tabular-nums text-ink-muted">{job.done} / {job.total}</span>
      </div>
      <div class="mt-3 h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin="0" aria-valuemax={job.total} aria-valuenow={job.done} aria-label="Download progress">
        <div class="h-full rounded-full bg-accent transition-[width] duration-300" style:width={`${jobPercent}%`}></div>
      </div>
      <p class="mt-3 text-sm text-ink-muted">
        {#if job.status === "running"}
          {#if job.currentSurah !== null}{surahName(job.currentSurah)} · {/if}Saving ayah files. You can close this window; the download continues.
        {:else if job.status === "done"}
          Selected surahs are saved for offline playback.
        {:else if job.status === "cancelled"}
          Download cancelled. Saved ayahs are kept.
        {:else}
          {job.error ?? "Some ayahs could not be saved."}
        {/if}
      </p>
    </section>
  {/if}

  {#if actionError}
    <div class="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300" role="alert">
      <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" aria-hidden="true">!</span>
      <p class="min-w-0 flex-1">{actionError}</p>
      <button
        type="button"
        class="shrink-0 rounded-md p-1 text-red-700/70 transition hover:bg-red-100 hover:text-red-800 dark:text-red-300/70 dark:hover:bg-red-900/40 dark:hover:text-red-200"
        onclick={() => (actionError = null)}
        aria-label="Dismiss error"
        title="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>
      </button>
    </div>
  {/if}

  <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
    <div class="space-y-4">
      <SurahPicker
        {surahs}
        selected={selectedSurahs}
        savedSurahs={new Set(savedItems.map((entry) => entry.surah.surah))}
        currentSurah={initialSurah}
        disabled={running}
        onChange={setSurahs}
      />

      <div class="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface/95 px-4 py-4 shadow-[0_-8px_24px_-18px_rgba(0,0,0,0.35)] backdrop-blur sm:px-5">
        <p class="inline-flex items-center gap-2 text-sm text-ink-muted">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0"><path d="M12 4v11"></path><path d="m7.5 10.5 4.5 4.5 4.5-4.5"></path><path d="M5 19h14"></path></svg>
          {#if chosenSurahs.length === 0}
            <span>Select surahs</span>
          {:else}
            <span class="tabular-nums">{chosenSurahs.length} surah{chosenSurahs.length === 1 ? "" : "s"}</span>
          {/if}
        </p>
        <div class="flex items-center gap-2">
          {#if running}
            <button
              type="button"
              class="rounded-lg border border-hairline px-4 py-2 text-sm font-medium transition hover:bg-accent-soft"
              onclick={cancelDownload}
            >Cancel download</button>
          {:else}
            <button
              type="button"
              class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-default disabled:opacity-40"
              onclick={startDownload}
              disabled={chosenSurahs.length === 0}
            >Download selected</button>
          {/if}
        </div>
      </div>
    </div>

    <aside class="space-y-4 xl:sticky xl:top-4 xl:self-start" aria-labelledby="reciter-saved-heading">
      <section class="rounded-2xl border border-hairline bg-bg/40 p-4 sm:p-5">
        <h4 id="reciter-saved-heading" class="text-base font-semibold">Saved for this reciter</h4>
        <p class="mt-0.5 text-sm text-ink-muted">
          {savedItems.length} surah{savedItems.length === 1 ? "" : "s"} saved
        </p>
        {#if savedItems.length === 0}
          <p class="mt-3 text-sm leading-relaxed text-ink-muted">No surahs saved for this reciter yet.</p>
        {:else}
          <div class="mt-4 max-h-[min(32rem,calc(100dvh-20rem))] space-y-2 overflow-y-auto overscroll-contain pr-1">
            {#each savedItems as entry (entry.surah.surah)}
              {@const complete = entry.item.ayahs >= entry.surah.verseCount}
              <div class="flex items-start justify-between gap-3 rounded-xl border border-hairline bg-surface px-3 py-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{entry.surah.surah}. {entry.surah.name}</p>
                  <p class="mt-1 text-xs text-ink-muted">
                    {entry.item.ayahs} of {entry.surah.verseCount} ayahs
                    <span class="ml-1.5 rounded-full px-2 py-0.5 text-[11px] {complete ? 'bg-accent-soft text-accent' : 'bg-bg text-ink-muted'}">
                      {complete ? "Complete" : "Partial"}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  class="shrink-0 rounded-lg p-1.5 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
                  onclick={() => removeSaved(entry.surah.surah)}
                  disabled={running}
                  aria-label={`Remove ${entry.surah.name} for ${reciter.label}`}
                  title="Remove from device"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path>
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </aside>
  </div>
</div>

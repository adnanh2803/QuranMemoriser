<!-- A focused window for keeping recitations on the device, one surah at a time. -->
<script lang="ts">
import type { SurahSummary } from "../../../domain/schemas"
import { RECITERS, type Reciter } from "../data/audio-repository"
import type { CachedRecitation, OfflineAudioRepository } from "../data/offline-audio-repository"
import { hasWordTimings, WORD_PLAYBACK_LABEL } from "../model/word-timings"

interface Props {
  open: boolean
  surahs: SurahSummary[]
  initialSurah: number | null
  currentReciterId: string
  repository: OfflineAudioRepository
  onClose: () => void
}

type ReciterJobStatus = "queued" | "downloading" | "done" | "error"

interface ReciterJob {
  reciterId: string
  done: number
  total: number
  status: ReciterJobStatus
  error: string | null
}

interface DownloadJob {
  surah: number
  status: "running" | "done" | "cancelled" | "error"
  error: string | null
  reciters: ReciterJob[]
}

let { open, surahs, initialSurah, currentReciterId, repository, onClose }: Props = $props()

let dialog = $state<HTMLDialogElement | null>(null)
let selectedSurah = $state(1)
let selected = $state<Set<string>>(new Set())
let inventory = $state<CachedRecitation[]>([])
let inventoryError = $state<string | null>(null)
let job = $state<DownloadJob | null>(null)
let controller: AbortController | null = null
let wasOpen = false

const summary = $derived(surahs.find((surah) => surah.surah === selectedSurah) ?? null)
const chosenReciters = $derived(RECITERS.filter((reciter) => selected.has(reciter.id)))
const running = $derived(job?.status === "running")
const savedForSurah = $derived(inventory.filter((item) => item.surah === selectedSurah))
const jobDone = $derived(job?.reciters.reduce((done, item) => done + item.done, 0) ?? 0)
const jobTotal = $derived(job?.reciters.reduce((total, item) => total + item.total, 0) ?? 0)
const jobPercent = $derived(jobTotal === 0 ? 0 : Math.round((jobDone / jobTotal) * 100))
const wordReciterCount = $derived(RECITERS.filter((reciter) => hasWordTimings(reciter.id)).length)
const jobMessage = $derived.by(() => {
  const current = job
  if (current === null) return ""
  if (current.status === "running") {
    return "Downloading ayah files. You can close this window; the download continues."
  }
  if (current.status === "done") return "All selected reciters are saved for offline playback."
  if (current.status === "cancelled") return "Download cancelled. Saved ayahs are kept."
  return current.error ?? "Some recitations could not be saved."
})

$effect(() => {
  const element = dialog
  if (element === null) return
  if (open) {
    if (!element.open) element.showModal()
    if (!wasOpen) {
      wasOpen = true
      if (job?.status === "running") {
        selectedSurah = job.surah
      } else {
        if (initialSurah !== null) selectedSurah = initialSurah
        selected = new Set([currentReciterId])
        job = null
      }
      void refreshInventory()
    }
  } else if (element.open) {
    element.close()
  }
  if (!open) wasOpen = false
})

async function refreshInventory(): Promise<void> {
  if (!repository.supported) {
    inventoryError = "This browser cannot keep recitations on the device."
    return
  }
  try {
    inventory = await repository.inventory()
    inventoryError = null
  } catch (error) {
    inventoryError = error instanceof Error ? error.message : String(error)
  }
}

function toggleReciter(reciter: Reciter, checked: boolean): void {
  const next = new Set(selected)
  if (checked) next.add(reciter.id)
  else next.delete(reciter.id)
  selected = next
}

function selectAll(): void {
  if (running) return
  selected = new Set(RECITERS.map((reciter) => reciter.id))
}

function clearSelection(): void {
  if (running) return
  selected = new Set()
}

function patchReciter(reciterId: string, patch: Partial<ReciterJob>): void {
  const current = job
  if (current === null) return
  job = {
    ...current,
    reciters: current.reciters.map((item) =>
      item.reciterId === reciterId ? { ...item, ...patch } : item,
    ),
  }
}

async function startDownload(): Promise<void> {
  const surah = summary
  if (surah === null || chosenReciters.length === 0 || running) return
  if (!repository.supported) {
    inventoryError = "This browser cannot keep recitations on the device."
    return
  }

  const abort = new AbortController()
  controller = abort
  job = {
    surah: surah.surah,
    status: "running",
    error: null,
    reciters: chosenReciters.map((reciter) => ({
      reciterId: reciter.id,
      done: 0,
      total: surah.verseCount,
      status: "queued",
      error: null,
    })),
  }

  let next = 0
  let failed = false
  const worker = async (): Promise<void> => {
    while (true) {
      if (abort.signal.aborted) return
      const index = next++
      const reciter = chosenReciters[index]
      if (reciter === undefined) return
      patchReciter(reciter.id, { status: "downloading" })
      try {
        await repository.downloadReciter(
          reciter,
          surah.surah,
          surah.verseCount,
          (done, total) => patchReciter(reciter.id, { done, total }),
          abort.signal,
        )
        patchReciter(reciter.id, {
          status: "done",
          done: surah.verseCount,
          error: null,
        })
      } catch (error) {
        if (abort.signal.aborted) {
          patchReciter(reciter.id, { status: "error", error: "Cancelled" })
          return
        }
        failed = true
        patchReciter(reciter.id, {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(2, chosenReciters.length) }, async () => worker()),
    )
    const current = job
    if (current !== null) {
      job = abort.signal.aborted
        ? { ...current, status: "cancelled", error: null }
        : {
            ...current,
            status: failed ? "error" : "done",
            error: failed
              ? "Some reciters could not be saved. Try again to fetch only the missing ayahs."
              : null,
          }
    }
  } finally {
    controller = null
    await refreshInventory()
  }
}

function cancelDownload(): void {
  controller?.abort()
}

async function removeSaved(item: CachedRecitation): Promise<void> {
  if (running) return
  try {
    await repository.removeSurahReciter(item.surah, item.reciterId)
    await refreshInventory()
  } catch (error) {
    inventoryError = error instanceof Error ? error.message : String(error)
  }
}

function reciterLabel(id: string): string {
  return RECITERS.find((reciter) => reciter.id === id)?.label ?? id
}

function jobFor(reciterId: string): ReciterJob | null {
  if (job === null || job.surah !== selectedSurah) return null
  return job.reciters.find((item) => item.reciterId === reciterId) ?? null
}

function onDialogClick(event: MouseEvent): void {
  if (event.target === dialog) onClose()
}

function onDialogClose(): void {
  if (open) onClose()
}
</script>

<dialog
  bind:this={dialog}
  class="offline-audio m-auto max-h-[calc(100dvh-1.5rem)] w-[min(56rem,calc(100vw-1.25rem))] overflow-hidden rounded-3xl border border-hairline bg-surface p-0 text-ink shadow-2xl"
  aria-labelledby="offline-audio-heading"
  aria-describedby="offline-audio-description"
  aria-busy={running}
  onclick={onDialogClick}
  onclose={onDialogClose}
>
  <div class="flex max-h-[calc(100dvh-1.5rem)] flex-col">
    <header class="flex shrink-0 items-start gap-3 border-b border-hairline px-4 py-4 sm:px-6">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent" aria-hidden="true">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 4v11"></path>
          <path d="m7.5 10.5 4.5 4.5 4.5-4.5"></path>
          <path d="M5 19h14"></path>
        </svg>
      </span>
      <div class="min-w-0 flex-1">
        <h2 id="offline-audio-heading" class="text-lg font-semibold tracking-tight">Offline recitations</h2>
        <p id="offline-audio-description" class="mt-1 text-sm leading-relaxed text-ink-muted">
          Choose a surah, then tick the reciters to keep on this device.
          Reciters with <strong class="font-medium text-ink">{WORD_PLAYBACK_LABEL}</strong> can also play just the words you select; the others play whole ayahs.
        </p>
      </div>
      <button
        class="shrink-0 rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink"
        onclick={onClose}
        aria-label="Close offline recitations"
        title="Close"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12"></path>
        </svg>
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
      {#if job}
        <section class="mb-4 rounded-2xl border border-hairline bg-bg p-3">
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="font-medium">{job.surah}. {surahs.find((item) => item.surah === job?.surah)?.name ?? `Surah ${job.surah}`}</span>
            <span class="tabular-nums text-ink-muted">{jobDone} / {jobTotal}</span>
          </div>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin="0" aria-valuemax={jobTotal} aria-valuenow={jobDone} aria-label="Offline download progress">
            <div class="h-full rounded-full bg-accent transition-[width] duration-300" style:width={`${jobPercent}%`}></div>
          </div>
          <p class="mt-2 text-[11px] text-ink-muted">{jobMessage}</p>
          <p class="sr-only" role="status">{jobMessage}</p>
        </section>
      {/if}

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="offline-reciter-heading">
          <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div class="min-w-0 flex-1">
              <label class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted" for="offline-audio-surah">
                Surah
              </label>
              <select
                id="offline-audio-surah"
                class="block w-full rounded-xl border border-hairline bg-bg px-3 py-2 text-sm shadow-sm outline-none focus:border-accent disabled:opacity-60"
                bind:value={selectedSurah}
                disabled={running}
                aria-label="Choose surah to download"
              >
                {#each surahs as surah (surah.surah)}
                  <option value={surah.surah}>{surah.surah}. {surah.name}</option>
                {/each}
              </select>
            </div>
            <div class="flex items-center gap-1.5 text-xs">
              <button
                class="rounded-lg px-2 py-1.5 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
                onclick={selectAll}
                disabled={running}
              >Select all</button>
              <button
                class="rounded-lg px-2 py-1.5 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
                onclick={clearSelection}
                disabled={running}
              >Clear</button>
            </div>
          </div>

          <div class="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <h3 id="offline-reciter-heading" class="text-sm font-semibold">Reciters</h3>
            {#if summary}
              <span class="text-[11px] text-ink-muted">
                {summary.verseCount} ayahs · {wordReciterCount} of {RECITERS.length} support {WORD_PLAYBACK_LABEL.toLowerCase()}
              </span>
            {/if}
          </div>

          <div class="grid gap-2 sm:grid-cols-2" role="group" aria-labelledby="offline-reciter-heading">
            {#each RECITERS as reciter (reciter.id)}
              {@const saved = savedForSurah.find((item) => item.reciterId === reciter.id)}
              {@const reciterJob = jobFor(reciter.id)}
              {@const supportsWords = hasWordTimings(reciter.id)}
              <label
                class="flex cursor-pointer items-start gap-3 rounded-2xl border border-hairline bg-bg px-3 py-3 transition has-checked:border-accent/40 has-checked:bg-accent-soft/60"
                class:opacity-60={running}
                data-word-playback={supportsWords ? "yes" : "no"}
              >
                <input
                  class="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                  type="checkbox"
                  checked={selected.has(reciter.id)}
                  disabled={running}
                  onchange={(event) => toggleReciter(reciter, event.currentTarget.checked)}
                />
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span class="text-sm font-medium">{reciter.label}</span>
                    <span class="rounded-full bg-surface px-1.5 py-0.5 text-[10px] tabular-nums text-ink-muted">{reciter.bitrateKbps} kbps</span>
                  </span>
                  <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {#if supportsWords}
                      <span class="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">{WORD_PLAYBACK_LABEL}</span>
                      <span class="text-[11px] text-ink-muted">Selected phrases play on their own</span>
                    {:else}
                      <span class="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">Whole ayahs only</span>
                      <span class="text-[11px] text-ink-muted">No word-level playback</span>
                    {/if}
                  </span>
                  {#if saved}
                    <span class="mt-1 block text-[11px] text-ink-muted">
                      Saved {saved.ayahs} of {summary?.verseCount ?? "?"} ayahs
                    </span>
                  {/if}
                  {#if reciterJob}
                    <span class="mt-1 flex items-center gap-2 text-[11px] text-ink-muted">
                      {#if reciterJob.status === "queued"}
                        Waiting…
                      {:else if reciterJob.status === "downloading"}
                        Saving {reciterJob.done} / {reciterJob.total}
                      {:else if reciterJob.status === "done"}
                        Saved
                      {:else}
                        {reciterJob.error ?? "Failed"}
                      {/if}
                    </span>
                  {/if}
                </span>
              </label>
            {/each}
          </div>
        </section>

        <aside class="space-y-3" aria-labelledby="offline-saved-heading">
          <section class="rounded-2xl border border-hairline bg-bg p-3">
            <div class="flex items-center justify-between gap-2">
              <h3 id="offline-saved-heading" class="text-sm font-semibold">Saved for this surah</h3>
              <button
                class="rounded-md p-1 text-ink-muted transition hover:bg-accent-soft hover:text-ink"
                onclick={refreshInventory}
                aria-label="Refresh saved recitations"
                title="Refresh"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20 11a8 8 0 1 0-2.3 5.7"></path>
                  <path d="M20 4v7h-7"></path>
                </svg>
              </button>
            </div>
            {#if inventoryError}
              <p class="mt-2 text-xs text-red-700 dark:text-red-300" role="alert">{inventoryError}</p>
            {:else if savedForSurah.length === 0}
              <p class="mt-2 text-xs leading-relaxed text-ink-muted">No recitations are saved for this surah yet.</p>
            {:else}
              <ul class="mt-2 space-y-2">
                {#each savedForSurah as item (item.reciterId)}
                  {@const complete = summary !== null && item.ayahs >= summary.verseCount}
                  <li
                    class="rounded-xl border border-hairline bg-surface px-2.5 py-2"
                    data-saved-recitation={item.reciterId}
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <p class="truncate text-xs font-medium">{reciterLabel(item.reciterId)}</p>
                        <p class="mt-0.5 text-[11px] text-ink-muted">
                          {item.ayahs} of {summary?.verseCount ?? "?"} ayahs
                          <span class="ml-1 rounded-full px-1.5 py-0.5 text-[10px] {complete ? 'bg-accent-soft text-accent' : 'bg-bg text-ink-muted'}">
                            {complete ? "Complete" : "Partial"}
                          </span>
                        </p>
                      </div>
                      <button
                        class="shrink-0 rounded-md p-1 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
                        onclick={() => removeSaved(item)}
                        disabled={running}
                        aria-label={`Remove ${reciterLabel(item.reciterId)} for this surah`}
                        title="Remove from device"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path>
                        </svg>
                      </button>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        </aside>
      </div>
    </div>

    <footer class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3 sm:px-6">
      <p class="min-w-0 flex-1 text-[11px] leading-relaxed text-ink-muted">
        {#if job?.status === "running"}
          Saving {jobDone} of {jobTotal} ayah files…
        {:else if summary}
          {chosenReciters.length} reciter{chosenReciters.length === 1 ? "" : "s"} selected · {summary.verseCount * chosenReciters.length} ayah files
        {:else}
          Loading surahs…
        {/if}
      </p>
      <div class="flex items-center gap-2">
        <button
          class="rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:bg-accent-soft hover:text-ink"
          onclick={onClose}
        >{running ? "Close window" : "Close"}</button>
        {#if running}
          <button
            class="rounded-lg border border-hairline px-3 py-2 text-sm font-medium transition hover:bg-accent-soft"
            onclick={cancelDownload}
          >Cancel download</button>
        {:else}
          <button
            class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-default disabled:opacity-40"
            onclick={startDownload}
            disabled={summary === null || chosenReciters.length === 0}
          >
            Download selected
          </button>
        {/if}
      </div>
    </footer>
  </div>
</dialog>

<style>
  .offline-audio::backdrop {
    background: rgb(0 0 0 / 0.42);
    backdrop-filter: blur(2px);
  }
</style>

<!-- A focused window for keeping recitations on the device, across one or more surahs. -->
<script lang="ts">
import type { SurahSummary } from "../../../domain/schemas"
import { RECITERS, type Reciter } from "../data/audio-repository"
import type { CachedRecitation, OfflineAudioRepository } from "../data/offline-audio-repository"
import { hasWordTimings, WORD_PLAYBACK_LABEL } from "../model/word-timings"
import SurahPicker from "./SurahPicker.svelte"

const reciterOrder = new Map(RECITERS.map((reciter, index) => [reciter.id, index]))

interface Props {
  open: boolean
  surahs: SurahSummary[]
  initialSurah: number | null
  currentReciterId: string
  repository: OfflineAudioRepository
  onClose: () => void
}

type ReciterJobStatus = "queued" | "downloading" | "done" | "cancelled" | "error"

interface ReciterJob {
  reciterId: string
  done: number
  total: number
  status: ReciterJobStatus
  error: string | null
  currentSurah: number | null
}

interface DownloadJob {
  surahCount: number
  status: "running" | "done" | "cancelled" | "error"
  error: string | null
  reciters: ReciterJob[]
}

interface SavedGroup {
  surah: SurahSummary
  items: CachedRecitation[]
}

let { open, surahs, initialSurah, currentReciterId, repository, onClose }: Props = $props()

let dialog = $state<HTMLDialogElement | null>(null)
let selectedSurahs = $state<Set<number>>(new Set())
let selectedReciters = $state<Set<string>>(new Set())
let inventory = $state<CachedRecitation[]>([])
let inventoryError = $state<string | null>(null)
let job = $state<DownloadJob | null>(null)
let controller: AbortController | null = null
let wasOpen = false

const chosenSurahs = $derived(surahs.filter((surah) => selectedSurahs.has(surah.surah)))
const chosenReciters = $derived(RECITERS.filter((reciter) => selectedReciters.has(reciter.id)))
const chosenAyahCount = $derived(chosenSurahs.reduce((total, surah) => total + surah.verseCount, 0))
const totalFiles = $derived(chosenAyahCount * chosenReciters.length)
const running = $derived(job?.status === "running")
const jobDone = $derived(job?.reciters.reduce((done, item) => done + item.done, 0) ?? 0)
const jobTotal = $derived(job?.reciters.reduce((total, item) => total + item.total, 0) ?? 0)
const jobPercent = $derived(jobTotal === 0 ? 0 : Math.round((jobDone / jobTotal) * 100))
const wordReciterCount = $derived(RECITERS.filter((reciter) => hasWordTimings(reciter.id)).length)

const savedAyahsByKey = $derived.by(() => {
  const map = new Map<string, number>()
  for (const item of inventory) map.set(`${item.surah}:${item.reciterId}`, item.ayahs)
  return map
})

const savedSurahIds = $derived(new Set(inventory.map((item) => item.surah)))

/** How many of the chosen surahs each reciter has completely saved. */
const savedCoverage = $derived.by(() => {
  const map = new Map<string, number>()
  for (const reciter of RECITERS) {
    let complete = 0
    for (const surah of chosenSurahs) {
      const saved = savedAyahsByKey.get(`${surah.surah}:${reciter.id}`) ?? 0
      if (saved >= surah.verseCount) complete += 1
    }
    map.set(reciter.id, complete)
  }
  return map
})

const savedGroups = $derived.by(() => {
  const groups = new Map<number, CachedRecitation[]>()
  for (const item of inventory) {
    if (!selectedSurahs.has(item.surah)) continue
    const items = groups.get(item.surah) ?? []
    items.push(item)
    groups.set(item.surah, items)
  }
  const result: SavedGroup[] = []
  for (const [surahNumber, items] of groups) {
    const surah = surahs.find((item) => item.surah === surahNumber)
    if (surah === undefined) continue
    items.sort(
      (a, b) =>
        (reciterOrder.get(a.reciterId) ?? RECITERS.length) -
        (reciterOrder.get(b.reciterId) ?? RECITERS.length),
    )
    result.push({ surah, items })
  }
  return result.sort((a, b) => a.surah.surah - b.surah.surah)
})

const savedRecitationCount = $derived(
  savedGroups.reduce((total, group) => total + group.items.length, 0),
)

const jobMessage = $derived.by(() => {
  const current = job
  if (current === null) return ""
  if (current.status === "running") {
    return "Downloading ayah files. You can close this window; the download continues."
  }
  if (current.status === "done") return "All selected recitations are saved for offline playback."
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
      if (job?.status !== "running") job = null
      if (selectedSurahs.size === 0 && initialSurah !== null) {
        selectedSurahs = new Set([initialSurah])
      }
      if (selectedReciters.size === 0) selectedReciters = new Set([currentReciterId])
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

/** A finished job describes an older selection; drop it when the user adjusts. */
function resetFinishedJob(): void {
  if (!running) job = null
}

function setSurahs(next: Set<number>): void {
  if (running) return
  resetFinishedJob()
  selectedSurahs = next
}

function toggleReciter(reciter: Reciter, checked: boolean): void {
  if (running) return
  resetFinishedJob()
  const next = new Set(selectedReciters)
  if (checked) next.add(reciter.id)
  else next.delete(reciter.id)
  selectedReciters = next
}

function selectAllReciters(): void {
  if (running) return
  resetFinishedJob()
  selectedReciters = new Set(RECITERS.map((reciter) => reciter.id))
}

function clearReciters(): void {
  if (running) return
  resetFinishedJob()
  selectedReciters = new Set()
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
  const surahsToSave = chosenSurahs
  const recitersToSave = chosenReciters
  if (surahsToSave.length === 0 || recitersToSave.length === 0 || running) return
  if (!repository.supported) {
    inventoryError = "This browser cannot keep recitations on the device."
    return
  }

  const perReciterTotal = surahsToSave.reduce((total, surah) => total + surah.verseCount, 0)
  const abort = new AbortController()
  controller = abort
  job = {
    surahCount: surahsToSave.length,
    status: "running",
    error: null,
    reciters: recitersToSave.map((reciter) => ({
      reciterId: reciter.id,
      done: 0,
      total: perReciterTotal,
      status: "queued",
      error: null,
      currentSurah: surahsToSave[0]?.surah ?? null,
    })),
  }

  let next = 0
  let failed = false
  const worker = async (): Promise<void> => {
    while (true) {
      if (abort.signal.aborted) return
      const index = next++
      const reciter = recitersToSave[index]
      if (reciter === undefined) return
      patchReciter(reciter.id, {
        status: "downloading",
        currentSurah: surahsToSave[0]?.surah ?? null,
      })
      let completed = 0
      try {
        for (const surah of surahsToSave) {
          if (abort.signal.aborted) return
          patchReciter(reciter.id, { currentSurah: surah.surah })
          await repository.downloadReciter(
            reciter,
            surah.surah,
            surah.verseCount,
            (done) =>
              patchReciter(reciter.id, { done: completed + done, currentSurah: surah.surah }),
            abort.signal,
          )
          completed += surah.verseCount
          patchReciter(reciter.id, { done: completed })
        }
        patchReciter(reciter.id, {
          status: "done",
          done: perReciterTotal,
          error: null,
          currentSurah: null,
        })
      } catch (error) {
        if (abort.signal.aborted) {
          patchReciter(reciter.id, { status: "cancelled", error: "Cancelled", currentSurah: null })
          return
        }
        failed = true
        patchReciter(reciter.id, {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          currentSurah: null,
        })
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(2, recitersToSave.length) }, async () => worker()),
    )
    const current = job
    if (current !== null) {
      job = abort.signal.aborted
        ? {
            ...current,
            status: "cancelled",
            error: null,
            reciters: current.reciters.map((item) =>
              item.status === "queued" || item.status === "downloading"
                ? { ...item, status: "cancelled", error: "Cancelled", currentSurah: null }
                : item,
            ),
          }
        : {
            ...current,
            status: failed ? "error" : "done",
            error: failed
              ? "Some recitations could not be saved. Try again to fetch only the missing ayahs."
              : null,
          }
    }
  } catch (error) {
    const current = job
    if (current !== null) {
      job = {
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
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
    job = null
    await refreshInventory()
  } catch (error) {
    inventoryError = error instanceof Error ? error.message : String(error)
  }
}

function reciterLabel(id: string): string {
  return RECITERS.find((reciter) => reciter.id === id)?.label ?? id
}

function surahLabel(id: number): string {
  return surahs.find((surah) => surah.surah === id)?.name ?? `Surah ${id}`
}

function jobFor(reciterId: string): ReciterJob | null {
  return job?.reciters.find((item) => item.reciterId === reciterId) ?? null
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
  class="offline-audio m-0 h-dvh max-h-dvh w-dvw max-w-dvw overflow-hidden border-0 bg-surface p-0 text-ink"
  aria-labelledby="offline-audio-heading"
  aria-describedby="offline-audio-description"
  aria-busy={running}
  onclick={onDialogClick}
  onclose={onDialogClose}
>
  {#if open}
    <div class="flex h-full flex-col">
    <header class="shrink-0 border-b border-hairline px-4 py-4 sm:px-6">
      <div class="mx-auto flex w-full max-w-7xl items-start gap-3">
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
            Choose one or more surahs, then tick the reciters to keep on this device.
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
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
      <div class="mx-auto w-full max-w-7xl">
      {#if job}
        <section class="mb-4 rounded-2xl border border-hairline bg-bg p-3">
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="font-medium">
              {job.surahCount} surah{job.surahCount === 1 ? "" : "s"} · {job.reciters.length} reciter{job.reciters.length === 1 ? "" : "s"}
            </span>
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
        <div class="space-y-4">
          <SurahPicker
            {surahs}
            selected={selectedSurahs}
            savedSurahs={savedSurahIds}
            currentSurah={initialSurah}
            disabled={running}
            onChange={setSurahs}
          />

          <section aria-labelledby="offline-reciter-heading">
            <div class="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <div class="min-w-0">
                <h3 id="offline-reciter-heading" class="text-sm font-semibold">Reciters</h3>
                <p class="text-[11px] text-ink-muted">
                  {wordReciterCount} of {RECITERS.length} reciters support {WORD_PLAYBACK_LABEL.toLowerCase()}
                </p>
              </div>
              <div class="flex items-center gap-1 text-xs">
                <button
                  class="rounded-lg px-2 py-1.5 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
                  onclick={selectAllReciters}
                  disabled={running}
                >Select all</button>
                <button
                  class="rounded-lg px-2 py-1.5 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
                  onclick={clearReciters}
                  disabled={running}
                >Clear</button>
              </div>
            </div>

            <div class="grid gap-2 sm:grid-cols-2" role="group" aria-labelledby="offline-reciter-heading">
              {#each RECITERS as reciter (reciter.id)}
                {@const reciterJob = jobFor(reciter.id)}
                {@const coverage = savedCoverage.get(reciter.id) ?? 0}
                {@const supportsWords = hasWordTimings(reciter.id)}
                <label
                  class="flex cursor-pointer items-start gap-3 rounded-2xl border border-hairline bg-bg px-3 py-3 transition has-checked:border-accent/40 has-checked:bg-accent-soft/60"
                  class:opacity-60={running}
                  data-word-playback={supportsWords ? "yes" : "no"}
                >
                  <input
                    class="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                    type="checkbox"
                    checked={selectedReciters.has(reciter.id)}
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
                    {#if !reciterJob && chosenSurahs.length > 0 && coverage > 0}
                      <span class="mt-1 block text-[11px] text-ink-muted">
                        {coverage === chosenSurahs.length
                          ? "All selected surahs saved"
                          : `Saved for ${coverage} of ${chosenSurahs.length} selected surahs`}
                      </span>
                    {/if}
                    {#if reciterJob}
                      <span class="mt-1 flex items-center gap-2 text-[11px] text-ink-muted">
                        {#if reciterJob.status === "queued"}
                          Waiting…
                        {:else if reciterJob.status === "downloading"}
                          {#if reciterJob.currentSurah !== null}{surahLabel(reciterJob.currentSurah)} · {/if}Saving {reciterJob.done} / {reciterJob.total}
                        {:else if reciterJob.status === "done"}
                          Saved
                        {:else if reciterJob.status === "cancelled"}
                          Cancelled
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
        </div>

        <aside class="space-y-3" aria-labelledby="offline-saved-heading">
          <section class="rounded-2xl border border-hairline bg-bg p-3">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <h3 id="offline-saved-heading" class="text-sm font-semibold">Saved audio</h3>
                <p class="text-[11px] text-ink-muted">
                  {#if chosenSurahs.length === 0}
                    Choose surahs to inspect
                  {:else}
                    {savedGroups.length} surah{savedGroups.length === 1 ? "" : "s"} · {savedRecitationCount} saved
                  {/if}
                </p>
              </div>
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
            {:else if chosenSurahs.length === 0}
              <p class="mt-2 text-xs leading-relaxed text-ink-muted">Select surahs to see their saved recitations.</p>
            {:else if savedGroups.length === 0}
              <p class="mt-2 text-xs leading-relaxed text-ink-muted">No recitations are saved for the selected surahs yet.</p>
            {:else}
              <div class="mt-2 max-h-[min(32rem,calc(100dvh-20rem))] space-y-3 overflow-y-auto overscroll-contain pr-1">
                {#each savedGroups as group (group.surah.surah)}
                  <section data-saved-surah={group.surah.surah} aria-labelledby={`offline-saved-surah-${group.surah.surah}`}>
                    <div class="flex items-baseline justify-between gap-2">
                      <h4 id={`offline-saved-surah-${group.surah.surah}`} class="truncate text-xs font-medium">
                        {group.surah.surah}. {group.surah.name}
                      </h4>
                      <span class="shrink-0 text-[10px] tabular-nums text-ink-muted">{group.surah.verseCount} ayahs</span>
                    </div>
                    <ul class="mt-1.5 space-y-1.5">
                      {#each group.items as item (item.reciterId)}
                        {@const complete = item.ayahs >= group.surah.verseCount}
                        <li
                          class="rounded-xl border border-hairline bg-surface px-2.5 py-2"
                          data-saved-recitation={item.reciterId}
                        >
                          <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                              <p class="truncate text-xs font-medium">{reciterLabel(item.reciterId)}</p>
                              <p class="mt-0.5 text-[11px] text-ink-muted">
                                {item.ayahs} of {group.surah.verseCount} ayahs
                                <span class="ml-1 rounded-full px-1.5 py-0.5 text-[10px] {complete ? 'bg-accent-soft text-accent' : 'bg-bg text-ink-muted'}">
                                  {complete ? "Complete" : "Partial"}
                                </span>
                              </p>
                            </div>
                            <button
                              class="shrink-0 rounded-md p-1 text-ink-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-40"
                              onclick={() => removeSaved(item)}
                              disabled={running}
                              aria-label={`Remove ${reciterLabel(item.reciterId)} for ${group.surah.name}`}
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
                  </section>
                {/each}
              </div>
            {/if}
          </section>
        </aside>
      </div>
      </div>
    </div>

    <footer class="shrink-0 border-t border-hairline px-4 py-3 sm:px-6">
      <div class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
        <p class="min-w-0 flex-1 text-[11px] leading-relaxed text-ink-muted">
          {#if job?.status === "running"}
            Saving {jobDone} of {jobTotal} ayah files…
          {:else if chosenSurahs.length === 0}
            Choose at least one surah.
          {:else if chosenReciters.length === 0}
            Choose at least one reciter.
          {:else}
            {chosenReciters.length} reciter{chosenReciters.length === 1 ? "" : "s"} × {chosenSurahs.length} surah{chosenSurahs.length === 1 ? "" : "s"} · {totalFiles} ayah files
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
              disabled={chosenSurahs.length === 0 || chosenReciters.length === 0}
            >
              Download selected
            </button>
          {/if}
        </div>
      </div>
    </footer>
    </div>
  {/if}
</dialog>

<style>
  .offline-audio::backdrop {
    background: rgb(0 0 0 / 0.42);
    backdrop-filter: blur(2px);
  }
</style>

<!-- Full-page download recitations manager: pick a reciter, then manage its surahs. -->
<script lang="ts">
import type { SurahSummary } from "../../../domain/schemas"
import { RECITERS } from "../data/audio-repository"
import type { CachedRecitation, OfflineAudioRepository } from "../data/offline-audio-repository"
import OfflineReciterDetail from "./OfflineReciterDetail.svelte"
import OfflineReciterList from "./OfflineReciterList.svelte"

interface Props {
  open: boolean
  surahs: SurahSummary[]
  initialSurah: number | null
  currentReciterId: string
  repository: OfflineAudioRepository
  onClose: () => void
}

let { open, surahs, initialSurah, currentReciterId, repository, onClose }: Props = $props()

let dialog = $state<HTMLDialogElement | null>(null)
let inventory = $state<CachedRecitation[]>([])
let inventoryError = $state<string | null>(null)
let activeReciterId = $state<string | null>(null)
let detailRunning = $state(false)
let wasOpen = false
let inventoryErrorTimer: ReturnType<typeof setTimeout> | null = null

const activeReciter = $derived(RECITERS.find((reciter) => reciter.id === activeReciterId) ?? null)

$effect(() => {
  const element = dialog
  if (element === null) return
  if (open) {
    if (!element.open) element.showModal()
    if (!wasOpen) {
      wasOpen = true
      if (!detailRunning) activeReciterId = null
      void refreshInventory()
    }
  } else if (element.open) {
    element.close()
  }
  if (!open) wasOpen = false
})

$effect(() => {
  if (inventoryErrorTimer) clearTimeout(inventoryErrorTimer)
  if (inventoryError === null) return
  inventoryErrorTimer = setTimeout(() => {
    inventoryError = null
  }, 4500)
  return () => {
    if (inventoryErrorTimer) clearTimeout(inventoryErrorTimer)
  }
})

async function refreshInventory(): Promise<void> {
  if (!repository.supported) {
    inventoryError = "This browser cannot keep recitations on the device."
    inventory = []
    return
  }
  try {
    inventory = await repository.inventory()
    inventoryError = null
  } catch (error) {
    inventoryError = error instanceof Error ? error.message : String(error)
  }
}

function onDialogClick(event: MouseEvent): void {
  if (event.target === dialog) onClose()
}

function onDialogClose(): void {
  if (open) onClose()
}

function openReciter(reciterId: string): void {
  activeReciterId = reciterId
}

function backToReciters(): void {
  activeReciterId = null
}
</script>

<dialog
  bind:this={dialog}
  class="offline-audio m-0 h-dvh max-h-dvh w-dvw max-w-dvw overflow-hidden border-0 bg-page p-0 text-ink"
  aria-labelledby="offline-audio-heading"
  onclick={onDialogClick}
  onclose={onDialogClose}
>
  {#if open || detailRunning}
    <div class="flex h-full flex-col">
      <header class="shrink-0 border-b border-hairline px-4 py-4 sm:px-6">
        <div class="mx-auto flex w-full max-w-7xl items-center gap-3">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent" aria-hidden="true">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 4v11"></path>
              <path d="m7.5 10.5 4.5 4.5 4.5-4.5"></path>
              <path d="M5 19h14"></path>
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <h2 id="offline-audio-heading" class="text-lg font-semibold tracking-tight">Download recitations</h2>
          </div>
          <button
            class="shrink-0 rounded-lg p-2 text-ink-muted transition hover:bg-accent-soft hover:text-ink"
            onclick={onClose}
            aria-label="Close download recitations"
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
          {#if inventoryError}
            <div class="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300" role="alert">
              <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" aria-hidden="true">!</span>
              <p class="min-w-0 flex-1">{inventoryError}</p>
              <button
                type="button"
                class="shrink-0 rounded-md p-1 text-red-700/70 transition hover:bg-red-100 hover:text-red-800 dark:text-red-300/70 dark:hover:bg-red-900/40 dark:hover:text-red-200"
                onclick={() => (inventoryError = null)}
                aria-label="Dismiss error"
                title="Dismiss"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>
              </button>
            </div>
          {/if}

          {#if activeReciter}
            <OfflineReciterDetail
              reciter={activeReciter}
              {surahs}
              {initialSurah}
              {inventory}
              {repository}
              onBack={backToReciters}
              onInventoryChange={(next) => (inventory = next)}
              onRunningChange={(value) => (detailRunning = value)}
            />
          {:else}
            <div class="space-y-6">
              <OfflineReciterList
                {surahs}
                {inventory}
                onOpen={openReciter}
              />
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</dialog>

<style>
  .offline-audio::backdrop {
    background: rgb(0 0 0 / 0.42);
    backdrop-filter: blur(2px);
  }
</style>

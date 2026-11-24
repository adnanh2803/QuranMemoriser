<script lang="ts">
interface Props {
  open: boolean
  onClose: () => void
  onOpen: () => void
  onOpenOfflineAudio: () => void
}

let { open, onClose, onOpen, onOpenOfflineAudio }: Props = $props()

$effect(() => {
  document.documentElement.style.setProperty("--mushaf-user-scale", "1.7")
})
</script>

<header
  id="reader-menu"
  class={open ? "fixed inset-0 z-40 overflow-y-auto bg-transparent" : "hidden"}
>
  {#if open}
    <div class="relative flex min-h-full flex-col gap-y-4 bg-page px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div class="flex w-full min-w-0 items-center gap-3">
        <img
          src="{import.meta.env.BASE_URL}icons/icon.svg"
          alt=""
          class="h-11 w-11 rounded-[14px] shadow-sm"
        />
        <div class="min-w-0 flex-1">
          <div class="text-[1.05rem] font-semibold tracking-tight text-ink">Qur’an Memoriser</div>
        </div>
        <button
          class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition hover:bg-accent-soft hover:text-accent"
          onclick={onClose}
          aria-label="Close menu"
          title="Close menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <button
        class="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-bg px-3 py-3 text-left shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
        onclick={onOpenOfflineAudio}
        aria-label="Open download recitations"
      >
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 4v11"></path>
            <path d="m7.5 10.5 4.5 4.5 4.5-4.5"></path>
            <path d="M5 19h14"></path>
          </svg>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium">Download recitations</span>
          <span class="block text-xs text-ink-muted">Choose a surah and the reciters to save on this device</span>
        </span>
        <svg class="shrink-0 text-ink-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m9 6 6 6-6 6"></path>
        </svg>
      </button>
    </div>
  {/if}
</header>

{#if !open}
  <button
    class="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-20 flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition hover:bg-accent-soft hover:text-accent"
    onclick={onOpen}
    aria-label="Show controls"
    aria-expanded={open}
    aria-controls="reader-menu"
    title="Show controls"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16"></path>
      <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"></circle>
      <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"></circle>
      <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"></circle>
    </svg>
  </button>
{/if}

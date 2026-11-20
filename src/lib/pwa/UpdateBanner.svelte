<!--
  A non-blocking status notice for service-worker install and update progress.
-->
<script lang="ts">
import { fly } from "svelte/transition"
import { updateNotice } from "./update.svelte"

function reload(): void {
  window.location.reload()
}
</script>

{#if updateNotice.phase !== "idle"}
  <div
    class="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-50 flex justify-center px-3"
    aria-live="polite"
    aria-atomic="true"
  >
    <div
      class="pointer-events-auto flex max-w-[calc(100vw-7rem)] items-center gap-2 rounded-full border border-hairline bg-surface/95 py-1.5 pr-1.5 pl-3 text-xs text-ink shadow-lg ring-1 ring-black/5 backdrop-blur-md sm:max-w-md"
      in:fly={{ y: -10, duration: 180 }}
      out:fly={{ y: -10, duration: 140 }}
    >
      {#if updateNotice.phase === "downloading" || updateNotice.phase === "installing"}
        <span
          class="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-accent/25 border-t-accent"
          aria-hidden="true"
        ></span>
        <span class="min-w-0">
          <span class="block truncate font-medium">
            {updateNotice.phase === "downloading" ? "Downloading a new version…" : "Preparing offline access…"}
          </span>
          <span class="hidden truncate text-[10px] text-ink-muted sm:block">
            {updateNotice.phase === "downloading"
              ? "You can keep reading. Reload when it's ready."
              : "Downloading the mushaf so it works without internet."}
          </span>
        </span>
      {:else if updateNotice.phase === "offline-ready"}
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
          aria-hidden="true"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5"></path>
          </svg>
        </span>
        <span class="min-w-0">
          <span class="block truncate font-medium">Ready to use offline</span>
          <span class="hidden truncate text-[10px] text-ink-muted sm:block">
            The app is saved on this device.
          </span>
        </span>
      {:else if updateNotice.phase === "error"}
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"
          aria-hidden="true"
        >!</span>
        <span class="min-w-0">
          <span class="block truncate font-medium">Update status</span>
          <span class="block truncate text-[10px] text-ink-muted sm:text-[10px]">
            {updateNotice.detail ?? "Something went wrong."}
          </span>
        </span>
      {:else}
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
          aria-hidden="true"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v12"></path>
            <path d="m7 10 5 5 5-5"></path>
            <path d="M5 21h14"></path>
          </svg>
        </span>
        <span class="min-w-0">
          <span class="block truncate font-medium">New version ready</span>
          <span class="hidden truncate text-[10px] text-ink-muted sm:block">
            Reload to use the latest version.
          </span>
        </span>
        <button
          class="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-white transition hover:opacity-90"
          onclick={reload}
          title="Reload to use the new version"
        >Reload</button>
      {/if}
      <button
        class="shrink-0 rounded-full p-1 text-ink-muted transition hover:bg-accent-soft hover:text-ink"
        onclick={() => updateNotice.dismiss()}
        aria-label="Dismiss status notice"
        title="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <path d="M18 6 6 18M6 6l12 12"></path>
        </svg>
      </button>
    </div>
  </div>
{/if}

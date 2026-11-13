<script lang="ts">
let now = $state(new Date())
</script>

<main class="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg text-ink">
  <div class="flex flex-col items-center gap-2">
    <img src="/icons/icon.svg" alt="" width="72" height="72" />
    <h1 class="text-2xl font-semibold tracking-tight">QuranMemoriser</h1>
    <p class="text-sm text-ink-muted">Offline Madani Mushaf reader — scaffold ready</p>
  </div>

  <div class="rounded-xl border border-hairline bg-surface px-6 py-4 text-center text-sm shadow-sm">
    <p class="text-ink-muted">Theme system active — current: <span class="font-medium text-accent">{document.documentElement.dataset.theme}</span></p>
    <p class="mt-1 text-xs text-ink-muted">PWA, tooling and data pipeline are wired up. Reader lands next.</p>
  </div>

  <p class="text-xs text-ink-muted">Loaded {now.toLocaleTimeString()}</p>
</main>

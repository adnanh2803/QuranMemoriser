import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // A handful of workers: every test pulls the ~53 MB precache set from one
  // static preview server, and a crowd of browsers stalls the big data
  // fetches (the search index) rather than failing on their own merits.
  workers: 4,
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  webServer: {
    // Node directly, not `npm run preview`: a shell-spawned tree survives
    // Playwright's teardown on Windows and leaves an orphaned preview
    // server holding the port, which races the next run's server on
    // localhost and stalls requests at random.
    command: "node node_modules/vite/bin/vite.js preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})

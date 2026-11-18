import { expect, type Page, test } from "@playwright/test"

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" })

/**
 * A minute of silence as an 8 kHz 8-bit mono WAV. Long enough that no track
 * ends on its own while a test is asserting, short enough to build in memory.
 */
function silentWav(seconds = 60): Buffer {
  const samples = 8000 * seconds
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + samples, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(8000, 24)
  header.writeUInt32LE(8000, 28)
  header.writeUInt16LE(1, 32)
  header.writeUInt16LE(8, 34)
  header.write("data", 36)
  header.writeUInt32LE(samples, 40)
  return Buffer.concat([header, Buffer.alloc(samples, 128)])
}

const WAV = silentWav()

const dock = (page: Page) => page.getByRole("region", { name: "Recitation player" })

/** Serve every recitation file locally; no service worker is involved. */
test.beforeEach(async ({ page }) => {
  await page.route("**/everyayah.com/data/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "audio/wav",
      headers: { "access-control-allow-origin": "*" },
      body: WAV,
    }),
  )
  await page.goto("/", { waitUntil: "domcontentloaded" })
})

test("plays the selected verses from the banner", async ({ page }) => {
  await page.locator('.m-word[data-s="1"][data-a="1"].m-end').click()
  await expect(page.getByRole("status")).toContainText("1:1 selected")

  await page.getByRole("button", { name: "Play selected verses" }).click()
  await expect(dock(page)).toBeVisible()
  await expect(dock(page)).toContainText("1:1 · Al-Fatihah")
  await expect(dock(page)).toContainText("1 / 1")
})

test("plays only the selected words of a verse", async ({ page }) => {
  // Words 2 and 3 of 1:1 — a partial run, so playback is clipped by timings.
  await page.locator('.m-word[data-s="1"][data-a="1"]').nth(1).click()
  await page.locator('.m-word[data-s="1"][data-a="1"]').nth(2).click()
  await expect(page.getByRole("status")).toContainText("2 words selected")

  await page.getByRole("button", { name: "Play selected words" }).click()
  await expect(dock(page)).toBeVisible()
  await expect(dock(page)).toContainText("1:1 · Al-Fatihah")
  await expect(dock(page)).toContainText("1 / 1")
  await expect(dock(page)).toContainText("Word timings ready")
})

test("plays the whole surah and walks it ayah by ayah", async ({ page }) => {
  await page.getByRole("button", { name: "Show controls" }).click()
  await page.getByRole("button", { name: "Play this surah" }).click()

  await expect(dock(page)).toBeVisible()
  await expect(dock(page)).toContainText("1:1 · Al-Fatihah")
  await expect(dock(page)).toContainText("1 / 7")

  await page.getByRole("button", { name: "Next ayah" }).click()
  await expect(dock(page)).toContainText("1:2 · Al-Fatihah")
  await expect(dock(page)).toContainText("2 / 7")
})

test("plays the whole juz the page belongs to", async ({ page }) => {
  await page.getByRole("button", { name: "Show controls" }).click()
  await expect(page.getByRole("button", { name: "Play this juz" })).toBeEnabled()
  await page.getByRole("button", { name: "Play this juz" }).click()

  await expect(dock(page)).toBeVisible({ timeout: 20000 })
  await expect(dock(page)).toContainText("1:1 · Al-Fatihah")
  await expect(dock(page)).toContainText("1 / 148")

  await page.getByRole("button", { name: "Stop recitation" }).click()
  await expect(dock(page)).toHaveCount(0)
})

import { expect, test } from "@playwright/test"

test.use({ viewport: { width: 900, height: 1100 } })

test("bookmarks a selection and jumps back to it", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.waitForSelector('.sheet[data-page="1"] .mushaf.ready', { timeout: 20000 })

  // Select a verse deep in the mushaf through search: Al-Falaq 113:1.
  await page.getByRole("button", { name: "Show controls" }).click()
  await page.getByLabel("Search Quran").fill("برب الفلق")
  await page.getByRole("button", { name: /^113:1/ }).click({ timeout: 10000 })
  await expect(page.locator('.sheet[data-page="604"]')).toBeVisible()

  await page.locator('.sheet[data-page="604"] .m-word[data-s="113"][data-a="1"].m-end').click()
  await expect(page.getByRole("status")).toContainText("113:1 selected")
  await page.getByRole("button", { name: "Bookmark selection" }).click()
  await expect(page.getByText(/Bookmarked 1 verse/)).toBeVisible()

  // Leave for the first page, then return through the bookmark.
  await page.keyboard.press("Home")
  await expect(page.locator('.sheet[data-page="1"]')).toBeVisible()

  await page.getByRole("button", { name: "Show controls" }).click()
  await page.getByRole("button", { name: /Bookmarks/ }).click()
  await expect(page.getByText("No bookmarks yet")).toHaveCount(0)
  await expect(page.getByText("Al-Falaq", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "113:1", exact: true }).click()
  await expect(page.locator('.sheet[data-page="604"]')).toBeVisible()

  // The saved verse wears its bookmark strip on the page.
  const strip = page.locator('.sheet[data-page="604"] .m-word.m-bookmark-start')
  await expect(strip).toHaveCount(1)
  await expect
    .poll(async () =>
      Number.parseFloat(
        await strip.evaluate((el) => el.style.getPropertyValue("--m-bookmark-run-width")),
      ),
    )
    .toBeGreaterThan(0)

  // Removing it empties the panel (the jump closed it; reopen first).
  await page.getByRole("button", { name: "Show controls" }).click()
  await page.getByRole("button", { name: /Bookmarks/ }).click()
  await page.getByRole("button", { name: "Remove bookmark 113:1" }).click()
  await expect(page.getByText("No bookmarks yet")).toBeVisible()
})

test("keeps reading with the network cut off after install", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.waitForSelector('.sheet[data-page="1"] .mushaf.ready', { timeout: 30000 })

  // The service worker takes over once its precache finishes.
  await page.evaluate(() => navigator.serviceWorker.ready)

  await page.context().setOffline(true)
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForSelector('.sheet[data-page="1"] .mushaf.ready', { timeout: 30000 })

  // Turn, jump, and search all work from the precache.
  await page.keyboard.press("ArrowLeft")
  await expect(page.locator('.sheet[data-page="2"] .mushaf.ready')).toBeVisible({ timeout: 15000 })

  await page.getByRole("button", { name: "Show controls" }).click()
  await page.getByLabel("Go to page").fill("293")
  await page.getByLabel("Go to page").press("Enter")
  await expect(page.locator('.sheet[data-page="293"] .mushaf.ready')).toBeVisible({
    timeout: 15000,
  })

  await page.getByRole("button", { name: "Show controls" }).click()
  await page.getByLabel("Search Quran").fill("برب الفلق")
  await expect(page.getByRole("button", { name: /^113:1/ })).toBeVisible({ timeout: 15000 })
})

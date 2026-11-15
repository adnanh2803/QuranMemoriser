import { expect, test } from "@playwright/test"

test.use({ viewport: { width: 900, height: 1100 }, serviceWorkers: "block" })

test("navigates by surah, juz, and exact page", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.waitForSelector('.sheet[data-page="1"] .mushaf.ready', { timeout: 20000 })

  // The surah index opens a surah's first page (Al-Kahf starts on page 293).
  await page.getByLabel("Go to surah").selectOption({ label: "18. Al-Kahf" })
  await expect(page.locator('.sheet[data-page="293"]')).toBeVisible()

  // The juz index opens a juz's start page (juz 30 starts on page 582).
  await page.getByLabel("Go to juz").selectOption("30")
  await expect(page.locator('.sheet[data-page="582"]')).toBeVisible()

  // An exact page number jumps straight to it.
  const pageInput = page.getByLabel("Go to page")
  await pageInput.fill("120")
  await pageInput.press("Enter")
  await expect(page.locator('.sheet[data-page="120"]')).toBeVisible()

  // The indicator follows, and out-of-range input is rejected harmlessly.
  await expect(page.getByText(/120 \/ 604/)).toBeVisible()
  await pageInput.fill("999")
  await pageInput.press("Enter")
  await expect(page.locator('.sheet[data-page="120"]')).toBeVisible()
})

test("searches Arabic without diacritics and jumps to the verse's page", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.waitForSelector('.sheet[data-page="1"] .mushaf.ready', { timeout: 20000 })

  const search = page.getByLabel("Search Quran")
  await search.fill("برب الفلق")
  await expect(page.getByText("Search results")).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole("button", { name: /^113:1/ })).toBeVisible()

  // Opening a result lands on its printed page (Al-Falaq is on page 604).
  await page.getByRole("button", { name: /^113:1/ }).click()
  await expect(page.locator('.sheet[data-page="604"]')).toBeVisible()
  // The query is consumed after the jump.
  await expect(search).toHaveValue("")
})

test("searches a verse by its recalled common spelling", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.waitForSelector('.sheet[data-page="1"] .mushaf.ready', { timeout: 20000 })

  // The Uthmani script writes مَٰلِكِ with a dagger alif; users recall ملك.
  const search = page.getByLabel("Search Quran")
  await search.fill("ملك يوم الدين")
  await expect(page.getByRole("button", { name: /^1:4/ })).toBeVisible({ timeout: 10000 })

  // A pasted Uthmani query (dagger included) finds the same verse.
  await search.fill("مَٰلِكِ يَوْمِ ٱلدِّينِ")
  await expect(page.getByRole("button", { name: /^1:4/ })).toBeVisible({ timeout: 10000 })
})

test("ayah list virtualizes the mushaf and selects on tap", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.waitForSelector('.sheet[data-page="1"] .mushaf.ready', { timeout: 20000 })

  await page.getByRole("button", { name: "Ayah list" }).click()

  // Virtualization: only a window of the 6236 verses exists in the DOM.
  await expect(page.locator("article").first()).toBeVisible({ timeout: 10000 })
  const windowSize = await page.locator("article").count()
  expect(windowSize).toBeGreaterThan(0)
  expect(windowSize).toBeLessThan(60)

  // Scrolling deep swaps the window without rendering the whole list.
  await page.locator("main").evaluate((main) => main.scrollTo({ top: 400000 }))
  await page.waitForTimeout(400)
  const deepIndex = await page.locator("article").last().getAttribute("data-index")
  expect(Number(deepIndex)).toBeGreaterThan(3000)

  // Tapping a verse selects it; the list stays open for further picks.
  await page.locator("article").first().locator("button").click()
  await expect(page.getByRole("status")).toContainText("selected")
  await expect(page.getByRole("button", { name: "Mushaf" })).toBeVisible()
})

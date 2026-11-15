import { expect, test } from "@playwright/test"

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" })

test("shows one Mushaf page and slides between pages with a swipe", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  const pageOne = page.locator('.sheet[data-page="1"]')
  await expect(pageOne).toBeVisible()
  await expect(page.locator(".sheet")).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Show controls" })).toBeVisible()
  await page.getByRole("button", { name: "Show controls" }).click()
  await expect(page.getByRole("button", { name: "Hide controls" })).toBeVisible()
  await page.getByRole("button", { name: "Hide controls" }).click()
  await expect(page.getByRole("button", { name: "Show controls" })).toBeVisible()

  const main = await page.locator("main").boundingBox()
  expect(main).not.toBeNull()
  if (!main) throw new Error("Reader viewport was not laid out")
  const startForward = main.x + main.width * 0.2
  const endForward = main.x + main.width * 0.55
  const y = main.y + main.height * 0.5

  await page.mouse.move(startForward, y)
  await page.mouse.down()
  await page.mouse.move(endForward, y, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('.sheet[data-page="2"]')).toBeVisible()
  await expect(page.locator(".sheet")).toHaveCount(1)

  const startBackward = main.x + main.width * 0.8
  const endBackward = main.x + main.width * 0.45
  await page.mouse.move(startBackward, y)
  await page.mouse.down()
  await page.mouse.move(endBackward, y, { steps: 5 })
  await page.mouse.up()
  await expect(pageOne).toBeVisible()
  await expect(page.locator(".sheet")).toHaveCount(1)
})

test("keeps the same sheet dimensions on short and full pages", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: "Show controls" }).click()
  const sheet = page.locator(".sheet")
  await expect(sheet).toBeVisible()

  const shortPage = await sheet.boundingBox()
  if (!shortPage) throw new Error("Initial page was not laid out")

  const pageInput = page.getByLabel("Go to page")
  await pageInput.fill("3")
  await pageInput.press("Enter")
  await expect(page.locator('.sheet[data-page="3"]')).toBeVisible()
  await expect(page.locator(".sheet")).toHaveCount(1)

  const fullPage = await page.locator('.sheet[data-page="3"]').boundingBox()
  if (!fullPage) throw new Error("Page 3 was not laid out")
  expect(fullPage.width).toBeCloseTo(shortPage.width, 1)
  expect(fullPage.height).toBeCloseTo(shortPage.height, 1)
})

test("selects an ayah on tap, a word on long press, and a range on shift-click", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })

  // A tap selects the whole ayah — tap the first word of Al-Fatihah 1:1.
  await page.locator('.m-word[data-s="1"][data-a="1"]').first().click()
  await expect(page.getByRole("status")).toContainText("1:1 selected")

  // The selected run paints one wash on the run-start word's ::before.
  const wash = await page
    .locator(".m-word.m-selected-run-start")
    .first()
    .evaluate((word) => {
      const style = getComputedStyle(word, "::before")
      return {
        painted: style.backgroundColor !== "rgba(0, 0, 0, 0)",
        runWidth: Number.parseFloat(word.style.getPropertyValue("--m-selection-run-width")),
        insets: { top: style.top, bottom: style.bottom },
      }
    })
  expect(wash.painted).toBe(true)
  expect(wash.runWidth).toBeGreaterThan(0)
  expect(wash.insets).toEqual({ top: "0px", bottom: "0px" })

  // The highlight must bridge the justified gaps between a verse's words.
  const remainingHighlightGap = await page
    .locator(".m-line.m-ayah")
    .first()
    .evaluate((line) => {
      const boxes = Array.from(
        line.querySelectorAll<HTMLElement>('.m-word[data-s="1"][data-a="1"]'),
      )
        .map((word) => {
          const rect = word.getBoundingClientRect()
          const spread = Number.parseFloat(
            getComputedStyle(word).getPropertyValue("--m-word-select-spread"),
          )
          return { left: rect.left - spread, right: rect.right + spread }
        })
        .sort((a, b) => a.left - b.left)
      const gaps = boxes.slice(1).map((current, index) => {
        const previous = boxes[index]
        return previous ? current.left - previous.right : 0
      })
      return Math.max(0, ...gaps)
    })
  expect(remainingHighlightGap).toBeLessThanOrEqual(1)

  // A long press picks a single word (the precision tool for memorisation).
  const thirdAyahWord = page.locator('.m-word[data-s="1"][data-a="3"]').first()
  await thirdAyahWord.dispatchEvent("pointerdown", {
    pointerId: 1,
    isPrimary: true,
    pointerType: "touch",
    clientX: 120,
    clientY: 120,
  })
  await page.waitForTimeout(550)
  await thirdAyahWord.dispatchEvent("pointerup", {
    pointerId: 1,
    isPrimary: true,
    pointerType: "touch",
    clientX: 120,
    clientY: 120,
  })
  await expect(page.getByRole("status")).toContainText("1 word selected")
  await expect(page.locator(".m-word.m-selected")).toHaveCount(1)

  // Shift-click extends the ayah selection into a range.
  await page.getByRole("button", { name: "Clear" }).click()
  await expect(page.getByRole("status")).toHaveCount(0)
  await page.locator('.m-word[data-s="1"][data-a="2"]').first().click()
  await page.keyboard.down("Shift")
  await page.locator('.m-word[data-s="1"][data-a="4"]').first().click()
  await page.keyboard.up("Shift")
  await expect(page.getByRole("status")).toContainText("3 verses selected")
})

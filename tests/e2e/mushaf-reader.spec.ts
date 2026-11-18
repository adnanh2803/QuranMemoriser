import { expect, test } from "@playwright/test"

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" })

test("shows one Mushaf page and slides between pages with a swipe", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  const pageOne = page.locator('.sheet[data-page="1"]')
  await expect(pageOne).toBeVisible()
  await expect(page.locator(".sheet")).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Show controls" })).toBeVisible()
  await page.getByRole("button", { name: "Show controls" }).click()
  await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible()
  await page.getByRole("button", { name: "Close menu" }).click()
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

test("marks every surah opening printed on a page", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.waitForSelector('.sheet[data-page="1"] .mushaf.ready', { timeout: 20000 })

  // Page 1 opens Al-Fatiha with its calligraphic name in the line grid. The
  // running head carries only the juz and hizb, both at the page's left edge.
  const pageOne = page.locator('.sheet[data-page="1"]')
  await expect(pageOne.locator(".m-line.m-surah")).toHaveCount(1)
  await expect(pageOne.locator(".sheet-head .ph-surah")).toHaveCount(0)
  await expect(pageOne.locator(".sheet-head .ph-juz")).not.toBeEmpty()
  await expect(pageOne.locator(".sheet-head .ph-hizb")).not.toBeEmpty()

  const head = await pageOne.locator(".sheet-head").boundingBox()
  if (!head) throw new Error("Page 1 header was not laid out")
  for (const label of [".ph-juz", ".ph-hizb"]) {
    const box = await pageOne.locator(`.sheet-head ${label}`).boundingBox()
    if (!box) throw new Error(`Page 1 ${label} was not laid out`)
    expect(box.x + box.width).toBeLessThanOrEqual(head.x + head.width / 2)
  }

  // The last page opens three surahs, each with its name in the line grid.
  await page.getByRole("button", { name: "Show controls" }).click()
  const pageInput = page.getByLabel("Go to page")
  await pageInput.fill("604")
  await pageInput.press("Enter")
  await page.waitForSelector('.sheet[data-page="604"] .mushaf.ready', { timeout: 20000 })
  await expect(page.locator('.sheet[data-page="604"] .m-line.m-surah')).toHaveCount(3)
})

test("keeps a top-of-page surah name on the page where it begins", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: "Show controls" }).click()
  const pageInput = page.getByLabel("Go to page")

  // Page 584 ends with 79:46; the print puts Surah Abasa's name band at its
  // foot. The app leaves that slot blank instead.
  await pageInput.fill("584")
  await pageInput.press("Enter")
  await page.waitForSelector('.sheet[data-page="584"] .mushaf.ready', { timeout: 20000 })
  const page584 = page.locator('.sheet[data-page="584"]')
  await expect(page584.locator(".m-line.m-surah")).toHaveCount(0)
  await expect(page584.locator(".m-line.m-opening")).toHaveCount(0)
  await expect(page584.locator(".m-line.m-blank")).toHaveCount(1)
  await expect(page584.locator('.m-word[data-s="80"]')).toHaveCount(0)

  // Page 585 opens Abasa: its name and basmalah share the first line, and the
  // running head no longer repeats the surah name.
  await page.getByRole("button", { name: "Show controls" }).click()
  await pageInput.fill("585")
  await pageInput.press("Enter")
  await page.waitForSelector('.sheet[data-page="585"] .mushaf.ready', { timeout: 20000 })
  const page585 = page.locator('.sheet[data-page="585"]')
  const opening = page585.locator(".m-line.m-opening")
  await expect(opening).toHaveCount(1)
  await expect(opening.locator(".ph-surah")).not.toBeEmpty()
  await expect(opening.locator(".m-basmalah-run")).not.toBeEmpty()
  await expect(page585.locator(".sheet-head .ph-surah")).toHaveCount(0)
  await expect(page585.locator('.m-word[data-s="80"][data-a="1"]').first()).toBeVisible()
})

test("marks a start, completes the range on the second tap", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })

  // The first tap marks the start: it alone lights up, the banner names it
  // with a Start chip, and the word waits.
  await page.locator('.m-word[data-s="1"][data-a="1"]').nth(1).click()
  await expect(page.getByRole("status")).toContainText("Start")
  await expect(page.getByRole("status")).toContainText("tap the end")
  await expect(page.locator(".m-word.m-selected")).toHaveCount(1)

  // The marked word carries the start design: an accent ring drawn around it.
  const ring = await page
    .locator(".m-word.m-pending")
    .first()
    .evaluate((word) => getComputedStyle(word, "::after").boxShadow)
  expect(ring).not.toBe("none")

  // The second tap ends the selection: everything between, in either order.
  await page.locator('.m-word[data-s="1"][data-a="1"]').nth(3).click()
  await expect(page.getByRole("status")).toContainText("3 words selected")
  await expect(page.locator(".m-word.m-selected")).toHaveCount(3)

  // Tapping the marked word again completes a one-word selection.
  await page.getByRole("button", { name: "Clear" }).click()
  await expect(page.getByRole("status")).toHaveCount(0)
  const secondWord = page.locator('.m-word[data-s="1"][data-a="2"]').first()
  await secondWord.click()
  await secondWord.click()
  await expect(page.getByRole("status")).toContainText("1 word selected")
  await expect(page.locator(".m-word.m-selected")).toHaveCount(1)

  // The ayah number — the verse-end medallion — still selects the whole
  // verse in one tap, and completes a range as the second tap.
  await page.getByRole("button", { name: "Clear" }).click()
  await page.locator('.m-word[data-s="1"][data-a="1"].m-end').click()
  await expect(page.getByRole("status")).toContainText("1:1 selected")
  await expect(page.locator(".m-word.m-selected")).toHaveCount(5)

  // The selected run paints one highlighter bar on the run-start word's
  // ::before: inset from the line's height, centred on the ink, with a
  // cushion leaning past the run's start.
  const wash = await page
    .locator(".m-word.m-selected-run-start")
    .first()
    .evaluate((word) => {
      const style = getComputedStyle(word, "::before")
      const wordHeight = word.getBoundingClientRect().height
      const top = Number.parseFloat(style.top)
      const bottom = Number.parseFloat(style.bottom)
      return {
        painted: style.backgroundColor !== "rgba(0, 0, 0, 0)",
        runWidth: Number.parseFloat(word.style.getPropertyValue("--m-selection-run-width")),
        top,
        bottom,
        barHeight: wordHeight - top - bottom,
        wordHeight,
        startOffset: Number.parseFloat(style.right),
        width: Number.parseFloat(style.width),
        startCorner: style.getPropertyValue("border-start-start-radius"),
      }
    })
  expect(wash.painted).toBe(true)
  expect(wash.runWidth).toBeGreaterThan(0)
  expect(wash.top).toBeGreaterThan(0)
  expect(wash.top).toBe(wash.bottom)
  expect(wash.barHeight).toBeLessThan(wash.wordHeight)
  expect(wash.startOffset).toBeLessThan(0)
  expect(wash.width).toBeGreaterThan(wash.runWidth)
  // 1:1 begins on the page's first word, so the bar must keep the pill's
  // rounded start corners rather than squaring off at the line's margin.
  expect(wash.startCorner).not.toBe("0px")

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

  // A long press extends the marked start through the word (the touch shift).
  await page.getByRole("button", { name: "Clear" }).click()
  await expect(page.getByRole("status")).toHaveCount(0)
  const firstOfFifth = page.locator('.m-word[data-s="1"][data-a="5"]').first()
  await firstOfFifth.click()
  await expect(page.getByRole("status")).toContainText("tap the end")
  await firstOfFifth.dispatchEvent("pointerdown", {
    pointerId: 1,
    isPrimary: true,
    pointerType: "touch",
    clientX: 120,
    clientY: 120,
  })
  await page.waitForTimeout(550)
  await firstOfFifth.dispatchEvent("pointerup", {
    pointerId: 1,
    isPrimary: true,
    pointerType: "touch",
    clientX: 120,
    clientY: 120,
  })
  await expect(page.getByRole("status")).toContainText("1 word selected")
  await expect(page.locator(".m-word.m-selected")).toHaveCount(1)
  const secondOfFifth = page.locator('.m-word[data-s="1"][data-a="5"]').nth(1)
  await secondOfFifth.dispatchEvent("pointerdown", {
    pointerId: 1,
    isPrimary: true,
    pointerType: "touch",
    clientX: 160,
    clientY: 120,
  })
  await page.waitForTimeout(550)
  await secondOfFifth.dispatchEvent("pointerup", {
    pointerId: 1,
    isPrimary: true,
    pointerType: "touch",
    clientX: 160,
    clientY: 120,
  })
  await expect(page.getByRole("status")).toContainText("2 words selected")
  await expect(page.locator(".m-word.m-selected")).toHaveCount(2)

  // Shift-click extends the marked start to the whole verse clicked through
  // its number.
  await page.getByRole("button", { name: "Clear" }).click()
  await expect(page.getByRole("status")).toHaveCount(0)
  await page.locator('.m-word[data-s="1"][data-a="2"]').first().click()
  await expect(page.getByRole("status")).toContainText("tap the end")
  await page.keyboard.down("Shift")
  await page.locator('.m-word[data-s="1"][data-a="4"].m-end').click()
  await page.keyboard.up("Shift")
  await expect(page.getByRole("status")).toContainText("3 verses selected")
})

test("keeps the selection dock at the bottom of a short window", async ({ page }) => {
  const height = 600
  await page.setViewportSize({ width: 900, height })
  await page.goto("/", { waitUntil: "domcontentloaded" })

  await page.locator('.m-word[data-s="1"][data-a="1"]').nth(1).click()
  const dock = page.getByRole("status")
  await expect(dock).toBeVisible()
  const box = await dock.boundingBox()
  expect(box).not.toBeNull()
  if (!box) throw new Error("Selection dock was not laid out")
  expect(box.y).toBeGreaterThan(height / 2)
  expect(box.y + box.height).toBeLessThanOrEqual(height)
})

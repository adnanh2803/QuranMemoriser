// DOM overlay helpers for MushafSheet selection and bookmark rendering.

/** Update per-word selection wash spread so adjacent selected words merge cleanly. */
export function updateWordSelectionGaps(el: HTMLElement): void {
  for (const line of el.querySelectorAll<HTMLElement>(".m-line.m-ayah")) {
    const words = Array.from(line.querySelectorAll<HTMLElement>(".m-word"))
    const lineRect = line.getBoundingClientRect()
    const boxes = words.map((word) => word.getBoundingClientRect()).sort((a, b) => a.left - b.left)
    const gaps = boxes.slice(1).map((current, index) => {
      const previous = boxes[index]
      return previous ? current.left - previous.right : 0
    })
    const spread =
      gaps.length > 0 ? Math.max(0, gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length / 2) : 0
    for (const word of words) {
      word.style.setProperty("--m-word-select-spread", `${spread}px`)
      const rect = word.getBoundingClientRect()
      word.style.setProperty(
        "--m-select-to-line-start",
        `${Math.max(0, lineRect.right - rect.right)}px`,
      )
      word.style.setProperty(
        "--m-select-to-line-end",
        `${Math.max(0, rect.left - lineRect.left)}px`,
      )
    }
  }
}

/** Compute the selected run width and edge radii for each line-start selected word. */
export function updateSelectionRunWidths(
  el: HTMLElement,
  continuedAfter: (el: HTMLElement) => boolean,
): void {
  for (const line of el.querySelectorAll<HTMLElement>(".m-line.m-ayah")) {
    const words = Array.from(line.querySelectorAll<HTMLElement>(".m-word"))
    for (let index = 0; index < words.length; index++) {
      const start = words[index]
      if (!start?.classList.contains("m-selected-start")) continue
      let end = index
      while (end + 1 < words.length && words[end + 1]?.classList.contains("m-selected")) end++
      const finish = words[end]
      if (!finish) continue
      const firstRect = start.getBoundingClientRect()
      const lastRect = finish.getBoundingClientRect()
      start.style.setProperty(
        "--m-selection-run-width",
        `${Math.max(firstRect.right - lastRect.left, firstRect.width)}px`,
      )
      // Square and reaching line end only when the stroke carries on past this page.
      const bridges =
        finish.classList.contains("m-selected-page-edge-end") && continuedAfter(finish)
      start.style.setProperty(
        "--m-selection-run-to-line-end",
        bridges ? finish.style.getPropertyValue("--m-select-to-line-end") : "0px",
      )
      start.style.setProperty("--m-selection-run-end-pad", bridges ? "0px" : "var(--m-wash-pad-x)")
      start.style.setProperty("--m-stroke-end-radius", bridges ? "0px" : "")
    }
  }
}

/**
 * Paint saved bookmark bands/ribbons into a dedicated layer beneath words.
 * Selection wash paints above this layer, so bookmarks remain visible.
 */
export function updateBookmarkLayer(el: HTMLElement, layer: HTMLElement | null): void {
  if (!layer) return
  layer.replaceChildren()
  const layerRect = layer.getBoundingClientRect()
  let previousLineMarked = false
  for (const line of el.querySelectorAll<HTMLElement>(".m-line.m-ayah")) {
    const words = Array.from(line.querySelectorAll<HTMLElement>(".m-word"))
    for (let index = 0; index < words.length; index++) {
      const start = words[index]
      if (!start?.classList.contains("m-bookmark-start")) continue
      let end = index
      while (end + 1 < words.length) {
        const next = words[end + 1]
        if (
          !next ||
          !(next.classList.contains("m-bookmarked") || next.classList.contains("m-word-bookmarked"))
        ) {
          break
        }
        end++
      }
      const finish = words[end]
      if (!finish) continue
      const first = start.getBoundingClientRect()
      const last = finish.getBoundingClientRect()
      const fontSize = Number.parseFloat(getComputedStyle(start).fontSize) || 16
      const cushion = fontSize * 0.18
      const top = first.top - layerRect.top + fontSize * 0.13
      const height = first.height - fontSize * 0.26
      const band = document.createElement("span")
      band.className = "m-bookmark-band"
      band.style.left = `${last.left - layerRect.left - cushion}px`
      band.style.top = `${top}px`
      band.style.width = `${first.right - last.left + cushion * 2}px`
      band.style.height = `${height}px`
      layer.append(band)
      // One ribbon marks the selection itself, not every wrapped row.
      if (index === 0 && previousLineMarked) continue
      const bandRight = first.right - layerRect.left + cushion
      const flagWidth = fontSize * 0.3
      const flagHeight = fontSize * 0.42
      const flag = document.createElement("span")
      flag.className = "m-bookmark-flag"
      flag.style.left = `${bandRight - flagWidth + fontSize * 0.02}px`
      flag.style.top = `${top - flagHeight + fontSize * 0.12}px`
      flag.style.width = `${flagWidth}px`
      flag.style.height = `${flagHeight}px`
      layer.append(flag)
    }
    const lineEnd = words[words.length - 1]
    previousLineMarked =
      !!lineEnd &&
      (lineEnd.classList.contains("m-bookmarked") ||
        lineEnd.classList.contains("m-word-bookmarked"))
  }
}

/** Update selection gaps, run widths, and bookmark overlays for a settled sheet. */
export function updateSheetOverlays(
  el: HTMLElement,
  bookmarkLayer: HTMLElement | null,
  continuedAfter: (el: HTMLElement) => boolean,
): void {
  updateWordSelectionGaps(el)
  updateSelectionRunWidths(el, continuedAfter)
  updateBookmarkLayer(el, bookmarkLayer)
}

export const PAGE_COUNT = 604
export const LAST_PAGE_KEY = "qm.page"

/** Restore the last viewed mushaf page from local storage. */
export function restorePage(): number {
  const saved = Number.parseInt(localStorage.getItem(LAST_PAGE_KEY) ?? "", 10)
  return saved >= 1 && saved <= PAGE_COUNT ? saved : 1
}

/** Clamp a page number to the valid mushaf range. */
export function clampPage(page: number): number {
  return Math.min(PAGE_COUNT, Math.max(1, page))
}

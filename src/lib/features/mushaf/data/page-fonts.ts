/**
 * Registry for the KFGQPC QCF v1 page fonts.
 *
 * Each mushaf page has its own font: every glyph is a whole word drawn exactly
 * as it is printed on that page, so a page's glyph codes only render in its own
 * font. Faces are registered with the FontFace API as the reader reaches them
 * and evicted LRU-style afterwards — 604 `@font-face` rules would make the
 * browser carry type for the whole mushaf at all times.
 *
 * Registration fetches nothing; the download happens when the face is loaded,
 * bounded to a few at a time so fast scrolling cannot flood the connection.
 */
import pLimit from "p-limit"

/** Faces kept beyond the ones the open window needs (surah warmings included). */
const MAX_FACES = 24
/** Parallel font downloads; a page font is ~27 KB, so three is plenty. */
const FETCH_CONCURRENCY = 3

interface FaceEntry {
  face: FontFace
  /** Resolves with the family name once the face is usable. */
  promise: Promise<string> | null
  started: boolean
}

export class PageFontRegistry {
  private readonly faces = new Map<string, FaceEntry>()
  /** Families, least recently used first. */
  private order: string[] = []
  private readonly pinned = new Set<string>()
  private readonly limit = pLimit(FETCH_CONCURRENCY)

  /** The font-family name for a page's own face. */
  familyFor(page: number): string {
    return `QCF-P${String(page).padStart(3, "0")}`
  }

  urlFor(page: number): string {
    return `/fonts/pages/QCF_P${String(page).padStart(3, "0")}.woff2`
  }

  /** Register the face (fetches nothing). */
  private register(page: number): FaceEntry {
    const family = this.familyFor(page)
    const existing = this.faces.get(family)
    if (existing) return existing

    const face = new FontFace(family, `url(${this.urlFor(page)})`)
    document.fonts.add(face)
    const entry: FaceEntry = { face, promise: null, started: false }
    this.faces.set(family, entry)
    return entry
  }

  /**
   * Make sure a page's face is registered and loaded; resolves with its family
   * name once text set in that family will render with the right glyphs.
   */
  ensure(page: number): Promise<string> {
    const family = this.familyFor(page)
    const entry = this.register(page)
    if (!entry.started) {
      entry.started = true
      entry.promise = this.limit(() => entry.face.load()).then(() => family)
    }
    this.touch(family)
    this.evict()
    return entry.promise ?? Promise.resolve(family)
  }

  /** Fire-and-forget load of a neighbouring page's face. */
  warm(page: number): void {
    void this.ensure(page).catch(() => {})
  }

  /** A face kept for as long as the reader runs (basmalah band, headers). */
  pin(family: string): void {
    this.pinned.add(family)
  }

  private touch(family: string): void {
    const at = this.order.indexOf(family)
    if (at >= 0) this.order.splice(at, 1)
    this.order.push(family)
  }

  private drop(family: string): void {
    const entry = this.faces.get(family)
    if (!entry) return
    this.order.splice(this.order.indexOf(family), 1)
    this.faces.delete(family)
    document.fonts.delete(entry.face)
  }

  private evict(): void {
    const spare = this.order.filter((family) => !this.pinned.has(family))
    while (spare.length > MAX_FACES) {
      const family = spare.shift()
      if (family === undefined) break
      this.drop(family)
    }
  }
}

/**
 * The two static typefaces the reader draws with: the basmalah band's own
 * face (every opening carries the band, and Al-Fatihah 1:1 *is* the basmalah)
 * and the ornamental surah-name face used by headers and the running head.
 */
export function registerStaticFonts(): void {
  document.fonts.add(new FontFace("QCF-BSML", "url(/fonts/QCF_BSML.woff2)"))
  document.fonts.add(new FontFace("SuraNames", "url(/fonts/sura-names.woff2)"))
  // The continuous Uthmanic Hafs face behind the ayah list and search results.
  document.fonts.add(new FontFace("UthmanicHafs", "url(/fonts/uthmanic-hafs.woff2)"))
  void document.fonts.load('1em "QCF-BSML"').catch(() => {})
  void document.fonts.load('1em "SuraNames"').catch(() => {})
  void document.fonts.load('1em "UthmanicHafs"').catch(() => {})
}

/**
 * Settling a sheet's lines against the measure.
 *
 * The QCF v1 type scale (fit.body = 19.76 ems) sizes the sheet so the widest
 * printed line just fills it; most lines then justify by spreading the
 * leftover space between the words, exactly as the mushaf is set. Two ends are
 * settled at runtime: a handful of lines drawn wider than the rest shrink a
 * hair, and a line well short of the measure is centred rather than pulled
 * out to both margins.
 *
 * Adapted from the proven layout logic of Quran-On-Web (MIT licence).
 */
/** The gap a centred line opens between its words — must match `.m-short`. */
const CENTRE_GAP_EM = 0.24

/** Width a line wants, as a fraction of the measure. */
function naturalWidth(line: HTMLElement, avail: number, magnify: number): number {
  const kept = Number.parseFloat(line.dataset.nat ?? "")
  if (kept > 0 && avail > 0) return kept * avail

  let width = 0
  for (const word of line.children) {
    width += word.getBoundingClientRect().width
  }
  width /= magnify

  // An inline font-size is only ever a percentage written by a previous
  // settle, so undoing it gives the width the line would have had unshrunk.
  const shrunk = Number.parseFloat(line.style.fontSize)
  if (shrunk > 0) width *= 100 / shrunk
  return width
}

/**
 * One read pass over the sheet's ayah lines, then the writes. Returns false
 * when the page's font has not painted yet (a line measures as nothing), so
 * the caller retries instead of locking in a bogus layout.
 */
export function settleLines(box: HTMLElement, centreBelow: number): boolean {
  const lines = box.querySelectorAll<HTMLElement>(".m-ayah")
  if (lines.length === 0) return true

  const avail = box.clientWidth
  if (avail < 10) return false

  // Vertical settings move nothing sideways and can be cleared up front.
  for (const line of lines) {
    line.style.height = ""
    line.style.lineHeight = ""
  }

  // The height every line must keep is read once, before anything is shrunk:
  // line heights are set in ems, so shrinking a line would otherwise shorten
  // it and pull the sheet off its fixed line grid.
  const magnify = box.offsetWidth > 0 ? box.getBoundingClientRect().width / box.offsetWidth : 1
  const scale = magnify > 0 ? magnify : 1
  const firstLine = lines[0]
  if (!firstLine) return false
  const lineHeight = firstLine.getBoundingClientRect().height / scale
  if (lineHeight <= 0) return false

  // The type size is only needed to size a centred line's gaps, and barely
  // any line is centred — it is read on demand, not per sheet.
  let em = -1

  const widths: number[] = []
  for (const line of lines) {
    const width = naturalWidth(line, avail, scale)
    if (width <= 0) return false
    widths.push(width)
  }

  // Keep what each line measured, so re-settles never read back their own
  // writes. One write between every pair of reads is a reflow a line.
  lines.forEach((line, index) => {
    const width = widths[index]
    if (width !== undefined && width > 0 && avail > 0 && !line.dataset.nat) {
      line.dataset.nat = String(width / avail)
    }
  })

  lines.forEach((line, index) => {
    const width = widths[index]
    if (width === undefined) return

    if (width > avail) {
      // A hair under, so rounding cannot put it back over the edge.
      line.style.fontSize = `${((avail / width) * 99.5).toFixed(3)}%`
      line.style.height = `${lineHeight}px`
      line.style.lineHeight = `${lineHeight}px`
      line.classList.remove("m-short")
      return
    }

    line.style.fontSize = ""

    // Centre a line short of the measure — but only while the gaps centring
    // opens still fit; otherwise it is justified like every other line.
    if (width >= avail * centreBelow) {
      line.classList.remove("m-short")
      return
    }
    if (em < 0) em = Number.parseFloat(getComputedStyle(box).fontSize) || 0
    const gaps = (line.children.length - 1) * CENTRE_GAP_EM * em
    line.classList.toggle("m-short", width + gaps <= avail)
  })

  return true
}

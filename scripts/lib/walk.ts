/**
 * Assigns every layout glyph slot to its ayah.
 *
 * The QUL layout is the print truth (604 pages × 15 line items with QCF v1
 * glyph slots). Its glyphs form one continuous stream over the whole Quran;
 * the per-ayah reference streams (`mushaf.txt`) only delimit ayah boundaries.
 * The walk consumes the reference stream as layout glyphs arrive and records
 * which ayah each slot belongs to.
 *
 * A handful of documented reference defects are tolerated as anomalies
 * (asserted against a fixed ledger by the build):
 *  - `reference-extra`: the reference carries duplicated/extra glyphs,
 *    either inside a stream (2:79) or trailing at its end (69:8),
 *  - `substitution`: the reference carries a corrupt non-glyph character
 *    where the layout prints a real glyph (68:42).
 *
 * Slots never span an ayah boundary (verified over all 83 665 slots); the
 * walk throws if the stream alignment ever suggests otherwise.
 */

/** One glyph slot of the layout, in mushaf reading order. */
export interface WalkSlot {
  /** 1-based layout page the slot is printed on. */
  page: number
  /** Slot string exactly as printed (may contain U+0020 spacing). */
  raw: string
  /** Space-stripped glyphs used for stream matching. */
  glyphs: string
}

export type WalkAnomalyKind = "reference-extra" | "substitution" | "layout-extra"

export interface WalkAnomaly {
  kind: WalkAnomalyKind
  /** 1-based layout page of the slot involved. */
  page: number
  /** 1-based ayah whose reference stream is involved. */
  ayah: number
  detail: string
}

export interface WalkResult {
  /** 0-based ayah index owning each slot, in slot order. */
  slotAyah: number[]
  /** True when the slot carries its ayah's final glyph. */
  slotEnd: boolean[]
  /** 1-based start page per ayah, 0-based array (0 = never matched). */
  ayahStartPage: number[]
  /** 1-based page of each ayah's final glyph, 0-based array (0 = none). */
  ayahEndPage: number[]
  anomalies: WalkAnomaly[]
}

/** How many reference glyphs may be skipped to resynchronise after an anomaly. */
const LOOKAHEAD = 4

/** QCF v1 glyphs live in the Arabic Presentation Forms-A block. */
export function isQcfGlyph(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return code >= 0xfb50 && code <= 0xfdff
}

const hex = (char: string): string => `U+${(char.codePointAt(0) ?? 0).toString(16)}`

interface Cursor {
  ayah: number
  pos: number
  char: string
}

export function walkSlots(slots: WalkSlot[], streams: string[]): WalkResult {
  let ayah = 0
  let pos = 0
  const slotAyah: number[] = []
  const slotEnd: boolean[] = []
  const ayahStartPage = new Array<number>(streams.length).fill(0)
  const ayahEndPage = new Array<number>(streams.length).fill(0)
  const anomalies: WalkAnomaly[] = []

  if (streams.length === 0) {
    throw new Error("walk needs at least one reference stream")
  }

  /** Glyph `offset` positions ahead of the cursor, crossing ayah bounds. */
  const probe = (offset: number): Cursor | null => {
    let a = ayah
    let p = pos + offset
    while (a < streams.length) {
      const stream = streams[a]
      if (stream === undefined) return null
      if (p < stream.length) return { ayah: a, pos: p, char: stream.charAt(p) }
      a += 1
      p = 0
    }
    return null
  }

  for (const slot of slots) {
    if (slot.glyphs.length === 0) {
      throw new Error(`empty slot on page ${slot.page}: ${JSON.stringify(slot.raw)}`)
    }

    /** 0-based ayahs whose reference glyphs this slot consumed. */
    const touched = new Set<number>()
    /** 0-based ayah of the slot's first consumed glyph. */
    let owner: number | null = null

    for (const glyph of slot.glyphs) {
      const head = probe(0)

      // Reference chars outside the glyph range are corrupt data standing
      // where a real glyph is printed; the layout's glyph takes its place.
      if (head && !isQcfGlyph(head.char)) {
        anomalies.push({
          kind: "substitution",
          page: slot.page,
          ayah: head.ayah + 1,
          detail: `reference has non-glyph ${hex(head.char)} where the layout prints ${hex(glyph)}`,
        })
        touched.add(head.ayah)
        if (owner === null) owner = head.ayah
        if (ayahStartPage[head.ayah] === 0) ayahStartPage[head.ayah] = slot.page
        ayah = head.ayah
        pos = head.pos + 1
        continue
      }

      let matched: (Cursor & { offset: number }) | null = null
      for (let offset = 0; offset < LOOKAHEAD; offset++) {
        const candidate = probe(offset)
        if (!candidate) break
        if (candidate.char === glyph) {
          matched = { ...candidate, offset }
          break
        }
      }

      if (!matched) {
        // The layout prints a glyph the reference does not have. Do not
        // consume reference glyphs; a fixed ledger decides at build time
        // whether this is a known defect or a hard failure.
        anomalies.push({
          kind: "layout-extra",
          page: slot.page,
          ayah: (owner ?? head?.ayah ?? ayah) + 1,
          detail: `layout prints ${hex(glyph)} but the reference has ${head ? hex(head.char) : "stream end"}`,
        })
        continue
      }

      if (matched.ayah > ayah) {
        // Crossing into the next stream. Glyphs left unconsumed in the old
        // stream are trailing extras the layout never printed; the previous
        // slot carried that ayah's real final glyph.
        const currentStream = streams[ayah]
        if (currentStream === undefined) {
          throw new Error(`walk cursor left the reference streams on p${slot.page}`)
        }
        const leftover = currentStream.length - pos
        if (leftover > 0) {
          const previousIndex = slotAyah.length - 1
          const previousSlot = previousIndex >= 0 ? slots[previousIndex] : undefined
          if (!previousSlot || slotAyah[previousIndex] !== ayah) {
            throw new Error(
              `cannot attribute ${leftover} trailing reference glyph(s) of ayah ${ayah + 1} on p${slot.page}`,
            )
          }
          anomalies.push({
            kind: "reference-extra",
            page: previousSlot.page,
            ayah: ayah + 1,
            detail: `reference carries ${leftover} trailing extra glyph(s) after the ayah's last printed glyph`,
          })
          slotEnd[previousIndex] = true
          ayahEndPage[ayah] = previousSlot.page
        } else if (matched.offset > 0) {
          anomalies.push({
            kind: "reference-extra",
            page: slot.page,
            ayah: ayah + 1,
            detail: `reference carries ${matched.offset} extra glyph(s) before ${hex(glyph)}`,
          })
        }
      } else if (matched.offset > 0) {
        anomalies.push({
          kind: "reference-extra",
          page: slot.page,
          ayah: ayah + 1,
          detail: `reference carries ${matched.offset} extra glyph(s) before ${hex(glyph)}`,
        })
      }

      touched.add(matched.ayah)
      if (owner === null) owner = matched.ayah
      if (ayahStartPage[matched.ayah] === 0) ayahStartPage[matched.ayah] = slot.page
      ayah = matched.ayah
      pos = matched.pos + 1
    }

    if (touched.size > 1) {
      throw new Error(
        `slot spans an ayah boundary (page ${slot.page}, raw ${JSON.stringify(slot.raw)}): ` +
          `${[...touched].map((a) => a + 1).join(", ")}`,
      )
    }

    const ownerStream = owner === null ? undefined : streams[owner]
    const completes = ownerStream !== undefined && pos >= ownerStream.length
    slotAyah.push(owner ?? ayah)
    slotEnd.push(completes)
    if (owner !== null && completes) {
      ayahEndPage[owner] = slot.page
    }
  }

  return { slotAyah, slotEnd, ayahStartPage, ayahEndPage, anomalies }
}

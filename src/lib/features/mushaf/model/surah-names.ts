/**
 * The ornamental surah-name typeface (sura-names.woff2): one calligraphic
 * glyph per surah at U+E001–E114, addressed by reading the surah's decimal
 * number as hexadecimal (4 → E004, 10 → E010, 114 → E114). The word سورة
 * itself sits at U+E000, just below the 114 names.
 */
export const SURAH_WORD = String.fromCodePoint(0xe000)

export function surahNameGlyph(surah: number): string {
  return String.fromCodePoint(0xe000 + Number.parseInt(String(surah).padStart(3, "0"), 16))
}

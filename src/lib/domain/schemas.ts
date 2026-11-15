import { z } from "zod"

/**
 * Domain schemas for all Quran data crossing a trust boundary.
 *
 * These schemas are the single source of truth, shared by:
 * - the build pipeline (`scripts/*`, runs on plain Node via type-stripping)
 * - the app runtime (validates every fetched/bundled data file)
 *
 * Page layout comes from the QUL-derived Madinah mushaf layout (604 pages ×
 * 15 line items, the print truth); verse metadata comes from the public
 * Quran.com v4 API; both are cross-checked against the KFGQPC QCF v1 glyph
 * table (`mushaf.txt`).
 */

/* ------------------------------------------------------------------ */
/* Primitive domain values                                             */
/* ------------------------------------------------------------------ */

/** Page number of the Madinah Mushaf (604 pages, 15 lines). */
export const pageNumberSchema = z.number().int().min(1).max(604)
export type PageNumber = z.infer<typeof pageNumberSchema>

/** Surah number (1..114). */
export const surahNumberSchema = z.number().int().min(1).max(114)
export type SurahNumber = z.infer<typeof surahNumberSchema>

/** A verse reference like "2:255". */
export const verseKeySchema = z.string().regex(/^\d{1,3}:\d{1,3}$/)
export type VerseKey = z.infer<typeof verseKeySchema>

/* ------------------------------------------------------------------ */
/* Quran.com v4 API boundary (raw, build-time only)                    */
/* ------------------------------------------------------------------ */

export const apiWordSchema = z.object({
  id: z.number(),
  position: z.number().int().min(1),
  char_type_name: z.string().min(1),
  code_v1: z.string().min(1),
  line_number: z.number().int().min(1).max(20),
  page_number: pageNumberSchema,
  text: z.string(),
})
export type ApiWord = z.infer<typeof apiWordSchema>

export const apiVerseSchema = z.object({
  id: z.number(),
  verse_number: z.number().int().min(1).max(286),
  verse_key: verseKeySchema,
  hizb_number: z.number().int().min(1).max(60),
  rub_el_hizb_number: z.number().int().min(1).max(240),
  ruku_number: z.number().int().min(1).max(570),
  manzil_number: z.number().int().min(1).max(7),
  sajdah_number: z.number().int().nullable(),
  juz_number: z.number().int().min(1).max(30),
  page_number: pageNumberSchema,
  text_uthmani: z.string(),
  words: z.array(apiWordSchema).min(1),
})
export type ApiVerse = z.infer<typeof apiVerseSchema>

export const apiVersePageResponseSchema = z.object({
  verses: z.array(apiVerseSchema).min(1),
  pagination: z.object({
    per_page: z.number().int().min(1),
    current_page: z.number().int().min(1),
    next_page: z.number().int().nullable(),
    total_pages: z.number().int().min(1),
    total_records: z.number().int().min(1),
  }),
})
export type ApiVersePageResponse = z.infer<typeof apiVersePageResponseSchema>

export const apiChapterSchema = z.object({
  id: surahNumberSchema,
  revelation_place: z.string().min(1),
  revelation_order: z.number().int().min(1),
  bismillah_pre: z.boolean(),
  name_simple: z.string().min(1),
  name_complex: z.string().min(1),
  name_arabic: z.string().min(1),
  verses_count: z.number().int().min(3).max(286),
  pages: z.tuple([pageNumberSchema, pageNumberSchema]),
  translated_name: z.object({
    language_name: z.string().min(1),
    name: z.string().min(1),
  }),
})
export type ApiChapter = z.infer<typeof apiChapterSchema>

export const apiChaptersResponseSchema = z.object({
  chapters: z.array(apiChapterSchema).length(114),
})
export type ApiChaptersResponse = z.infer<typeof apiChaptersResponseSchema>

/* ------------------------------------------------------------------ */
/* QUL mushaf layout boundary (build-time only)                        */
/* ------------------------------------------------------------------ */

/**
 * One item of the QUL-derived mushaf layout: exactly one line slot of one
 * page. `ayah` items carry the pipe-delimited QCF v1 slot glyphs of the
 * printed words; `surah` items are header bands; `basmalah` items are the
 * basmalah line printed under a header.
 */
export const mushafLayoutItemSchema = z.object({
  t: z.enum(["ayah", "surah", "basmalah"]),
  /** Pipe-delimited QCF v1 slot glyphs (ayah lines only). */
  v1: z.string().optional(),
  /** Secondary glyph encoding kept by the layout file (unused, v1 is pinned). */
  v2: z.string().optional(),
  /** Surah number (surah header items only). */
  s: surahNumberSchema.optional(),
  /** 1 when this line continues the previous line's ayah (informational). */
  c: z.number().optional(),
})
export type MushafLayoutItem = z.infer<typeof mushafLayoutItemSchema>

/** The basmalah band's glyph data in the layout file (page 1 entry). */
export const mushafLayoutBasmalahSchema = z.object({
  page: pageNumberSchema,
  /** Pipe-delimited QCF v1 slots of the basmalah band, rendered with QCF_BSML. */
  v1: z.string().min(1),
  v2: z.string().optional(),
})
export type MushafLayoutBasmalah = z.infer<typeof mushafLayoutBasmalahSchema>

/** Type-size scale of a QCF encoding: line width in ems and centre threshold. */
export const mushafFitSchema = z.object({
  body: z.number(),
  centreBelow: z.number(),
})
export type MushafFit = z.infer<typeof mushafFitSchema>

export const mushafLayoutFileSchema = z.object({
  /** The basmalah band's glyph slots (identical on every page it appears). */
  basmalah: mushafLayoutBasmalahSchema,
  pages: z.record(z.string().regex(/^\d{1,3}$/), z.array(mushafLayoutItemSchema).min(1)),
  /** Scale metadata per encoding (v1 is the one the app draws). */
  fit: z
    .object({
      body: z.object({ v1: z.number(), v2: z.number() }),
      centreBelow: z.object({ v1: z.number(), v2: z.number() }),
    })
    .optional(),
  /** The page each of the 30 juz opens on (navigation + running head). */
  juzPages: z.array(pageNumberSchema).length(30).optional(),
})
export type MushafLayoutFile = z.infer<typeof mushafLayoutFileSchema>

/* ------------------------------------------------------------------ */
/* App-consumed data files (public/data/*.json)                        */
/* ------------------------------------------------------------------ */

/**
 * One typographic slot on a mushaf line: a word or printed mark of the
 * KFGQPC QCF v1 glyph set. Glyph codes are private-use codepoints that only
 * render with the page's own font.
 */
export const mushafWordSchema = z.object({
  /** QCF v1 glyph code string, exactly as printed (may contain U+0020). */
  g: z.string().min(1),
  /** Surah of the owning verse. */
  s: surahNumberSchema,
  /** Ayah of the owning verse. */
  a: z.number().int().min(1).max(286),
  /** True when the slot is the verse-end medallion. */
  e: z.boolean().optional(),
})
export type MushafWord = z.infer<typeof mushafWordSchema>

const lineSlotSchema = z.number().int().min(1).max(15)

/** A line of ayah words in mushaf reading order. */
export const mushafWordsLineSchema = z.object({
  kind: z.literal("words"),
  line: lineSlotSchema,
  words: z.array(mushafWordSchema).min(1),
})
export type MushafWordsLine = z.infer<typeof mushafWordsLineSchema>

/** A surah header band. */
export const mushafSurahLineSchema = z.object({
  kind: z.literal("surah"),
  line: lineSlotSchema,
  surah: surahNumberSchema,
})
export type MushafSurahLine = z.infer<typeof mushafSurahLineSchema>

/**
 * The basmalah line printed under a surah header. The band is the same
 * calligraphy on every page, taken verbatim from the layout file's
 * `basmalah.v1` and rendered with the QCF_BSML font.
 */
export const mushafBasmalahLineSchema = z.object({
  kind: z.literal("basmalah"),
  line: lineSlotSchema,
  /** Pipe-delimited QCF v1 slots of the band. */
  glyphs: z.string().min(1),
})
export type MushafBasmalahLine = z.infer<typeof mushafBasmalahLineSchema>

/**
 * One line slot of a mushaf page. The Madinah mushaf is a strict 15-line
 * grid: every line is ayah words, a surah header or a basmalah. Only the
 * front-matter pages 1 and 2 use fewer (8) lines.
 */
export const mushafLineSchema = z.discriminatedUnion("kind", [
  mushafWordsLineSchema,
  mushafSurahLineSchema,
  mushafBasmalahLineSchema,
])
export type MushafLine = z.infer<typeof mushafLineSchema>

/** One page chunk (public/data/pages/pNNN.json). */
export const pageChunkSchema = z.object({
  page: pageNumberSchema,
  /** The page's lines in mushaf order; `line` equals the array index + 1. */
  lines: z.array(mushafLineSchema).min(8).max(15),
})
export type PageChunk = z.infer<typeof pageChunkSchema>

/**
 * Reader-wide constants (public/data/meta.json): the page each juz opens on
 * and the QCF v1 type scale the whole mushaf is set at.
 */
export const mushafMetaSchema = z.object({
  juzPages: z.array(pageNumberSchema).length(30),
  fit: mushafFitSchema,
})
export type MushafMeta = z.infer<typeof mushafMetaSchema>

/** Full Quran metadata row (public/data/ayahs.json entries). */
export const ayahMetaSchema = z.object({
  surah: surahNumberSchema,
  ayah: z.number().int().min(1).max(286),
  /** Page where the ayah starts. */
  page: pageNumberSchema,
  juz: z.number().int().min(1).max(30),
  hizb: z.number().int().min(1).max(60),
  rubElHizb: z.number().int().min(1).max(240),
  ruku: z.number().int().min(1),
  manzil: z.number().int().min(1).max(7),
  /** null when the ayah has no sajdah. */
  sajdah: z.number().int().nullable(),
  /** Uthmani text for search, list view and copy actions. */
  text: z.string(),
})
export type AyahMeta = z.infer<typeof ayahMetaSchema>

/** Surah summary (public/data/surahs.json entries). */
export const surahSummarySchema = z.object({
  surah: surahNumberSchema,
  name: z.string().min(1),
  arabicName: z.string().min(1),
  transliteration: z.string().min(1),
  englishName: z.string().min(1),
  revelation: z.enum(["makkah", "madinah"]),
  revelationOrder: z.number().int().min(1).max(114),
  verseCount: z.number().int().min(3).max(286),
  bismillahPre: z.boolean(),
  firstPage: pageNumberSchema,
  lastPage: pageNumberSchema,
})
export type SurahSummary = z.infer<typeof surahSummarySchema>

export const surahsFileSchema = z.array(surahSummarySchema).length(114)
export const ayahsFileSchema = z.array(ayahMetaSchema).length(6236)

/**
 * The word index (public/data/word-index.json): each printed slot's 1-based
 * index within its verse and each verse's slot total, derived at build time
 * from the same page chunks. Word-granular selection resolves against it.
 */
export const wordIndexFileSchema = z.object({
  verseSlots: z.record(z.string().min(1), z.number().int().min(1)),
  slotIndex: z.record(z.string().min(1), z.number().int().min(1)),
})
export type WordIndexFile = z.infer<typeof wordIndexFileSchema>

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** "2:255" for a surah + ayah. */
export function verseKey(surah: number, ayah: number): VerseKey {
  return `${surah}:${ayah}` as VerseKey
}

/** Parses "2:255" into [surah, ayah]; null when malformed. */
export function parseVerseKey(key: string): [SurahNumber, number] | null {
  const match = /^(\d{1,3}):(\d{1,3})$/.exec(key)
  if (!match) return null
  const surah = Number(match[1])
  const ayah = Number(match[2])
  if (surah < 1 || surah > 114 || ayah < 1 || ayah > 286) return null
  return [surah as SurahNumber, ayah]
}

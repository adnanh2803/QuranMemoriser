import type { SurahSummary, VerseKey } from "../../../domain/schemas"
import type { SelectionRun } from "./selection.svelte"

export function wordRangeLabel(range: SelectionRun): string {
  const start = `${range.start.surah}:${range.start.ayah} word ${range.start.word}`
  const end = `${range.end.surah}:${range.end.ayah} word ${range.end.word}`
  return `${start}–${end}`
}

export function surahNameOf(surahs: readonly SurahSummary[], surah: number): string {
  return surahs.find((item) => item.surah === surah)?.name ?? `Surah ${surah}`
}

export function verseSurah(surahs: readonly SurahSummary[], key: VerseKey): string {
  const surah = Number.parseInt(key, 10)
  return Number.isNaN(surah) ? key : surahNameOf(surahs, surah)
}

export function wordRangeTitle(range: SelectionRun): string {
  const start = `${range.start.surah}:${range.start.ayah}`
  const end = `${range.end.surah}:${range.end.ayah}`
  const span = start === end ? start : `${start}–${end}`
  return `${span} · words ${range.start.word}–${range.end.word}`
}

export function wordRangeSurahs(surahs: readonly SurahSummary[], range: SelectionRun): string {
  const first = surahNameOf(surahs, range.start.surah)
  return range.start.surah === range.end.surah
    ? first
    : `${first} – ${surahNameOf(surahs, range.end.surah)}`
}

export function surahOfPage(surahs: readonly SurahSummary[], page: number): SurahSummary | null {
  return surahs.find((item) => page >= item.firstPage && page <= item.lastPage) ?? null
}

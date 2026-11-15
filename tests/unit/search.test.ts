import { afterEach, describe, expect, it, vi } from "vitest"
import type { AyahMeta } from "../../src/lib/domain/schemas"
import { MushafRepository } from "../../src/lib/features/mushaf/data/mushaf-repository"

afterEach(() => {
  vi.unstubAllGlobals()
})

function ayahRow(surah: number, ayah: number, text: string): AyahMeta {
  return {
    surah,
    ayah,
    page: 1,
    juz: 1,
    hizb: 1,
    rubElHizb: 1,
    ruku: 1,
    manzil: 1,
    sajdah: null,
    text,
  }
}

describe("MushafRepository.search", () => {
  it("matches Arabic query without diacritics and hamza carriers", async () => {
    const rows = Array.from({ length: 6236 }, (_, index) => ayahRow(1, (index % 286) + 1, "نص آخر"))
    rows[0] = ayahRow(2, 123, "يَسْـَٔلُونَكَ عَنِ الْخَمْرِ")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(rows))),
    )
    const repository = new MushafRepository()

    await expect(repository.search("يسألونك")).resolves.toHaveLength(1)
  })

  it("matches the dagger alif both dropped and expanded", async () => {
    // مَٰلِكِ is commonly spelled WITH the alif, الرَّحْمَٰنِ WITHOUT it; the
    // index must answer both readings.
    const rows = Array.from({ length: 6236 }, (_, index) => ayahRow(1, (index % 286) + 1, "نص آخر"))
    rows[0] = ayahRow(1, 4, "مَٰلِكِ يَوْمِ ٱلدِّينِ")
    rows[1] = ayahRow(1, 2, "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ")
    rows[2] = ayahRow(1, 1, "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(rows))),
    )
    const repository = new MushafRepository()

    // Expanded reading: the query keeps the alif of مالك.
    const maliki = await repository.search("مالك يوم الدين")
    expect(maliki.map((ayah) => `${ayah.surah}:${ayah.ayah}`)).toEqual(["1:4"])

    // Dropped reading: the query spells الرحمن without the alif.
    const rahmani = await repository.search("الرحمن")
    expect(rahmani.map((ayah) => `${ayah.surah}:${ayah.ayah}`)).toContain("1:1")

    // A query pasted straight from the Uthmani script (with dagger) still hits.
    const uthmani = await repository.search("مَٰلِكِ")
    expect(uthmani.map((ayah) => `${ayah.surah}:${ayah.ayah}`)).toEqual(["1:4"])
  })
})

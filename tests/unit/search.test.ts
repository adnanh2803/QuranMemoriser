import { afterEach, describe, expect, it, vi } from "vitest"
import { MushafRepository } from "../../src/lib/features/mushaf/data/mushaf-repository"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("MushafRepository.search", () => {
  it("matches Arabic query without diacritics and hamza carriers", async () => {
    const rows = Array.from({ length: 6236 }, (_, index) => ({
      surah: 1,
      ayah: 1,
      page: 1,
      juz: 1,
      hizb: 1,
      rubElHizb: 1,
      ruku: 1,
      manzil: 1,
      sajdah: null,
      text: index === 0 ? "يَسْـَٔلُونَكَ عَنِ الْخَمْرِ" : "نص آخر",
    }))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(rows))),
    )
    const repository = new MushafRepository()

    await expect(repository.search("يسألونك")).resolves.toHaveLength(1)
  })
})

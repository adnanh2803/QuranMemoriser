# QuranMemoriser

Offline-first Madani Mushaf reader with QCF v1 page-font rendering, verse
selection, search, surah/juz/page navigation, a virtualized ayah list, and
local bookmarks. The Mushaf view shows one page at a time with swipe-to-turn
navigation. Translation overlays and audio are not included in v1.

## Development

Requires Node.js and npm. Install dependencies, then fetch and build the Quran
data before starting Vite:

```sh
npm ci
npm run data:fetch
npm run data:build
npm run dev
```

The source cache is stored under `.cache/sources/`; generated `public/data/`
and `public/fonts/` are intentionally not committed. `data:fetch` verifies
cached files and reuses them when their pinned source and hash still match.

## Production build

```sh
npm run build
```

The `prebuild` hook fetches/verifies sources and generates the page chunks,
metadata, and fonts before Vite builds the app and service-worker precache.
The installed PWA precaches the Quran text, metadata, and all 604 page fonts.
The first visit/install must be online so the app and its precache can be
downloaded; subsequent reading and selection work offline.

## Checks

```sh
npm test
npm run check
npm run lint
```

Source URLs, pins, and validation rules are maintained in
`scripts/fetch-sources.ts` and `scripts/build-data.ts`.

## Audio word-timing attribution

Partial-word playback uses timing data from [quran-align](https://github.com/cpfair/quran-align),
by Collin Fair, release `2016-11-24`, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The bundled timings match 11 EveryAyah recordings: Alafasy, Al-Husary Murattal,
Al-Minshawi Murattal and Mujawwad, Abdul Basit Murattal and Mujawwad, Ash-Shaatree,
Hani Rifai, Al-Husary Muallim, Mohammad al-Tablaway, and ash-Shuraym. The pinned
archive's As-Sudais entry is invalid, so that reciter supports ayah playback only.
The archive also lacks usable word timings for one verse each in the Minshawi
Mujawwad and ash-Shuraym recordings; word-range playback reports those gaps rather
than guessing boundaries.

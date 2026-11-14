# QuranMemoriser

Offline-first Madani Mushaf reader with QCF v1 page-font rendering, verse
selection, search, surah/juz/page navigation, a virtualized ayah list, and
local bookmarks. Translation overlays and audio are not included in v1.

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

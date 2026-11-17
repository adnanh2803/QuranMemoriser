/// <reference lib="webworker" />

import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  type PrecacheEntry,
  type RuntimeCaching,
  Serwist,
  StaleWhileRevalidate,
} from "serwist"

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
}

// Runtime strategies for assets that may be added after the initial precache
// (e.g. when fonts/data are fetched per page instead of bundled).
const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: /\/fonts\/pages\/QCF_P\d{3}\.woff2$/,
    handler: new CacheFirst({ cacheName: "qm-mushaf-fonts" }),
  },
  {
    matcher: /\/data\/pages\/p\d{3}\.json$/,
    handler: new StaleWhileRevalidate({ cacheName: "qm-page-data" }),
  },
  {
    // The larger, non-default voice timing maps are cached when first used.
    matcher: /\/data\/audio-timings\/[a-z-]+\.json$/,
    handler: new CacheFirst({
      cacheName: "qm-word-timings",
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({ maxEntries: 16, purgeOnQuotaError: true }),
      ],
    }),
  },
  {
    // Recitation files stream in as they are played and stay for offline
    // replay, including complete multi-reciter surah downloads.
    matcher: /everyayah\.com\/data\/.+\.mp3$/,
    handler: new CacheFirst({
      cacheName: "qm-recitation",
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({
          maxEntries: 20000,
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },
]

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
})

serwist.addEventListeners()

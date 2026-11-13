/// <reference lib="webworker" />

import {
  CacheFirst,
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
]

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
})

serwist.addEventListeners()

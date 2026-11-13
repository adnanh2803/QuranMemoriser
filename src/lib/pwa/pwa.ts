import { getSerwist } from "virtual:serwist"

/**
 * Registers the Serwist service worker once the window has loaded.
 * Call only in production builds — the dev server serves assets directly.
 */
export function registerSerwist(): void {
  window.addEventListener("load", () => {
    void getSerwist().then((serwist) => serwist?.register())
  })
}

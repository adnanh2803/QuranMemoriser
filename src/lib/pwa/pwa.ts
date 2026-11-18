import { getSerwist } from "virtual:serwist"

/**
 * Registers the Serwist service worker once the window has loaded.
 * Call only in production builds — the dev server serves assets directly.
 * Browsers can block service workers (private browsing, embedded webviews),
 * so registration failures are non-fatal: the app still works online.
 */
export function registerSerwist(): void {
  if (!("serviceWorker" in navigator)) return
  window.addEventListener("load", () => {
    void getSerwist()
      .then((serwist) => serwist?.register())
      .catch((error: unknown) => {
        console.warn("Service worker registration failed", error)
      })
  })
}

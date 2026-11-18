import { getSerwist } from "virtual:serwist"
import { updateNotice } from "./update.svelte"

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
      .then((serwist) => {
        if (!serwist) return

        // `isUpdate` is false on the first install, so a brand-new reader does
        // not get an update banner while the initial offline copy downloads.
        serwist.addEventListener("installing", (event) => {
          if (event.isUpdate) updateNotice.downloading()
        })
        serwist.addEventListener("activated", (event) => {
          if (event.isUpdate) updateNotice.ready()
        })
        serwist.addEventListener("controlling", (event) => {
          if (event.isUpdate) updateNotice.ready()
        })
        serwist.addEventListener("redundant", (event) => {
          // A failed install leaves the old worker in charge. Do not leave a
          // permanent "downloading" notice; the next launch retries the update.
          if (event.isUpdate && updateNotice.phase === "downloading") updateNotice.dismiss()
        })

        return serwist.register()
      })
      .catch((error: unknown) => {
        console.warn("Service worker registration failed", error)
      })
  })
}

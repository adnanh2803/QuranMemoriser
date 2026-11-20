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
      .then(async (serwist) => {
        if (!serwist) return

        serwist.addEventListener("installing", (event) => {
          updateNotice.installing(event.isUpdate === true)
        })
        serwist.addEventListener("installed", (event) => {
          // A waiting worker on an update means the new version is ready to use
          // after reload (skipWaiting/clientsClaim may move it along quickly,
          // but show status if it waits).
          if (event.isUpdate && !navigator.serviceWorker.controller) {
            updateNotice.updateReady()
          }
        })
        serwist.addEventListener("waiting", (event) => {
          if (event.isUpdate) updateNotice.updateReady()
        })
        serwist.addEventListener("activated", (event) => {
          updateNotice.activated(event.isUpdate === true)
        })
        serwist.addEventListener("controlling", (event) => {
          if (event.isUpdate) updateNotice.updateReady()
        })
        serwist.addEventListener("redundant", (event) => {
          updateNotice.failed(event.isUpdate === true)
        })

        const registration = await serwist.register()
        if (!registration) return

        // If an update is already waiting or installing, surface it immediately.
        if (registration.waiting && navigator.serviceWorker.controller) {
          updateNotice.updateReady()
        } else if (registration.installing && navigator.serviceWorker.controller) {
          updateNotice.installing(true)
          trackInstalling(registration.installing, true)
        } else if (registration.installing && !navigator.serviceWorker.controller) {
          updateNotice.installing(false)
          trackInstalling(registration.installing, false)
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing
          if (!installing) return
          const isUpdate = Boolean(navigator.serviceWorker.controller)
          updateNotice.installing(isUpdate)
          trackInstalling(installing, isUpdate)
        })

        // Check for updates when the app is revisited.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            void registration.update().catch(() => {})
          }
        })
      })
      .catch((error: unknown) => {
        console.warn("Service worker registration failed", error)
      })
  })
}

function trackInstalling(worker: ServiceWorker, isUpdate: boolean): void {
  worker.addEventListener("statechange", () => {
    if (worker.state === "installed") {
      if (isUpdate && navigator.serviceWorker.controller) updateNotice.updateReady()
      else if (!isUpdate) updateNotice.activated(false)
    } else if (worker.state === "activated") {
      updateNotice.activated(isUpdate)
    } else if (worker.state === "redundant") {
      updateNotice.failed(isUpdate)
    }
  })
}

/**
 * The service worker downloads and activates builds in the background. The app
 * keeps running the old JavaScript until it reloads, so the reader needs a
 * quiet, visible status for offline preparation and new-version updates.
 */
export type UpdatePhase =
  | "idle"
  | "installing" // first install: precaching for offline use
  | "offline-ready" // first install finished
  | "downloading" // update: fetching a new version
  | "ready" // update installed and waiting for reload
  | "error"

export class UpdateNotice {
  phase = $state<UpdatePhase>("idle")
  detail = $state<string | null>(null)
  #offlineReadyTimer: ReturnType<typeof setTimeout> | null = null

  /** A service worker is installing (first install or update). */
  installing(isUpdate: boolean): void {
    this.#clearOfflineTimer()
    if (isUpdate) {
      // Don't downgrade a reload-ready notice while another install churns.
      if (this.phase === "ready") return
      this.phase = "downloading"
      this.detail = null
      return
    }
    // First install: show offline-prep status unless an update notice is active.
    if (this.phase === "downloading" || this.phase === "ready") return
    this.phase = "installing"
    this.detail = null
  }

  /** Installation finished. */
  activated(isUpdate: boolean): void {
    this.#clearOfflineTimer()
    if (isUpdate) {
      this.phase = "ready"
      this.detail = null
      return
    }
    if (this.phase === "downloading" || this.phase === "ready") return
    this.phase = "offline-ready"
    this.detail = null
    // A brief confirmation is enough; offline use continues silently.
    this.#offlineReadyTimer = setTimeout(() => {
      if (this.phase === "offline-ready") this.dismiss()
    }, 4500)
  }

  /** A new version controls this client; reload to run it. */
  updateReady(): void {
    this.#clearOfflineTimer()
    this.phase = "ready"
    this.detail = null
  }

  failed(isUpdate: boolean, message = "Could not finish downloading. It will retry later."): void {
    this.#clearOfflineTimer()
    if (isUpdate && this.phase !== "ready") {
      this.phase = "error"
      this.detail = message
      return
    }
    if (!isUpdate && this.phase === "installing") {
      this.phase = "error"
      this.detail = "Could not prepare offline access. It will retry when you're online."
    }
  }

  dismiss(): void {
    this.#clearOfflineTimer()
    this.phase = "idle"
    this.detail = null
  }

  #clearOfflineTimer(): void {
    if (this.#offlineReadyTimer) clearTimeout(this.#offlineReadyTimer)
    this.#offlineReadyTimer = null
  }
}

export const updateNotice = new UpdateNotice()

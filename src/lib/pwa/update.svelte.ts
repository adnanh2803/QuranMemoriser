/**
 * The service worker downloads and activates a new build in the background.
 * The app itself keeps running the old JavaScript until it reloads, so the
 * reader needs a quiet, visible status while that happens.
 */
export type UpdatePhase = "idle" | "downloading" | "ready"

export class UpdateNotice {
  phase = $state<UpdatePhase>("idle")

  /** A new service worker was found and is fetching its precache. */
  downloading(): void {
    if (this.phase === "ready") return
    this.phase = "downloading"
  }

  /** The new service worker is active; the next reload uses the new build. */
  ready(): void {
    this.phase = "ready"
  }

  dismiss(): void {
    this.phase = "idle"
  }
}

export const updateNotice = new UpdateNotice()

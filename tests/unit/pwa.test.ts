import { afterEach, describe, expect, it, vi } from "vitest"

import { UpdateNotice } from "../../src/lib/pwa/update.svelte"

afterEach(() => {
  vi.useRealTimers()
})

describe("update notice", () => {
  it("starts idle and reports a newly found update download", () => {
    const notice = new UpdateNotice()
    expect(notice.phase).toBe("idle")
    notice.installing(true)
    expect(notice.phase).toBe("downloading")
  })

  it("turns a finished update install into a reload prompt", () => {
    const notice = new UpdateNotice()
    notice.installing(true)
    notice.activated(true)
    expect(notice.phase).toBe("ready")
  })

  it("does not downgrade a ready update when another install starts", () => {
    const notice = new UpdateNotice()
    notice.updateReady()
    notice.installing(true)
    expect(notice.phase).toBe("ready")
  })

  it("can be dismissed after it becomes ready", () => {
    const notice = new UpdateNotice()
    notice.updateReady()
    notice.dismiss()
    expect(notice.phase).toBe("idle")
  })

  it("shows the ready prompt after a dismissed update download", () => {
    const notice = new UpdateNotice()
    notice.installing(true)
    notice.dismiss()
    notice.updateReady()
    expect(notice.phase).toBe("ready")
  })

  it("reports first-install offline preparation and confirms briefly when ready", () => {
    vi.useFakeTimers()
    const notice = new UpdateNotice()
    notice.installing(false)
    expect(notice.phase).toBe("installing")
    notice.activated(false)
    expect(notice.phase).toBe("offline-ready")
    vi.advanceTimersByTime(4500)
    expect(notice.phase).toBe("idle")
  })

  it("does not replace an update notice with first-install status", () => {
    const notice = new UpdateNotice()
    notice.installing(true)
    notice.installing(false)
    expect(notice.phase).toBe("downloading")
    notice.activated(false)
    expect(notice.phase).toBe("downloading")
  })

  it("reports install failures without hiding a ready update", () => {
    const notice = new UpdateNotice()
    notice.installing(false)
    notice.failed(false)
    expect(notice.phase).toBe("error")
    expect(notice.detail).toContain("offline")

    const ready = new UpdateNotice()
    ready.updateReady()
    ready.failed(true)
    expect(ready.phase).toBe("ready")
  })
})

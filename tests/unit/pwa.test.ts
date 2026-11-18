import { describe, expect, it } from "vitest"

import { UpdateNotice } from "../../src/lib/pwa/update.svelte"

describe("update notice", () => {
  it("starts idle and reports a newly found update", () => {
    const notice = new UpdateNotice()
    expect(notice.phase).toBe("idle")
    notice.downloading()
    expect(notice.phase).toBe("downloading")
  })

  it("turns a finished download into a reload prompt", () => {
    const notice = new UpdateNotice()
    notice.downloading()
    notice.ready()
    expect(notice.phase).toBe("ready")
  })

  it("does not downgrade a ready update when another install starts", () => {
    const notice = new UpdateNotice()
    notice.ready()
    notice.downloading()
    expect(notice.phase).toBe("ready")
  })

  it("can be dismissed after it becomes ready", () => {
    const notice = new UpdateNotice()
    notice.ready()
    notice.dismiss()
    expect(notice.phase).toBe("idle")
  })

  it("shows the ready prompt after a dismissed download", () => {
    const notice = new UpdateNotice()
    notice.downloading()
    notice.dismiss()
    notice.ready()
    expect(notice.phase).toBe("ready")
  })
})

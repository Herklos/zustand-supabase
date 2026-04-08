import { describe, it, expect } from "vitest"
import { isPending, getPendingStatus } from "./types"

describe("isPending", () => {
  it("returns false for a row with no pending mutation", () => {
    expect(isPending({ id: 1, name: "test" })).toBe(false)
  })

  it("returns false when _anchor_pending is undefined", () => {
    expect(isPending({ id: 1, _anchor_pending: undefined })).toBe(false)
  })

  it("returns true for insert", () => {
    expect(isPending({ id: 1, _anchor_pending: "insert" })).toBe(true)
  })

  it("returns true for update", () => {
    expect(isPending({ id: 1, _anchor_pending: "update" })).toBe(true)
  })

  it("returns true for delete", () => {
    expect(isPending({ id: 1, _anchor_pending: "delete" })).toBe(true)
  })
})

describe("getPendingStatus", () => {
  it("returns null for a row with no pending mutation", () => {
    expect(getPendingStatus({ id: 1, name: "test" })).toBeNull()
  })

  it("returns the pending status string", () => {
    expect(getPendingStatus({ id: 1, _anchor_pending: "insert" })).toBe("insert")
    expect(getPendingStatus({ id: 1, _anchor_pending: "update" })).toBe("update")
    expect(getPendingStatus({ id: 1, _anchor_pending: "delete" })).toBe("delete")
  })
})

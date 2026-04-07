import { describe, it, expect } from "vitest"
import { encodeKey, buildPkFilter, applyPkFilters, normalizePk } from "./compositeKey.js"

describe("encodeKey", () => {
  it("returns scalar value for single string PK", () => {
    expect(encodeKey({ id: 42, name: "test" }, "id")).toBe(42)
  })

  it("returns string value for single string PK", () => {
    expect(encodeKey({ id: "abc-123", name: "test" }, "id")).toBe("abc-123")
  })

  it("encodes composite key with :: separator", () => {
    expect(
      encodeKey({ user_id: "u1", post_id: "p1" }, ["user_id", "post_id"]),
    ).toBe("u1::p1")
  })

  it("handles numeric composite keys", () => {
    expect(encodeKey({ a: 1, b: 2 }, ["a", "b"])).toBe("1::2")
  })
})

describe("buildPkFilter", () => {
  it("builds single-key filter", () => {
    expect(buildPkFilter("id", 42)).toEqual({ id: 42 })
  })

  it("builds composite-key filter", () => {
    expect(buildPkFilter(["user_id", "post_id"], "u1::p1")).toEqual({
      user_id: "u1",
      post_id: "p1",
    })
  })
})

describe("applyPkFilters", () => {
  it("applies single eq for simple PK", () => {
    const calls: Array<{ col: string; val: unknown }> = []
    const builder = {
      eq(col: string, val: unknown) {
        calls.push({ col, val })
        return builder
      },
    }

    applyPkFilters(builder, "id", 42)
    expect(calls).toEqual([{ col: "id", val: 42 }])
  })

  it("applies multiple eq for composite PK", () => {
    const calls: Array<{ col: string; val: unknown }> = []
    const builder = {
      eq(col: string, val: unknown) {
        calls.push({ col, val })
        return builder
      },
    }

    applyPkFilters(builder, ["user_id", "post_id"], "u1::p1")
    expect(calls).toEqual([
      { col: "user_id", val: "u1" },
      { col: "post_id", val: "p1" },
    ])
  })
})

describe("normalizePk", () => {
  it("wraps string in array", () => {
    expect(normalizePk("id")).toEqual(["id"])
  })

  it("returns array as-is", () => {
    expect(normalizePk(["a", "b"])).toEqual(["a", "b"])
  })
})

import { describe, it, expect } from "vitest"
import { isRlsError } from "./authGate.js"

describe("isRlsError", () => {
  it("returns false for null", () => {
    expect(isRlsError(null)).toBe(false)
  })

  it("detects RLS policy violation", () => {
    expect(isRlsError(new Error("new row violates row-level security policy"))).toBe(true)
  })

  it("detects permission denied", () => {
    expect(isRlsError(new Error("permission denied for table users"))).toBe(true)
  })

  it("detects 42501 code", () => {
    expect(isRlsError(new Error("ERROR: 42501 insufficient_privilege"))).toBe(true)
  })

  it("returns false for unrelated errors", () => {
    expect(isRlsError(new Error("network timeout"))).toBe(false)
  })
})

import { describe, it, expect, vi } from "vitest"
import { isRlsError, setupAuthGate } from "./authGate.js"
import { createMockSupabase } from "../__tests__/mockSupabase.js"
import { createAuthStore } from "./authStore.js"
import type { StoreApi } from "zustand"
import type { TableStore } from "../types.js"

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

describe("setupAuthGate", () => {
  function createMockTableStore() {
    const store = {
      getState: vi.fn(() => ({
        clearAll: vi.fn(),
        fetch: vi.fn(() => Promise.resolve([])),
      })),
      setState: vi.fn(),
      subscribe: vi.fn(),
    }
    return store as unknown as StoreApi<TableStore<any, any, any>>
  }

  it("clears realtime on sign-out", async () => {
    const supabase = createMockSupabase()
    const authStore = createAuthStore({ supabase })
    const tableStore = createMockTableStore()
    const realtimeManager = { destroy: vi.fn() }

    setupAuthGate(supabase, authStore, [tableStore], {
      realtimeManager: realtimeManager as any,
    })

    await supabase.auth.signInWithPassword({ email: "a@b.com", password: "x" })
    await supabase.auth.signOut()

    expect(realtimeManager.destroy).toHaveBeenCalledTimes(1)
  })

  it("clears offline queue on sign-out", async () => {
    const supabase = createMockSupabase()
    const authStore = createAuthStore({ supabase })
    const tableStore = createMockTableStore()
    const offlineQueue = { clearQueue: vi.fn(() => Promise.resolve()) }

    setupAuthGate(supabase, authStore, [tableStore], {
      offlineQueue: offlineQueue as any,
    })

    await supabase.auth.signInWithPassword({ email: "a@b.com", password: "x" })
    await supabase.auth.signOut()

    expect(offlineQueue.clearQueue).toHaveBeenCalledTimes(1)
  })

  it("does not clear realtime/queue when clearOnSignOut is false", async () => {
    const supabase = createMockSupabase()
    const authStore = createAuthStore({ supabase })
    const tableStore = createMockTableStore()
    const realtimeManager = { destroy: vi.fn() }
    const offlineQueue = { clearQueue: vi.fn(() => Promise.resolve()) }

    setupAuthGate(supabase, authStore, [tableStore], {
      clearOnSignOut: false,
      realtimeManager: realtimeManager as any,
      offlineQueue: offlineQueue as any,
    })

    await supabase.auth.signInWithPassword({ email: "a@b.com", password: "x" })
    await supabase.auth.signOut()

    expect(realtimeManager.destroy).not.toHaveBeenCalled()
    expect(offlineQueue.clearQueue).not.toHaveBeenCalled()
  })

  it("handles clearQueue rejection gracefully", async () => {
    const supabase = createMockSupabase()
    const authStore = createAuthStore({ supabase })
    const tableStore = createMockTableStore()
    const offlineQueue = {
      clearQueue: vi.fn(() => Promise.reject(new Error("persistence error"))),
    }

    setupAuthGate(supabase, authStore, [tableStore], {
      offlineQueue: offlineQueue as any,
    })

    // Should not throw
    await supabase.auth.signInWithPassword({ email: "a@b.com", password: "x" })
    await supabase.auth.signOut()

    expect(offlineQueue.clearQueue).toHaveBeenCalledTimes(1)
  })
})

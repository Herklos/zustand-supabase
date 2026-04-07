import { describe, it, expect, beforeEach, vi } from "vitest"
import { setupAppLifecycle } from "./appLifecycle.js"
import type { AppLifecycleAdapter } from "../types.js"

function createMockLifecycleAdapter(): AppLifecycleAdapter & {
  triggerForeground: () => void
  triggerBackground: () => void
} {
  const foregroundCbs = new Set<() => void>()
  const backgroundCbs = new Set<() => void>()

  return {
    onForeground(cb) {
      foregroundCbs.add(cb)
      return () => foregroundCbs.delete(cb)
    },
    onBackground(cb) {
      backgroundCbs.add(cb)
      return () => backgroundCbs.delete(cb)
    },
    triggerForeground: () => {
      for (const cb of foregroundCbs) cb()
    },
    triggerBackground: () => {
      for (const cb of backgroundCbs) cb()
    },
  }
}

function createMockStore(overrides: Record<string, unknown> = {}) {
  return {
    getState: () => ({
      records: new Map(),
      order: [],
      isLoading: false,
      error: null,
      isHydrated: true,
      isRestoring: false,
      lastFetchedAt: null,
      realtimeStatus: "disconnected" as const,
      refetch: vi.fn().mockResolvedValue([]),
      ...overrides,
    }),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    getInitialState: vi.fn(),
  } as any
}

describe("setupAppLifecycle", () => {
  let adapter: ReturnType<typeof createMockLifecycleAdapter>

  beforeEach(() => {
    adapter = createMockLifecycleAdapter()
  })

  it("flushes queue on foreground", () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    setupAppLifecycle({
      adapter,
      queue: { flush },
    })

    adapter.triggerForeground()
    expect(flush).toHaveBeenCalledOnce()
  })

  it("refreshes auth session on foreground", () => {
    const refreshSession = vi.fn().mockResolvedValue(undefined)
    const authStore = {
      getState: () => ({ refreshSession }),
    } as any

    setupAppLifecycle({
      adapter,
      authStore,
    })

    adapter.triggerForeground()
    expect(refreshSession).toHaveBeenCalledOnce()
  })

  it("revalidates stale stores on foreground", () => {
    const refetch = vi.fn().mockResolvedValue([])
    // lastFetchedAt is old enough to be stale
    const store = createMockStore({
      lastFetchedAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
      refetch,
    })

    setupAppLifecycle({
      adapter,
      stores: [store],
      staleTTL: 5 * 60 * 1000,
    })

    adapter.triggerForeground()
    expect(refetch).toHaveBeenCalledOnce()
  })

  it("does not revalidate fresh stores", () => {
    const refetch = vi.fn().mockResolvedValue([])
    const store = createMockStore({
      lastFetchedAt: Date.now() - 1000, // 1 second ago
      refetch,
    })

    setupAppLifecycle({
      adapter,
      stores: [store],
      staleTTL: 5 * 60 * 1000,
    })

    adapter.triggerForeground()
    expect(refetch).not.toHaveBeenCalled()
  })

  it("skips operations when offline", () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    const network = {
      isOnline: () => false,
      subscribe: () => () => {},
    }

    setupAppLifecycle({
      adapter,
      queue: { flush },
      network,
    })

    adapter.triggerForeground()
    expect(flush).not.toHaveBeenCalled()
  })

  it("respects flushQueueOnForeground: false", () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    setupAppLifecycle({
      adapter,
      queue: { flush },
      flushQueueOnForeground: false,
    })

    adapter.triggerForeground()
    expect(flush).not.toHaveBeenCalled()
  })

  it("respects refreshAuthOnForeground: false", () => {
    const refreshSession = vi.fn().mockResolvedValue(undefined)
    const authStore = {
      getState: () => ({ refreshSession }),
    } as any

    setupAppLifecycle({
      adapter,
      authStore,
      refreshAuthOnForeground: false,
    })

    adapter.triggerForeground()
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it("cleanup unsubscribes all listeners", () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    const cleanup = setupAppLifecycle({
      adapter,
      queue: { flush },
    })

    cleanup()

    adapter.triggerForeground()
    expect(flush).not.toHaveBeenCalled()
  })

  it("handles errors in flush gracefully", () => {
    const flush = vi.fn().mockRejectedValue(new Error("flush failed"))
    setupAppLifecycle({
      adapter,
      queue: { flush },
    })

    // Should not throw
    expect(() => adapter.triggerForeground()).not.toThrow()
  })

  it("pauses realtime on background when configured", () => {
    const unsubscribe = vi.fn()
    const subscribe = vi.fn(() => () => {})
    const store = createMockStore({
      realtimeStatus: "connected" as const,
      unsubscribe,
      subscribe,
    })

    setupAppLifecycle({
      adapter,
      stores: [store],
      pauseRealtimeOnBackground: true,
    })

    adapter.triggerBackground()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it("resumes realtime on foreground after background pause", () => {
    const unsubscribe = vi.fn()
    const subscribe = vi.fn(() => () => {})
    const store = createMockStore({
      realtimeStatus: "disconnected" as const,
      unsubscribe,
      subscribe,
    })

    setupAppLifecycle({
      adapter,
      stores: [store],
      pauseRealtimeOnBackground: true,
    })

    // Foreground should call subscribe since status is disconnected
    adapter.triggerForeground()
    expect(subscribe).toHaveBeenCalledOnce()
  })

  it("does not pause realtime on background when not configured", () => {
    const unsubscribe = vi.fn()
    const store = createMockStore({
      realtimeStatus: "connected" as const,
      unsubscribe,
    })

    setupAppLifecycle({
      adapter,
      stores: [store],
      // pauseRealtimeOnBackground defaults to false
    })

    adapter.triggerBackground()
    expect(unsubscribe).not.toHaveBeenCalled()
  })
})

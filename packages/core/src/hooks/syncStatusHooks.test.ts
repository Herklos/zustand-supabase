import { describe, it, expect } from "vitest"
import { computeSyncStatus } from "./useSyncStatus.js"
import type { StoreApi } from "zustand"
import type { TableStore } from "../types.js"

function createMockStore(
  overrides: Record<string, unknown> = {},
): StoreApi<TableStore<any, any, any>> {
  const state = {
    records: new Map(),
    order: [],
    isLoading: false,
    error: null,
    isHydrated: true,
    isRestoring: false,
    lastFetchedAt: null,
    realtimeStatus: "disconnected" as const,
    getQueueSize: () => 0,
    ...overrides,
  }
  return {
    getState: () => state as any,
    setState: () => {},
    subscribe: (cb: () => void) => () => {},
    getInitialState: () => state as any,
  } as any
}

describe("computeSyncStatus", () => {
  it("returns synced with no stores", () => {
    const result = computeSyncStatus([])
    expect(result.status).toBe("synced")
    expect(result.pendingCount).toBe(0)
    expect(result.isSyncing).toBe(false)
    expect(result.lastSyncedAt).toBeNull()
    expect(result.failedCount).toBe(0)
  })

  it("returns syncing when a store is loading", () => {
    const store = createMockStore({ isLoading: true })
    const result = computeSyncStatus([store])
    expect(result.status).toBe("syncing")
    expect(result.isSyncing).toBe(true)
  })

  it("returns error when a store has an error", () => {
    const store = createMockStore({ error: new Error("fail") })
    const result = computeSyncStatus([store])
    expect(result.status).toBe("error")
    expect(result.failedCount).toBe(1)
  })

  it("counts pending rows across stores", () => {
    const records1 = new Map([
      [1, { id: 1, _zs_pending: "insert" }],
      [2, { id: 2 }],
    ])
    const records2 = new Map([
      [3, { id: 3, _zs_pending: "update" }],
      [4, { id: 4, _zs_pending: "delete" }],
    ])
    const store1 = createMockStore({ records: records1 })
    const store2 = createMockStore({ records: records2 })

    const result = computeSyncStatus([store1, store2])
    expect(result.pendingCount).toBe(3)
    expect(result.status).toBe("syncing")
  })

  it("returns offline when network is offline", () => {
    const store = createMockStore()
    const network = {
      isOnline: () => false,
      subscribe: () => () => {},
    }
    const result = computeSyncStatus([store], network)
    expect(result.status).toBe("offline")
  })

  it("picks the oldest lastFetchedAt", () => {
    const store1 = createMockStore({ lastFetchedAt: 1000 })
    const store2 = createMockStore({ lastFetchedAt: 2000 })
    const store3 = createMockStore({ lastFetchedAt: 500 })

    const result = computeSyncStatus([store1, store2, store3])
    expect(result.lastSyncedAt).toBe(500)
  })

  it("returns null lastSyncedAt when no stores have fetched", () => {
    const store = createMockStore({ lastFetchedAt: null })
    const result = computeSyncStatus([store])
    expect(result.lastSyncedAt).toBeNull()
  })

  it("error takes priority over offline", () => {
    const store = createMockStore({ error: new Error("fail") })
    const network = {
      isOnline: () => false,
      subscribe: () => () => {},
    }
    const result = computeSyncStatus([store], network)
    expect(result.status).toBe("error")
  })

  it("offline takes priority over syncing", () => {
    const store = createMockStore({ isLoading: true })
    const network = {
      isOnline: () => false,
      subscribe: () => () => {},
    }
    const result = computeSyncStatus([store], network)
    expect(result.status).toBe("offline")
  })

  it("aggregates multiple errors", () => {
    const store1 = createMockStore({ error: new Error("fail1") })
    const store2 = createMockStore({ error: new Error("fail2") })
    const store3 = createMockStore()

    const result = computeSyncStatus([store1, store2, store3])
    expect(result.failedCount).toBe(2)
  })
})

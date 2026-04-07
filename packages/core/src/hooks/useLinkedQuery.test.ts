import { describe, it, expect, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import type { StoreApi } from "zustand"
import type { TableStore } from "../types.js"

/**
 * Since we don't have @testing-library/react, we test the subscription
 * logic by verifying that store.subscribe is called and that record
 * changes are detectable via the pattern useLinkedQuery uses.
 */

function createMockTableStore(
  initialRecords: Map<string | number, any> = new Map(),
): StoreApi<TableStore<any, any, any>> {
  return createStore<any>()(() => ({
    records: initialRecords,
    order: [...initialRecords.keys()],
    isLoading: false,
    error: null,
    isHydrated: true,
    isRestoring: false,
    lastFetchedAt: null,
    realtimeStatus: "disconnected" as const,
    getQueueSize: () => 0,
    fetch: async () => [],
    fetchOne: async () => null,
    refetch: async () => [],
    insert: async () => ({}),
    insertMany: async () => [],
    update: async () => ({}),
    upsert: async () => ({}),
    remove: async () => {},
    removeWhere: async () => {},
    setRecord: () => {},
    removeRecord: () => {},
    clearAll: () => {},
    mergeRecords: () => {},
    subscribe: () => () => {},
    unsubscribe: () => {},
    hydrate: async () => {},
    persist: async () => {},
    flushQueue: async () => {},
  }))
}

describe("useLinkedQuery - store subscription pattern", () => {
  it("store subscription fires when records Map reference changes", () => {
    const store = createMockTableStore(
      new Map([[1, { id: 1, name: "Alice" }]]),
    )

    const callback = vi.fn()
    store.subscribe((state) => {
      callback(state.records)
    })

    // Simulate a mutation — creates a new Map reference (same pattern as createTableStore)
    const prev = store.getState().records
    const next = new Map(prev)
    next.set(2, { id: 2, name: "Bob" })
    store.setState({ records: next, order: [1, 2] })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).not.toBe(prev)
    expect(callback.mock.calls[0][0].size).toBe(2)
  })

  it("store subscription does not fire when records ref is the same", () => {
    const store = createMockTableStore(
      new Map([[1, { id: 1, name: "Alice" }]]),
    )

    const callback = vi.fn()
    let prevRecords = store.getState().records

    store.subscribe((state) => {
      if (state.records !== prevRecords) {
        prevRecords = state.records
        callback()
      }
    })

    // Changing non-records state should not trigger the callback
    store.setState({ isLoading: true })
    expect(callback).not.toHaveBeenCalled()
  })

  it("detects record changes across multiple stores", () => {
    const store1 = createMockTableStore(new Map([[1, { id: 1 }]]))
    const store2 = createMockTableStore(new Map([[10, { id: 10 }]]))

    const stores = [store1, store2]
    let version = 0

    const prevRecords = stores.map((s) => s.getState().records)

    const unsubs = stores.map((store, i) =>
      store.subscribe((state) => {
        if (state.records !== prevRecords[i]) {
          prevRecords[i] = state.records
          version++
        }
      }),
    )

    // Mutate store1
    const next1 = new Map(store1.getState().records)
    next1.set(2, { id: 2 })
    store1.setState({ records: next1 })
    expect(version).toBe(1)

    // Mutate store2
    const next2 = new Map(store2.getState().records)
    next2.delete(10)
    store2.setState({ records: next2 })
    expect(version).toBe(2)

    unsubs.forEach((u) => u())
  })

  it("unsubscribes cleanly on cleanup", () => {
    const store = createMockTableStore()

    const unsub = store.subscribe(() => {})
    // Should not throw
    unsub()
  })

  it("generation counter pattern discards stale results", async () => {
    let generationRef = 0
    const results: string[] = []

    // Simulate two concurrent fetches where the first resolves after the second
    const fetch1 = new Promise<string>((resolve) =>
      setTimeout(() => resolve("stale"), 20),
    )
    const fetch2 = new Promise<string>((resolve) =>
      setTimeout(() => resolve("fresh"), 5),
    )

    // Start fetch1
    const gen1 = ++generationRef
    fetch1.then((result) => {
      if (gen1 === generationRef) results.push(result)
    })

    // Start fetch2 (supersedes fetch1)
    const gen2 = ++generationRef
    fetch2.then((result) => {
      if (gen2 === generationRef) results.push(result)
    })

    await new Promise((r) => setTimeout(r, 50))

    // Only the fresh result should be recorded
    expect(results).toEqual(["fresh"])
  })
})

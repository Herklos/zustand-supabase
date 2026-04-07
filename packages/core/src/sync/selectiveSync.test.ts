import { describe, it, expect, vi } from "vitest"
import { syncAllByPriority } from "./selectiveSync.js"
import type { PrioritizedStore } from "./selectiveSync.js"

function createMockStore(name: string, fetchOrder: string[]) {
  const fetch = vi.fn().mockImplementation(async () => {
    fetchOrder.push(name)
    return []
  })
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
      fetch,
      refetch: fetch,
    }),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    getInitialState: vi.fn(),
  } as any
}

describe("syncAllByPriority", () => {
  it("fetches stores in priority order (lower = higher priority)", async () => {
    const fetchOrder: string[] = []
    const storeA = createMockStore("a", fetchOrder)
    const storeB = createMockStore("b", fetchOrder)
    const storeC = createMockStore("c", fetchOrder)

    const stores: PrioritizedStore[] = [
      { store: storeC, priority: 3 },
      { store: storeA, priority: 1 },
      { store: storeB, priority: 2 },
    ]

    await syncAllByPriority(stores)

    expect(fetchOrder).toEqual(["a", "b", "c"])
  })

  it("handles equal priorities", async () => {
    const fetchOrder: string[] = []
    const storeA = createMockStore("a", fetchOrder)
    const storeB = createMockStore("b", fetchOrder)

    const stores: PrioritizedStore[] = [
      { store: storeA, priority: 1 },
      { store: storeB, priority: 1 },
    ]

    await syncAllByPriority(stores)
    expect(fetchOrder).toHaveLength(2)
  })

  it("continues on fetch error", async () => {
    const fetchOrder: string[] = []
    const storeA = createMockStore("a", fetchOrder)
    const storeB = createMockStore("b", fetchOrder)

    // Make storeA's fetch fail
    storeA.getState().fetch.mockRejectedValueOnce(new Error("fail"))

    const stores: PrioritizedStore[] = [
      { store: storeA, priority: 1 },
      { store: storeB, priority: 2 },
    ]

    await syncAllByPriority(stores)
    // storeB should still be fetched even though storeA failed
    expect(fetchOrder).toContain("b")
  })

  it("handles empty store list", async () => {
    await expect(syncAllByPriority([])).resolves.toBeUndefined()
  })

  it("does not mutate the input array", async () => {
    const fetchOrder: string[] = []
    const stores: PrioritizedStore[] = [
      { store: createMockStore("c", fetchOrder), priority: 3 },
      { store: createMockStore("a", fetchOrder), priority: 1 },
    ]

    const original = [...stores]
    await syncAllByPriority(stores)

    expect(stores[0]!.priority).toBe(original[0]!.priority)
    expect(stores[1]!.priority).toBe(original[1]!.priority)
  })
})

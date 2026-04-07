import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createStore } from "zustand/vanilla"
import { setupBroadcastSync } from "./crossTabSync.js"

// Mock BroadcastChannel for Node.js test environment
class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []
  name: string
  onmessage: ((event: { data: any }) => void) | null = null

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }

  postMessage(data: any) {
    // Deliver to all OTHER instances with the same name
    for (const instance of MockBroadcastChannel.instances) {
      if (instance !== this && instance.name === this.name && instance.onmessage) {
        instance.onmessage({ data } as any)
      }
    }
  }

  close() {
    const idx = MockBroadcastChannel.instances.indexOf(this)
    if (idx >= 0) MockBroadcastChannel.instances.splice(idx, 1)
  }
}

// Install globally
;(globalThis as any).BroadcastChannel = MockBroadcastChannel

type TestState = {
  records: Map<string | number, unknown>
  order: (string | number)[]
  isRestoring: boolean
  isHydrated: boolean
}

function createTestStore(overrides: Partial<TestState> = {}) {
  return createStore<TestState>()(() => ({
    records: new Map(),
    order: [],
    isRestoring: false,
    isHydrated: true,
    ...overrides,
  }))
}

describe("crossTabSync", () => {
  beforeEach(() => {
    MockBroadcastChannel.instances = []
  })

  afterEach(() => {
    MockBroadcastChannel.instances = []
  })

  it("syncs state between two stores via BroadcastChannel", () => {
    const storeA = createTestStore()
    const storeB = createTestStore()

    const cleanupA = setupBroadcastSync(storeA, "test-channel")
    const cleanupB = setupBroadcastSync(storeB, "test-channel")

    // Mutate store A
    storeA.setState({
      records: new Map([[1, { id: 1, title: "Hello" }]]),
      order: [1],
    })

    // Store B should have received the update
    expect(storeB.getState().records.has(1)).toBe(true)
    expect(storeB.getState().order).toContain(1)

    cleanupA()
    cleanupB()
  })

  it("does not apply cross-tab data during hydration", () => {
    const storeA = createTestStore()
    const storeB = createTestStore({ isHydrated: false })

    const cleanupA = setupBroadcastSync(storeA, "test-hydration")
    const cleanupB = setupBroadcastSync(storeB, "test-hydration")

    // Mutate store A
    storeA.setState({
      records: new Map([[1, { id: 1, title: "Hello" }]]),
      order: [1],
    })

    // Store B should NOT receive (not yet hydrated)
    expect(storeB.getState().records.size).toBe(0)

    cleanupA()
    cleanupB()
  })

  it("ignores messages from different auth sessions", () => {
    const storeA = createTestStore()
    const storeB = createTestStore()

    const cleanupA = setupBroadcastSync(storeA, "test-auth", "user-1")
    const cleanupB = setupBroadcastSync(storeB, "test-auth", "user-2")

    // Mutate store A (user-1)
    storeA.setState({
      records: new Map([[1, { id: 1, title: "Private data" }]]),
      order: [1],
    })

    // Store B (user-2) should NOT receive user-1's data
    expect(storeB.getState().records.size).toBe(0)

    cleanupA()
    cleanupB()
  })

  it("preserves pending rows during cross-tab sync", () => {
    const storeA = createTestStore()
    const storeB = createTestStore()

    // Store B has a pending mutation
    storeB.setState({
      records: new Map([[99, { id: 99, title: "Pending", _zs_pending: "insert" }]]),
      order: [99],
    })

    const cleanupA = setupBroadcastSync(storeA, "test-pending")
    const cleanupB = setupBroadcastSync(storeB, "test-pending")

    // Store A broadcasts its state (doesn't include id=99)
    storeA.setState({
      records: new Map([[1, { id: 1, title: "From A" }]]),
      order: [1],
    })

    // Store B should have BOTH: incoming from A and preserved pending
    expect(storeB.getState().records.has(1)).toBe(true)
    expect(storeB.getState().records.has(99)).toBe(true)
    expect(storeB.getState().order).toContain(99)

    cleanupA()
    cleanupB()
  })
})

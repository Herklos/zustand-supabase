import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { setupMultiDeviceSync } from "./multiDeviceSync.js"

type BroadcastHandler = (payload: { payload: any }) => void

function createMockChannel() {
  const handlers = new Map<string, BroadcastHandler>()
  return {
    on(type: string, _filter: any, handler: BroadcastHandler) {
      handlers.set(type, handler)
      return this
    },
    subscribe: vi.fn(() => this),
    send: vi.fn(),
    _trigger(payload: any) {
      const handler = handlers.get("broadcast")
      if (handler) handler({ payload })
    },
  }
}

function createMockSupabase() {
  const channels = new Map<string, ReturnType<typeof createMockChannel>>()
  return {
    channel(name: string) {
      const ch = createMockChannel()
      channels.set(name, ch)
      return ch as any
    },
    removeChannel: vi.fn(),
    _getChannel(name: string) {
      return channels.get(name)
    },
  }
}

function createMockStore(initialRecords: [string | number, any][] = []) {
  const listeners = new Set<() => void>()
  let currentState: any = {
    records: new Map(initialRecords),
    order: initialRecords.map(([k]) => k),
    isLoading: false,
    error: null,
    isHydrated: true,
    isRestoring: false,
    lastFetchedAt: null,
    realtimeStatus: "disconnected" as const,
  }
  return {
    getState: () => currentState,
    setState: vi.fn((updater: any) => {
      if (typeof updater === "function") {
        currentState = updater(currentState)
      } else {
        currentState = { ...currentState, ...updater }
      }
      for (const cb of listeners) cb()
    }),
    subscribe: (cb: () => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getInitialState: () => currentState,
    _triggerChange() {
      for (const cb of listeners) cb()
    },
  } as any
}

describe("setupMultiDeviceSync", () => {
  let supabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    supabase = createMockSupabase()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("subscribes to a realtime broadcast channel", () => {
    const store = createMockStore()
    setupMultiDeviceSync(supabase as any, { todos: store })

    const channel = supabase._getChannel("zs:device-sync")
    expect(channel).toBeDefined()
    expect(channel!.subscribe).toHaveBeenCalled()
  })

  it("uses custom channel name", () => {
    const store = createMockStore()
    setupMultiDeviceSync(supabase as any, { todos: store }, {
      channelName: "custom-channel",
    })

    expect(supabase._getChannel("custom-channel")).toBeDefined()
  })

  it("merges incoming records from other devices", () => {
    const store = createMockStore([
      [1, { id: 1, title: "Local" }],
    ])
    setupMultiDeviceSync(supabase as any, { todos: store }, {
      deviceId: "device-a",
    })

    const channel = supabase._getChannel("zs:device-sync")!
    channel._trigger({
      deviceId: "device-b",
      table: "todos",
      records: [[2, { id: 2, title: "Remote" }]],
      order: [2],
      timestamp: Date.now(),
    })

    const state = store.getState()
    expect(state.records.get(2)).toEqual({ id: 2, title: "Remote" })
    expect(state.order).toContain(2)
  })

  it("ignores broadcasts from own device", () => {
    const store = createMockStore()
    setupMultiDeviceSync(supabase as any, { todos: store }, {
      deviceId: "device-a",
    })

    const channel = supabase._getChannel("zs:device-sync")!
    channel._trigger({
      deviceId: "device-a", // Same device
      table: "todos",
      records: [[1, { id: 1, title: "Self" }]],
      order: [1],
      timestamp: Date.now(),
    })

    expect(store.setState).not.toHaveBeenCalled()
  })

  it("protects pending mutations from being overwritten", () => {
    const store = createMockStore([
      [1, { id: 1, title: "Pending Edit", _zs_pending: "update" }],
    ])
    setupMultiDeviceSync(supabase as any, { todos: store }, {
      deviceId: "device-a",
    })

    const channel = supabase._getChannel("zs:device-sync")!
    channel._trigger({
      deviceId: "device-b",
      table: "todos",
      records: [[1, { id: 1, title: "Remote Override" }]],
      order: [1],
      timestamp: Date.now(),
    })

    const state = store.getState()
    expect(state.records.get(1).title).toBe("Pending Edit")
    expect(state.records.get(1)._zs_pending).toBe("update")
  })

  it("broadcasts store changes with debounce", () => {
    const store = createMockStore([[1, { id: 1, title: "Test" }]])
    setupMultiDeviceSync(supabase as any, { todos: store }, {
      deviceId: "device-a",
      debounceMs: 500,
    })

    // Simulate an actual record change (new object reference for the row)
    store.setState((prev: any) => {
      const records = new Map(prev.records)
      records.set(1, { id: 1, title: "Updated" })
      return { ...prev, records }
    })

    // Should not have sent yet (debounce)
    const channel = supabase._getChannel("zs:device-sync")!
    expect(channel.send).not.toHaveBeenCalled()

    // Advance past debounce
    vi.advanceTimersByTime(500)

    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "broadcast",
        event: "sync",
        payload: expect.objectContaining({
          deviceId: "device-a",
          table: "todos",
        }),
      }),
    )
  })

  it("ignores tables not in the sync list", () => {
    const todosStore = createMockStore()
    const profilesStore = createMockStore()

    setupMultiDeviceSync(
      supabase as any,
      { todos: todosStore, profiles: profilesStore },
      { deviceId: "device-a", tables: ["todos"] },
    )

    const channel = supabase._getChannel("zs:device-sync")!
    channel._trigger({
      deviceId: "device-b",
      table: "profiles",
      records: [[1, { id: 1 }]],
      order: [1],
      timestamp: Date.now(),
    })

    expect(profilesStore.setState).not.toHaveBeenCalled()
  })

  it("cleanup removes channel and clears timers", () => {
    const store = createMockStore()
    const cleanup = setupMultiDeviceSync(supabase as any, { todos: store }, {
      deviceId: "device-a",
    })

    // Trigger a change to set a timer
    store._triggerChange()

    cleanup()

    expect(supabase.removeChannel).toHaveBeenCalled()

    // Advance timers — no broadcast should fire
    const channel = supabase._getChannel("zs:device-sync")!
    vi.advanceTimersByTime(5000)
    expect(channel.send).not.toHaveBeenCalled()
  })
})

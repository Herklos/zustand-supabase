import { describe, it, expect, vi } from "vitest"
import { bindRealtimeToStore } from "./realtimeBindings.js"
import { RealtimeManager } from "./realtimeManager.js"
import { createTableStore } from "../createTableStore.js"
import { createMockSupabase } from "../__tests__/mockSupabase.js"

type Todo = { id: number; title: string; completed: boolean }

function createTestStore() {
  const supabase = createMockSupabase({})
  return createTableStore<any, Todo, any, any>({ supabase, table: "todos" })
}

function createTestManager() {
  const channels: any[] = []
  const supabase = {
    channel(name: string) {
      const listeners: any[] = []
      const ch = {
        on(_e: string, _f: any, cb: any) { listeners.push(cb); return ch },
        subscribe(cb?: any) { if (cb) cb("SUBSCRIBED"); return ch },
        _fire: (payload: any) => { for (const l of listeners) l(payload) },
      }
      channels.push(ch)
      return ch
    },
    removeChannel: vi.fn(),
    _channels: channels,
  } as any
  return { manager: new RealtimeManager({ supabase }), supabase }
}

describe("bindRealtimeToStore", () => {
  it("adds new records on INSERT events", () => {
    const store = createTestStore()
    const { manager, supabase } = createTestManager()

    bindRealtimeToStore(manager, store, { table: "todos", primaryKey: "id" })

    const channel = supabase._channels[0]
    channel._fire({ eventType: "INSERT", new: { id: 1, title: "New", completed: false }, old: {} })

    expect(store.getState().records.has(1)).toBe(true)
    expect(store.getState().records.get(1)?.title).toBe("New")
  })

  it("updates existing records on UPDATE events", () => {
    const store = createTestStore()
    store.getState().setRecord(1, { id: 1, title: "Old", completed: false })

    const { manager, supabase } = createTestManager()
    bindRealtimeToStore(manager, store, { table: "todos", primaryKey: "id" })

    const channel = supabase._channels[0]
    channel._fire({ eventType: "UPDATE", new: { id: 1, title: "Updated", completed: true }, old: {} })

    expect(store.getState().records.get(1)?.title).toBe("Updated")
  })

  it("removes records on DELETE events", () => {
    const store = createTestStore()
    store.getState().setRecord(1, { id: 1, title: "A", completed: false })

    const { manager, supabase } = createTestManager()
    bindRealtimeToStore(manager, store, { table: "todos", primaryKey: "id" })

    const channel = supabase._channels[0]
    channel._fire({ eventType: "DELETE", new: {}, old: { id: 1 } })

    expect(store.getState().records.has(1)).toBe(false)
  })

  it("does NOT overwrite pending INSERT on realtime INSERT", () => {
    const store = createTestStore()
    store.getState().setRecord(1, {
      id: 1, title: "Pending", completed: false,
      _anchor_pending: "insert",
    } as any)

    const { manager, supabase } = createTestManager()
    bindRealtimeToStore(manager, store, { table: "todos", primaryKey: "id" })

    const channel = supabase._channels[0]
    channel._fire({ eventType: "INSERT", new: { id: 1, title: "Remote", completed: true }, old: {} })

    // Pending record should NOT be overwritten
    expect(store.getState().records.get(1)?.title).toBe("Pending")
  })

  it("does NOT overwrite pending UPDATE on realtime UPDATE", () => {
    const store = createTestStore()
    store.getState().setRecord(1, {
      id: 1, title: "Pending update", completed: false,
      _anchor_pending: "update",
    } as any)

    const { manager, supabase } = createTestManager()
    bindRealtimeToStore(manager, store, { table: "todos", primaryKey: "id" })

    const channel = supabase._channels[0]
    channel._fire({ eventType: "UPDATE", new: { id: 1, title: "Remote", completed: true }, old: {} })

    expect(store.getState().records.get(1)?.title).toBe("Pending update")
  })

  it("does NOT delete pending record on realtime DELETE", () => {
    const store = createTestStore()
    store.getState().setRecord(1, {
      id: 1, title: "Pending", completed: false,
      _anchor_pending: "update",
    } as any)

    const { manager, supabase } = createTestManager()
    bindRealtimeToStore(manager, store, { table: "todos", primaryKey: "id" })

    const channel = supabase._channels[0]
    channel._fire({ eventType: "DELETE", new: {}, old: { id: 1 } })

    // Pending record should NOT be deleted
    expect(store.getState().records.has(1)).toBe(true)
  })

  it("returns cleanup function", () => {
    const store = createTestStore()
    const { manager, supabase } = createTestManager()

    const cleanup = bindRealtimeToStore(manager, store, { table: "todos", primaryKey: "id" })
    expect(typeof cleanup).toBe("function")

    cleanup()
    expect(supabase.removeChannel).toHaveBeenCalled()
  })
})

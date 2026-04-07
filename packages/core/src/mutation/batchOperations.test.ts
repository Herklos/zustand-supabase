import { describe, it, expect, vi } from "vitest"
import { updateMany, removeMany } from "./batchOperations.js"
import { createTableStore } from "../createTableStore.js"
import { createMockSupabase } from "../__tests__/mockSupabase.js"

type Todo = { id: number; title: string; completed: boolean; updated_at?: string }

describe("updateMany", () => {
  it("updates matching rows optimistically then confirms", async () => {
    const supabase = createMockSupabase({
      todos: [
        { id: 1, title: "A", completed: false },
        { id: 2, title: "B", completed: false },
        { id: 3, title: "C", completed: true },
      ],
    })

    const store = createTableStore<any, Todo, any, any>({ supabase, table: "todos" })
    await store.getState().fetch()

    const result = await updateMany(
      supabase,
      "todos",
      "id",
      store,
      [{ column: "completed", op: "eq", value: false }],
      { completed: true },
    )

    // Server updates matching rows (completed: false → true)
    // The mock updates rows in-place, so we verify the store state
    for (const row of result) {
      expect((row as any).completed).toBe(true)
    }
  })
})

describe("removeMany", () => {
  it("removes matching rows optimistically then confirms", async () => {
    const supabase = createMockSupabase({
      todos: [
        { id: 1, title: "A", completed: true },
        { id: 2, title: "B", completed: false },
        { id: 3, title: "C", completed: true },
      ],
    })

    const store = createTableStore<any, Todo, any, any>({ supabase, table: "todos" })
    await store.getState().fetch()

    expect(store.getState().records.size).toBe(3)

    await removeMany(
      supabase,
      "todos",
      "_pk",
      store,
      [{ column: "completed", op: "eq", value: true }],
    )

    // 2 completed rows removed, 1 remaining
    expect(store.getState().records.size).toBe(1)
  })

  it("rolls back on error", async () => {
    const supabase = createMockSupabase({
      todos: [{ id: 1, title: "A", completed: true }],
    })

    const store = createTableStore<any, Todo, any, any>({ supabase, table: "todos" })
    await store.getState().fetch()

    // Mock a failing delete
    const origFrom = supabase.from.bind(supabase)
    supabase.from = (table: string) => {
      const builder = origFrom(table)
      builder.delete = () => ({
        eq: () => ({ then: (r: any) => r({ error: { message: "Permission denied" } }) }),
        then: (r: any) => r({ error: { message: "Permission denied" } }),
      })
      return builder
    }

    await expect(
      removeMany(supabase, "todos", "id", store, [{ column: "completed", op: "eq", value: true }]),
    ).rejects.toThrow("Permission denied")

    // Rolled back — record should be restored
    expect(store.getState().records.size).toBe(1)
  })
})

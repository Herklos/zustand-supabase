import { describe, it, expect, vi } from "vitest"
import { executeRemoteMutation, createMutationExecutor } from "./mutationPipeline.js"
import { createTableStore } from "../createTableStore.js"
import { createMockSupabase } from "../__tests__/mockSupabase.js"

describe("executeRemoteMutation", () => {
  it("executes INSERT and returns server data with serverId", async () => {
    const supabase = createMockSupabase({ todos: [] })
    const result = await executeRemoteMutation(
      supabase,
      "todos",
      "id",
      {
        id: "m1",
        table: "todos",
        operation: "INSERT",
        payload: { title: "New todo" },
        primaryKey: { id: "_temp:abc" },
        createdAt: Date.now(),
        status: "in_flight",
        retryCount: 0,
        rollbackSnapshot: null,
      },
      new Map(),
    )

    expect(result.data).toBeDefined()
    expect(result.serverId).toBeDefined()
  })

  it("strips temp ID from INSERT payload", async () => {
    const supabase = createMockSupabase({ todos: [] })
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({
        single: () => ({
          then: (r: any) => r({ data: { id: 42, title: "A" }, error: null }),
        }),
      }),
    })

    // Override from to spy on insert
    supabase.from = () => ({ insert: insertSpy }) as any

    await executeRemoteMutation(
      supabase,
      "todos",
      "id",
      {
        id: "m1",
        table: "todos",
        operation: "INSERT",
        payload: { id: "_temp:xyz", title: "A" },
        primaryKey: { id: "_temp:xyz" },
        createdAt: Date.now(),
        status: "in_flight",
        retryCount: 0,
        rollbackSnapshot: null,
      },
      new Map(),
    )

    // The payload sent to insert should NOT have the temp id
    const insertedPayload = insertSpy.mock.calls[0][0]
    expect(insertedPayload.id).toBeUndefined()
    expect(insertedPayload.title).toBe("A")
  })

  it("executes UPDATE with correct primaryKey", async () => {
    const supabase = createMockSupabase({
      todos: [{ id: 1, title: "Old", completed: false }],
    })

    const result = await executeRemoteMutation(
      supabase,
      "todos",
      "id",
      {
        id: "m1",
        table: "todos",
        operation: "UPDATE",
        payload: { title: "Updated" },
        primaryKey: { id: 1 },
        createdAt: Date.now(),
        status: "in_flight",
        retryCount: 0,
        rollbackSnapshot: { id: 1, title: "Old" },
      },
      new Map(),
    )

    expect(result.data).toBeDefined()
    expect((result.data as any).title).toBe("Updated")
  })

  it("executes DELETE", async () => {
    const supabase = createMockSupabase({
      todos: [{ id: 1, title: "A" }],
    })

    const result = await executeRemoteMutation(
      supabase,
      "todos",
      "id",
      {
        id: "m1",
        table: "todos",
        operation: "DELETE",
        payload: null,
        primaryKey: { id: 1 },
        createdAt: Date.now(),
        status: "in_flight",
        retryCount: 0,
        rollbackSnapshot: { id: 1, title: "A" },
      },
      new Map(),
    )

    expect(result.data).toBeNull()
  })

  it("resolves temp IDs from tempIdMap", async () => {
    const supabase = createMockSupabase({
      todos: [{ id: 42, title: "Parent" }],
    })

    const tempIdMap = new Map<string, unknown>()
    tempIdMap.set("_temp:parent", 42)

    const result = await executeRemoteMutation(
      supabase,
      "todos",
      "id",
      {
        id: "m1",
        table: "todos",
        operation: "UPDATE",
        payload: { parentId: "_temp:parent", title: "Child" },
        primaryKey: { id: 42 },
        createdAt: Date.now(),
        status: "in_flight",
        retryCount: 0,
        rollbackSnapshot: null,
      },
      tempIdMap,
    )

    expect(result.data).toBeDefined()
  })

  it("throws on error", async () => {
    const supabase = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => ({
              then: (r: any) => r({ data: null, error: { message: "Insert failed" } }),
            }),
          }),
        }),
      }),
    } as any

    await expect(
      executeRemoteMutation(
        supabase, "todos", "id",
        { id: "m1", table: "todos", operation: "INSERT", payload: { title: "A" }, primaryKey: { id: 1 }, createdAt: 0, status: "in_flight", retryCount: 0, rollbackSnapshot: null },
        new Map(),
      ),
    ).rejects.toThrow("Insert failed")
  })
})

describe("createMutationExecutor", () => {
  it("creates an executor that updates store on success", async () => {
    const supabase = createMockSupabase({ todos: [] })
    const store = createTableStore<any, any, any, any>({ supabase, table: "todos" })

    const executor = createMutationExecutor(supabase, "todos", "id", store)

    const result = await executor(
      {
        id: "m1",
        table: "todos",
        operation: "INSERT",
        payload: { title: "Test" },
        primaryKey: { id: "_temp:test" },
        createdAt: Date.now(),
        status: "in_flight",
        retryCount: 0,
        rollbackSnapshot: null,
      },
      new Map(),
    )

    // Store should have the new record
    expect(store.getState().records.size).toBeGreaterThan(0)
  })
})

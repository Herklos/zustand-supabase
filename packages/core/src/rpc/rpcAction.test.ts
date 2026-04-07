import { describe, it, expect, vi } from "vitest"
import { callRpc, createRpcAction } from "./rpcAction.js"

function createMockSupabase(rpcResult: { data: any; error: any }) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as any
}

describe("callRpc", () => {
  it("calls supabase.rpc with function name and args", async () => {
    const supabase = createMockSupabase({
      data: { count: 42, avg: 3.5 },
      error: null,
    })

    const result = await callRpc<{ count: number; avg: number }>(
      supabase,
      "get_stats",
      { user_id: "123" },
    )

    expect(supabase.rpc).toHaveBeenCalledWith("get_stats", { user_id: "123" })
    expect(result.data).toEqual({ count: 42, avg: 3.5 })
    expect(result.error).toBeNull()
  })

  it("returns error on failure", async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: "Function not found" },
    })

    const result = await callRpc(supabase, "nonexistent")

    expect(result.data).toBeNull()
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error!.message).toBe("Function not found")
  })

  it("works without args", async () => {
    const supabase = createMockSupabase({
      data: [1, 2, 3],
      error: null,
    })

    const result = await callRpc(supabase, "get_all")

    expect(supabase.rpc).toHaveBeenCalledWith("get_all", undefined)
    expect(result.data).toEqual([1, 2, 3])
  })
})

describe("createRpcAction", () => {
  it("creates a reusable action function", async () => {
    const supabase = createMockSupabase({
      data: { total: 100 },
      error: null,
    })

    const getTotal = createRpcAction<{ total: number }>(supabase, "get_total")
    const result = await getTotal({ category: "books" })

    expect(supabase.rpc).toHaveBeenCalledWith("get_total", { category: "books" })
    expect(result.data).toEqual({ total: 100 })
  })

  it("can be called multiple times", async () => {
    const supabase = createMockSupabase({
      data: "ok",
      error: null,
    })

    const action = createRpcAction(supabase, "ping")
    await action()
    await action()

    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })
})

import { describe, it, expect, vi } from "vitest"
import { invokeEdgeFunction, createEdgeFunctionAction } from "./edgeFunctions.js"

function mockSupabase(result: { data: any; error: any }) {
  return {
    functions: {
      invoke: vi.fn().mockResolvedValue(result),
    },
  } as any
}

describe("invokeEdgeFunction", () => {
  it("invokes a function and returns data", async () => {
    const supabase = mockSupabase({ data: { sent: true }, error: null })
    const result = await invokeEdgeFunction<{ sent: boolean }>(
      supabase, "send-email", { body: { to: "a@b.com" } },
    )
    expect(result.data).toEqual({ sent: true })
    expect(result.error).toBeNull()
    expect(supabase.functions.invoke).toHaveBeenCalledWith("send-email", {
      body: { to: "a@b.com" },
      headers: undefined,
      method: undefined,
    })
  })

  it("returns error on failure", async () => {
    const supabase = mockSupabase({ data: null, error: { message: "Not found" } })
    const result = await invokeEdgeFunction(supabase, "missing-fn")
    expect(result.data).toBeNull()
    expect(result.error!.message).toBe("Not found")
  })

  it("catches thrown exceptions", async () => {
    const supabase = {
      functions: { invoke: vi.fn().mockRejectedValue(new Error("Network error")) },
    } as any
    const result = await invokeEdgeFunction(supabase, "fn")
    expect(result.error!.message).toBe("Network error")
  })
})

describe("createEdgeFunctionAction", () => {
  it("creates reusable action", async () => {
    const supabase = mockSupabase({ data: "ok", error: null })
    const action = createEdgeFunctionAction<string>(supabase, "ping")

    const r1 = await action()
    const r2 = await action({ body: { test: true } })

    expect(r1.data).toBe("ok")
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2)
  })
})

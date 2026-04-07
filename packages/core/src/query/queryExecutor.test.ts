import { describe, it, expect } from "vitest"
import { applyFilters, applySort } from "./queryExecutor.js"

describe("applyFilters", () => {
  it("applies eq filter to a mock builder", () => {
    const calls: Array<{ method: string; args: unknown[] }> = []
    const builder = new Proxy(
      {},
      {
        get(_target, prop) {
          return (...args: unknown[]) => {
            calls.push({ method: String(prop), args })
            return builder
          }
        },
      },
    )

    applyFilters(builder, [
      { column: "name", op: "eq", value: "alice" },
      { column: "age", op: "gt", value: 18 },
      { column: "status", op: "in", value: ["active", "pending"] },
    ])

    expect(calls).toHaveLength(3)
    expect(calls[0]).toEqual({ method: "eq", args: ["name", "alice"] })
    expect(calls[1]).toEqual({ method: "gt", args: ["age", 18] })
    expect(calls[2]).toEqual({ method: "in", args: ["status", ["active", "pending"]] })
  })

  it("applies textSearch with options", () => {
    const calls: Array<{ method: string; args: unknown[] }> = []
    const builder = new Proxy(
      {},
      {
        get(_target, prop) {
          return (...args: unknown[]) => {
            calls.push({ method: String(prop), args })
            return builder
          }
        },
      },
    )

    applyFilters(builder, [
      {
        column: "body",
        op: "textSearch",
        value: { query: "hello world", type: "websearch", config: "english" },
      },
    ])

    expect(calls).toHaveLength(1)
    expect(calls[0]!.method).toBe("textSearch")
    expect(calls[0]!.args[0]).toBe("body")
    expect(calls[0]!.args[1]).toBe("hello world")
  })

  it("handles all filter operators without error", () => {
    const builder = new Proxy(
      {},
      {
        get() {
          return (..._args: unknown[]) => builder
        },
      },
    )

    const operators = [
      "eq", "neq", "gt", "gte", "lt", "lte",
      "like", "ilike", "is", "in",
      "contains", "containedBy", "overlaps",
      "not", "or", "filter",
    ] as const

    for (const op of operators) {
      expect(() =>
        applyFilters(builder, [{ column: "col", op, value: "val" }]),
      ).not.toThrow()
    }
  })
})

describe("applySort", () => {
  it("applies sort rules to builder", () => {
    const calls: Array<{ method: string; args: unknown[] }> = []
    const builder = new Proxy(
      {},
      {
        get(_target, prop) {
          return (...args: unknown[]) => {
            calls.push({ method: String(prop), args })
            return builder
          }
        },
      },
    )

    applySort(builder, [
      { column: "created_at", ascending: false },
      { column: "name", ascending: true, nullsFirst: true },
    ])

    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual({
      method: "order",
      args: ["created_at", { ascending: false, nullsFirst: false }],
    })
    expect(calls[1]).toEqual({
      method: "order",
      args: ["name", { ascending: true, nullsFirst: true }],
    })
  })

  it("defaults to ascending with nullsFirst false", () => {
    const calls: Array<{ method: string; args: unknown[] }> = []
    const builder = new Proxy(
      {},
      {
        get(_target, prop) {
          return (...args: unknown[]) => {
            calls.push({ method: String(prop), args })
            return builder
          }
        },
      },
    )

    applySort(builder, [{ column: "id" }])

    expect(calls[0]).toEqual({
      method: "order",
      args: ["id", { ascending: true, nullsFirst: false }],
    })
  })
})

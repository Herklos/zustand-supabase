import { describe, it, expect } from "vitest"
import { buildCursorQuery, processCursorResults } from "./pagination.js"

type Todo = { id: number; title: string; created_at: string }

describe("buildCursorQuery", () => {
  it("builds forward query without cursor", () => {
    const result = buildCursorQuery<Todo>({
      cursorColumn: "created_at",
      pageSize: 10,
    })
    expect(result.filters).toEqual([])
    expect(result.sort).toEqual([{ column: "created_at", ascending: true }])
    expect(result.limit).toBe(11) // pageSize + 1 for hasNext detection
  })

  it("builds forward query with cursor", () => {
    const result = buildCursorQuery<Todo>({
      cursorColumn: "created_at",
      pageSize: 10,
      cursor: "2024-01-15",
    })
    expect(result.filters).toEqual([
      { column: "created_at", op: "gt", value: "2024-01-15" },
    ])
  })

  it("builds backward query with cursor", () => {
    const result = buildCursorQuery<Todo>({
      cursorColumn: "created_at",
      pageSize: 10,
      cursor: "2024-01-15",
      direction: "backward",
    })
    expect(result.filters).toEqual([
      { column: "created_at", op: "lt", value: "2024-01-15" },
    ])
    expect(result.sort![0]!.ascending).toBe(false)
  })
})

describe("processCursorResults", () => {
  it("detects hasNextPage when extra row exists", () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: i,
      title: `Todo ${i}`,
      created_at: `2024-01-${String(i + 1).padStart(2, "0")}`,
    }))

    const result = processCursorResults(rows, {
      cursorColumn: "created_at",
      pageSize: 10,
    })

    expect(result.data).toHaveLength(10)
    expect(result.pagination.hasNextPage).toBe(true)
    expect(result.pagination.cursor).toBe("2024-01-10")
  })

  it("detects no next page when exact rows", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      title: `Todo ${i}`,
      created_at: `2024-01-${String(i + 1).padStart(2, "0")}`,
    }))

    const result = processCursorResults(rows, {
      cursorColumn: "created_at",
      pageSize: 10,
    })

    expect(result.data).toHaveLength(5)
    expect(result.pagination.hasNextPage).toBe(false)
  })

  it("hasPreviousPage when cursor is set", () => {
    const result = processCursorResults(
      [{ id: 1, title: "A", created_at: "2024-01-01" }],
      { cursorColumn: "created_at", pageSize: 10, cursor: "2024-01-01" },
    )
    expect(result.pagination.hasPreviousPage).toBe(true)
  })

  it("no previousPage on first page", () => {
    const result = processCursorResults(
      [{ id: 1, title: "A", created_at: "2024-01-01" }],
      { cursorColumn: "created_at", pageSize: 10 },
    )
    expect(result.pagination.hasPreviousPage).toBe(false)
  })
})

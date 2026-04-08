import { describe, it, expect } from "vitest"
import { aggregateLocal } from "./aggregation.js"

describe("aggregateLocal", () => {
  const records = [
    { id: 1, price: 10, name: "A" },
    { id: 2, price: 20, name: "B" },
    { id: 3, price: 30, name: "C" },
  ]

  it("computes sum", () => {
    expect(aggregateLocal(records, "price", "sum")).toBe(60)
  })

  it("computes avg", () => {
    expect(aggregateLocal(records, "price", "avg")).toBe(20)
  })

  it("computes min", () => {
    expect(aggregateLocal(records, "price", "min")).toBe(10)
  })

  it("computes max", () => {
    expect(aggregateLocal(records, "price", "max")).toBe(30)
  })

  it("computes count", () => {
    expect(aggregateLocal(records, "price", "count")).toBe(3)
  })

  it("returns 0 count for empty array", () => {
    expect(aggregateLocal([], "price", "count")).toBe(0)
  })

  it("returns null for empty array with non-count fn", () => {
    expect(aggregateLocal([], "price", "sum")).toBeNull()
  })

  it("skips non-numeric values", () => {
    const mixed = [
      { id: 1, val: 10 },
      { id: 2, val: "hello" as any },
      { id: 3, val: 30 },
    ]
    expect(aggregateLocal(mixed, "val", "sum")).toBe(40)
  })

  it("returns null when all values are non-numeric", () => {
    const strings = [
      { id: 1, val: "a" as any },
      { id: 2, val: "b" as any },
    ]
    expect(aggregateLocal(strings, "val", "sum")).toBeNull()
  })
})

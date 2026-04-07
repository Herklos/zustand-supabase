import { describe, it, expect, vi } from "vitest"
import { OfflineQueue } from "./offlineQueue.js"
import type { QueuedMutation } from "../types.js"

function createMutation(
  overrides: Partial<QueuedMutation> = {},
): QueuedMutation {
  return {
    id: crypto.randomUUID(),
    table: "todos",
    operation: "INSERT",
    payload: { title: "Test" },
    primaryKey: { id: 1 },
    createdAt: Date.now(),
    status: "pending",
    retryCount: 0,
    rollbackSnapshot: null,
    ...overrides,
  }
}

describe("OfflineQueue dependsOn enforcement", () => {
  it("skips mutation when dependency has not succeeded", async () => {
    const queue = new OfflineQueue()
    const executor = vi.fn().mockResolvedValue({})
    queue.registerExecutor("todos", executor)

    const parentId = "parent-1"
    const childId = "child-1"

    // Parent mutation fails
    const failingExecutor = vi.fn().mockRejectedValue(new Error("fail"))
    queue.registerExecutor("todos", failingExecutor)

    await queue.enqueue(createMutation({
      id: parentId,
      operation: "INSERT",
      payload: { title: "Parent" },
    }))

    await queue.enqueue(createMutation({
      id: childId,
      operation: "INSERT",
      payload: { parentId: "temp-id" },
      dependsOn: parentId,
    }))

    const result = await queue.flush()

    // Parent failed (not rolled back, retryCount < maxRetries)
    expect(result.failed).toContain(parentId)
    // Child was skipped (not in succeeded, failed, or rolledBack)
    expect(result.succeeded).not.toContain(childId)
    expect(result.failed).not.toContain(childId)

    // Child is still pending for next flush
    expect(queue.pendingCount).toBe(2)
  })

  it("executes mutation when dependency has succeeded", async () => {
    const queue = new OfflineQueue()
    const executor = vi.fn().mockResolvedValue({ serverId: 42 })
    queue.registerExecutor("todos", executor)

    const parentId = "parent-2"
    const childId = "child-2"

    await queue.enqueue(createMutation({
      id: parentId,
      operation: "INSERT",
      payload: { title: "Parent" },
      primaryKey: { id: "_temp:abc" },
    }))

    await queue.enqueue(createMutation({
      id: childId,
      operation: "INSERT",
      payload: { title: "Child" },
      dependsOn: parentId,
    }))

    const result = await queue.flush()

    // Both should succeed
    expect(result.succeeded).toContain(parentId)
    expect(result.succeeded).toContain(childId)
    expect(executor).toHaveBeenCalledTimes(2)
  })

  it("cascades rollback when dependency is rolled back", async () => {
    const onRollback = vi.fn()
    const queue = new OfflineQueue({ maxRetries: 0, onRollback })

    const failingExecutor = vi.fn().mockRejectedValue(new Error("permanent"))
    queue.registerExecutor("todos", failingExecutor)

    const parentId = "parent-3"
    const childId = "child-3"

    await queue.enqueue(createMutation({
      id: parentId,
      operation: "INSERT",
      payload: { title: "Parent" },
    }))

    await queue.enqueue(createMutation({
      id: childId,
      operation: "INSERT",
      payload: { title: "Child" },
      dependsOn: parentId,
    }))

    const result = await queue.flush()

    // Parent rolled back
    expect(result.rolledBack).toContain(parentId)
    // Child cascaded rollback
    expect(result.rolledBack).toContain(childId)
    expect(onRollback).toHaveBeenCalledTimes(2)

    // Both removed from queue
    expect(queue.pendingCount).toBe(0)
  })
})

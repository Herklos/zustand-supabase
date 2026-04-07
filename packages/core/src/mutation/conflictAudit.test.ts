import { describe, it, expect, beforeEach, vi } from "vitest"
import { ConflictAuditLog } from "./conflictAudit.js"
import { resolveConflict } from "./conflictResolution.js"
import type { ConflictConfig, ConflictContext, TrackedRow } from "../types.js"

describe("ConflictAuditLog", () => {
  let auditLog: ConflictAuditLog

  beforeEach(() => {
    auditLog = new ConflictAuditLog()
  })

  it("record() adds entry with auto-timestamp", () => {
    const before = Date.now()
    auditLog.record({
      table: "todos",
      rowId: 1,
      strategy: "server-wins",
      localValue: { id: 1, title: "local" },
      remoteValue: { id: 1, title: "remote" },
      resolvedValue: { id: 1, title: "remote" },
    })
    const after = Date.now()

    const log = auditLog.getLog()
    expect(log).toHaveLength(1)
    expect(log[0].timestamp).toBeGreaterThanOrEqual(before)
    expect(log[0].timestamp).toBeLessThanOrEqual(after)
    expect(log[0].table).toBe("todos")
    expect(log[0].rowId).toBe(1)
  })

  it("getLog() returns all entries", () => {
    auditLog.record({
      table: "todos",
      rowId: 1,
      strategy: "server-wins",
      localValue: { id: 1 },
      remoteValue: { id: 1 },
      resolvedValue: { id: 1 },
    })
    auditLog.record({
      table: "users",
      rowId: 2,
      strategy: "client-wins",
      localValue: { id: 2 },
      remoteValue: { id: 2 },
      resolvedValue: { id: 2 },
    })

    const log = auditLog.getLog()
    expect(log).toHaveLength(2)
  })

  it("getLog() returns a copy, not the internal array", () => {
    auditLog.record({
      table: "todos",
      rowId: 1,
      strategy: "server-wins",
      localValue: {},
      remoteValue: {},
      resolvedValue: {},
    })

    const log1 = auditLog.getLog()
    const log2 = auditLog.getLog()
    expect(log1).not.toBe(log2)
    expect(log1).toEqual(log2)
  })

  it("getLog({ table }) filters by table", () => {
    auditLog.record({
      table: "todos",
      rowId: 1,
      strategy: "server-wins",
      localValue: {},
      remoteValue: {},
      resolvedValue: {},
    })
    auditLog.record({
      table: "users",
      rowId: 2,
      strategy: "server-wins",
      localValue: {},
      remoteValue: {},
      resolvedValue: {},
    })
    auditLog.record({
      table: "todos",
      rowId: 3,
      strategy: "client-wins",
      localValue: {},
      remoteValue: {},
      resolvedValue: {},
    })

    const todosLog = auditLog.getLog({ table: "todos" })
    expect(todosLog).toHaveLength(2)
    expect(todosLog.every((e) => e.table === "todos")).toBe(true)
  })

  it("getLog({ since }) filters by timestamp", () => {
    auditLog.record({
      table: "todos",
      rowId: 1,
      strategy: "server-wins",
      localValue: {},
      remoteValue: {},
      resolvedValue: {},
    })

    const midpoint = Date.now() + 1

    auditLog.record({
      table: "todos",
      rowId: 2,
      strategy: "server-wins",
      localValue: {},
      remoteValue: {},
      resolvedValue: {},
    })

    // The second entry may have the same timestamp as midpoint,
    // so we use a future time to verify filtering works
    const futureLog = auditLog.getLog({ since: midpoint + 10000 })
    expect(futureLog).toHaveLength(0)

    const allLog = auditLog.getLog({ since: 0 })
    expect(allLog).toHaveLength(2)
  })

  it("clearLog() empties the log", () => {
    auditLog.record({
      table: "todos",
      rowId: 1,
      strategy: "server-wins",
      localValue: {},
      remoteValue: {},
      resolvedValue: {},
    })
    auditLog.record({
      table: "todos",
      rowId: 2,
      strategy: "server-wins",
      localValue: {},
      remoteValue: {},
      resolvedValue: {},
    })

    expect(auditLog.getLog()).toHaveLength(2)
    auditLog.clearLog()
    expect(auditLog.getLog()).toHaveLength(0)
  })

  it("onConflict callback fires on record", () => {
    const cb = vi.fn()
    auditLog.onConflict(cb)

    auditLog.record({
      table: "todos",
      rowId: 1,
      strategy: "server-wins",
      localValue: { id: 1 },
      remoteValue: { id: 1 },
      resolvedValue: { id: 1 },
    })

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        table: "todos",
        rowId: 1,
        strategy: "server-wins",
        timestamp: expect.any(Number),
      }),
    )
  })

  it("multiple subscribers receive events", () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    auditLog.onConflict(cb1)
    auditLog.onConflict(cb2)

    auditLog.record({
      table: "todos",
      rowId: 1,
      strategy: "server-wins",
      localValue: {},
      remoteValue: {},
      resolvedValue: {},
    })

    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it("unsubscribe stops callbacks", () => {
    const cb = vi.fn()
    const unsub = auditLog.onConflict(cb)

    auditLog.record({
      table: "todos",
      rowId: 1,
      strategy: "server-wins",
      localValue: {},
      remoteValue: {},
      resolvedValue: {},
    })
    expect(cb).toHaveBeenCalledTimes(1)

    unsub()

    auditLog.record({
      table: "todos",
      rowId: 2,
      strategy: "server-wins",
      localValue: {},
      remoteValue: {},
      resolvedValue: {},
    })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it("integration: resolveConflict with auditLog logs the conflict", () => {
    type Row = { id: number; title: string }

    const local: TrackedRow<Row> = {
      id: 1,
      title: "local title",
      _zs_pending: "update",
      _zs_optimistic: true,
      _zs_mutationId: "mut-1",
    }
    const remote: Row = { id: 1, title: "remote title" }
    const config: ConflictConfig<Row> = { strategy: "server-wins" }
    const context: ConflictContext = {
      table: "todos",
      primaryKey: { id: 1 },
      hasPendingMutations: true,
      pendingMutations: [],
    }

    const result = resolveConflict(local, remote, config, context, auditLog)

    expect(result).toEqual({ id: 1, title: "remote title" })

    const log = auditLog.getLog()
    expect(log).toHaveLength(1)
    expect(log[0].table).toBe("todos")
    expect(log[0].rowId).toBe(1)
    expect(log[0].strategy).toBe("server-wins")
    expect(log[0].localValue).toEqual(local)
    expect(log[0].remoteValue).toEqual(remote)
    expect(log[0].resolvedValue).toEqual({ id: 1, title: "remote title" })
  })

  it("integration: resolveConflict without auditLog does not throw", () => {
    type Row = { id: number; title: string }

    const local: TrackedRow<Row> = { id: 1, title: "local" }
    const remote: Row = { id: 1, title: "remote" }
    const config: ConflictConfig<Row> = { strategy: "client-wins" }
    const context: ConflictContext = {
      table: "todos",
      primaryKey: { id: 1 },
      hasPendingMutations: false,
      pendingMutations: [],
    }

    const result = resolveConflict(local, remote, config, context)
    expect(result).toEqual({ id: 1, title: "local" })
    expect(auditLog.getLog()).toHaveLength(0)
  })
})

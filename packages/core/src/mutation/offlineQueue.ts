import type {
  QueuedMutation,
  MutationId,
  PersistenceAdapter,
  NetworkStatusAdapter,
  SyncLogger,
} from "../types.js"
import { noopLogger } from "../types.js"

export type FlushResult = {
  succeeded: MutationId[]
  failed: MutationId[]
  rolledBack: MutationId[]
  complete: boolean
}

export type MutationExecutor = (
  mutation: QueuedMutation,
  tempIdMap: Map<string, unknown>,
) => Promise<{ serverId?: unknown }>

type OfflineQueueOptions = {
  adapter?: PersistenceAdapter
  network?: NetworkStatusAdapter
  maxRetries?: number
  flushDebounceMs?: number
  logger?: SyncLogger
  onRollback?: (mutation: QueuedMutation) => void
  onTempIdResolved?: (
    tempId: string,
    realId: unknown,
    table: string,
  ) => void
}

const QUEUE_KEY = "zs:__mutation_queue"

/**
 * Persistent FIFO mutation queue with coalescing, retry, and auto-flush.
 */
export class OfflineQueue {
  private queue: QueuedMutation[] = []
  private executors = new Map<string, MutationExecutor>()
  private flushing = false
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private unsubNetwork: (() => void) | null = null

  private readonly adapter?: PersistenceAdapter
  private readonly network?: NetworkStatusAdapter
  private readonly maxRetries: number
  private readonly flushDebounceMs: number
  private readonly logger: SyncLogger
  private readonly onRollback?: (mutation: QueuedMutation) => void
  private readonly onTempIdResolved?: (
    tempId: string,
    realId: unknown,
    table: string,
  ) => void

  constructor(options: OfflineQueueOptions = {}) {
    this.adapter = options.adapter
    this.network = options.network
    this.maxRetries = options.maxRetries ?? 3
    this.flushDebounceMs = options.flushDebounceMs ?? 2000
    this.logger = options.logger ?? noopLogger
    this.onRollback = options.onRollback
    this.onTempIdResolved = options.onTempIdResolved
  }

  // ── Registration ─────────────────────────────────────────────────

  registerExecutor(table: string, executor: MutationExecutor): void {
    this.executors.set(table, executor)
  }

  // ── Hydration ────────────────────────────────────────────────────

  async hydrate(): Promise<void> {
    if (!this.adapter) return
    const data = await this.adapter.getItem<QueuedMutation[]>(QUEUE_KEY)
    if (data && Array.isArray(data)) {
      this.queue = data.filter(
        (m) => m.status === "pending" || m.status === "failed",
      )
    }
  }

  // ── Enqueue ──────────────────────────────────────────────────────

  async enqueue(mutation: QueuedMutation): Promise<void> {
    this.queue.push(mutation)
    await this.persist()
    this.scheduleFlush()
  }

  // ── Coalescing ───────────────────────────────────────────────────

  compact(): void {
    const compacted: QueuedMutation[] = []
    const seen = new Map<string, number>() // row key → index in compacted

    for (const mutation of this.queue) {
      if (mutation.status !== "pending") {
        compacted.push(mutation)
        continue
      }

      const rowKey = `${mutation.table}:${JSON.stringify(mutation.primaryKey)}`
      const existingIdx = seen.get(rowKey)

      if (existingIdx == null) {
        seen.set(rowKey, compacted.length)
        compacted.push(mutation)
        continue
      }

      const existing = compacted[existingIdx]!

      // INSERT + UPDATE → single INSERT with merged payload
      if (
        existing.operation === "INSERT" &&
        mutation.operation === "UPDATE"
      ) {
        existing.payload = { ...existing.payload, ...mutation.payload }
        continue
      }

      // INSERT + DELETE → remove both
      if (
        existing.operation === "INSERT" &&
        mutation.operation === "DELETE"
      ) {
        compacted.splice(existingIdx, 1)
        // Fix indices in seen map
        for (const [key, idx] of seen) {
          if (idx > existingIdx) seen.set(key, idx - 1)
        }
        seen.delete(rowKey)
        continue
      }

      // UPDATE + UPDATE → single UPDATE with merged payload
      if (
        existing.operation === "UPDATE" &&
        mutation.operation === "UPDATE"
      ) {
        existing.payload = { ...existing.payload, ...mutation.payload }
        continue
      }

      // UPDATE + DELETE → single DELETE
      if (
        existing.operation === "UPDATE" &&
        mutation.operation === "DELETE"
      ) {
        compacted[existingIdx] = {
          ...mutation,
          rollbackSnapshot: existing.rollbackSnapshot,
        }
        continue
      }

      // Default: keep both
      seen.set(rowKey, compacted.length)
      compacted.push(mutation)
    }

    this.queue = compacted
  }

  // ── Flush ────────────────────────────────────────────────────────

  async flush(): Promise<FlushResult> {
    if (this.flushing) {
      return { succeeded: [], failed: [], rolledBack: [], complete: false }
    }

    if (this.network && !this.network.isOnline()) {
      return { succeeded: [], failed: [], rolledBack: [], complete: false }
    }

    this.flushing = true

    try {
      this.compact()

      const pending = this.queue.filter(
        (m) => m.status === "pending" || m.status === "failed",
      )

      if (pending.length === 0) {
        return { succeeded: [], failed: [], rolledBack: [], complete: true }
      }

      this.logger.queueFlushStart(pending.length)

      const result: FlushResult = {
        succeeded: [],
        failed: [],
        rolledBack: [],
        complete: false,
      }

      const tempIdMap = new Map<string, unknown>()
      const succeededIds = new Set<MutationId>()
      const rolledBackIds = new Set<MutationId>()

      for (const mutation of pending) {
        // Enforce dependsOn: skip if dependency hasn't succeeded yet
        if (mutation.dependsOn) {
          if (rolledBackIds.has(mutation.dependsOn)) {
            // Dependency was rolled back — cascade rollback
            mutation.status = "rolled_back"
            mutation.lastError = `Dependency ${mutation.dependsOn} was rolled back`
            result.rolledBack.push(mutation.id)
            rolledBackIds.add(mutation.id)
            this.onRollback?.(mutation)
            continue
          }
          if (!succeededIds.has(mutation.dependsOn)) {
            // Dependency hasn't succeeded in this flush — skip for next flush
            continue
          }
        }

        const executor = this.executors.get(mutation.table)
        if (!executor) {
          result.failed.push(mutation.id)
          mutation.status = "failed"
          mutation.lastError = `No executor registered for table: ${mutation.table}`
          continue
        }

        mutation.status = "in_flight"

        try {
          const { serverId } = await executor(mutation, tempIdMap)

          // Track temp ID resolution
          if (
            serverId != null &&
            mutation.operation === "INSERT"
          ) {
            const pkValue = Object.values(mutation.primaryKey)[0]
            if (
              typeof pkValue === "string" &&
              pkValue.startsWith("_temp:")
            ) {
              tempIdMap.set(pkValue, serverId)
              this.onTempIdResolved?.(pkValue, serverId, mutation.table)
            }
          }

          mutation.status = "succeeded"
          result.succeeded.push(mutation.id)
          succeededIds.add(mutation.id)
        } catch (err) {
          mutation.retryCount++
          const errorMessage =
            err instanceof Error ? err.message : String(err)
          mutation.lastError = errorMessage

          if (mutation.retryCount >= this.maxRetries) {
            mutation.status = "rolled_back"
            result.rolledBack.push(mutation.id)
            rolledBackIds.add(mutation.id)
            this.onRollback?.(mutation)
          } else {
            mutation.status = "failed"
            result.failed.push(mutation.id)
            // Stop on first failure
            break
          }
        }
      }

      // Prune succeeded and rolled-back mutations in-place to avoid
      // losing mutations enqueued during flush (race condition fix)
      const pruneStatuses = new Set(["succeeded", "rolled_back"])
      for (let i = this.queue.length - 1; i >= 0; i--) {
        if (pruneStatuses.has(this.queue[i]!.status)) {
          this.queue.splice(i, 1)
        }
      }

      await this.persist()

      result.complete = result.failed.length === 0
      this.logger.queueFlushSuccess(
        result.succeeded.length,
        result.failed.length,
      )

      return result
    } finally {
      this.flushing = false
    }
  }

  // ── Auto-flush ───────────────────────────────────────────────────

  scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush().catch((err) => {
        this.logger.mutationError("__queue", "FLUSH" as any, err instanceof Error ? err.message : String(err))
      })
    }, this.flushDebounceMs)
  }

  cancelFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  startAutoFlush(): void {
    if (!this.network) return
    this.unsubNetwork = this.network.subscribe((online) => {
      if (online && this.isDirty) {
        this.scheduleFlush()
      }
    })
  }

  stopAutoFlush(): void {
    this.unsubNetwork?.()
    this.unsubNetwork = null
    this.cancelFlush()
  }

  // ── Accessors ────────────────────────────────────────────────────

  get pendingCount(): number {
    return this.queue.filter(
      (m) => m.status === "pending" || m.status === "failed",
    ).length
  }

  get isDirty(): boolean {
    return this.pendingCount > 0
  }

  get pendingMutations(): QueuedMutation[] {
    return this.queue.filter(
      (m) => m.status === "pending" || m.status === "failed",
    )
  }

  // ── Persistence ──────────────────────────────────────────────────

  private async persist(): Promise<void> {
    if (!this.adapter) return
    await this.adapter.setItem(QUEUE_KEY, this.queue)
  }

  // ── Cleanup ──────────────────────────────────────────────────────

  destroy(): void {
    this.stopAutoFlush()
    this.queue = []
  }
}

import type { SupabaseClient } from "@supabase/supabase-js"
import type { StoreApi } from "zustand"
import type { TableStore, TrackedRow, ConflictConfig, ConflictContext } from "../types.js"
import { fromTable } from "../query/queryExecutor.js"
import { resolveConflict } from "../mutation/conflictResolution.js"

export type IncrementalSyncOptions = {
  /** Column to track for delta sync (default: "updated_at") */
  timestampColumn?: string
  /** Schema name (default: "public") */
  schema?: string
}

/**
 * Perform an incremental (delta) sync for a table store.
 * Only fetches rows where timestampColumn > lastSyncAt.
 * Merges results using the configured conflict resolver.
 */
export async function incrementalSync<
  Row extends Record<string, unknown>,
  InsertRow extends Record<string, unknown>,
  UpdateRow extends Record<string, unknown>,
>(
  supabase: SupabaseClient,
  table: string,
  primaryKey: string,
  store: StoreApi<TableStore<Row, InsertRow, UpdateRow>>,
  options?: IncrementalSyncOptions & { conflict?: ConflictConfig<Row> },
): Promise<{ fetchedCount: number; mergedCount: number }> {
  const timestampColumn = options?.timestampColumn ?? "updated_at"
  const schema = options?.schema

  const state = store.getState()
  const lastSyncAt = state.lastFetchedAt

  // Build query
  let builder = fromTable(supabase, table, schema).select("*")

  if (lastSyncAt) {
    const lastSyncIso = new Date(lastSyncAt).toISOString()
    builder = builder.gt(timestampColumn, lastSyncIso)
  }

  builder = builder.order(timestampColumn, { ascending: true })

  const { data, error } = await builder

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as Row[]
  let mergedCount = 0

  if (rows.length > 0) {
    store.setState((prev: any) => {
      const records = new Map(prev.records) as Map<string | number, TrackedRow<Row>>
      const order = [...prev.order] as (string | number)[]

      for (const row of rows) {
        const id = (row as Record<string, unknown>)[primaryKey] as string | number
        const existing = records.get(id)

        // Don't overwrite pending mutations
        if (existing?._zs_pending) continue

        if (existing && options?.conflict) {
          const context: ConflictContext = {
            table,
            primaryKey: { [primaryKey]: id },
            hasPendingMutations: false,
            pendingMutations: [],
          }
          const resolved = resolveConflict(existing, row, options.conflict, context)
          if (resolved) {
            records.set(id, resolved as TrackedRow<Row>)
            mergedCount++
          }
        } else {
          const isNew = !records.has(id)
          records.set(id, row as TrackedRow<Row>)
          if (isNew) order.push(id)
          mergedCount++
        }

        // Ensure row is in order array (covers conflict-resolved path too)
        if (!order.includes(id)) order.push(id)
      }

      return {
        ...prev,
        records,
        order,
        lastFetchedAt: Date.now(),
      }
    })
  } else {
    store.setState({ lastFetchedAt: Date.now() } as any)
  }

  return { fetchedCount: rows.length, mergedCount }
}

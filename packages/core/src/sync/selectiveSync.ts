import type { SupabaseClient } from "@supabase/supabase-js"
import type { StoreApi } from "zustand"
import type {
  TableStore,
  FilterDescriptor,
  ConflictConfig,
} from "../types.js"
import { incrementalSync } from "./incrementalSync.js"
import type { IncrementalSyncOptions } from "./incrementalSync.js"
import { buildCursorQuery, processCursorResults } from "../query/pagination.js"
import type { CursorPaginationOptions, PaginationState } from "../query/pagination.js"

export type SelectiveSyncOptions<Row = Record<string, unknown>> =
  IncrementalSyncOptions & {
    /** Additional filters to narrow the sync scope */
    filters?: FilterDescriptor<Row>[]
    /** Conflict resolution config */
    conflict?: ConflictConfig<Row>
  }

/**
 * Incremental sync with additional user-defined filters.
 * Only syncs rows matching the given criteria.
 */
export async function selectiveSync<
  Row extends Record<string, unknown>,
  InsertRow extends Record<string, unknown>,
  UpdateRow extends Record<string, unknown>,
>(
  supabase: SupabaseClient,
  table: string,
  primaryKey: string,
  store: StoreApi<TableStore<Row, InsertRow, UpdateRow>>,
  options?: SelectiveSyncOptions<Row>,
): Promise<{ fetchedCount: number; mergedCount: number }> {
  // selectiveSync delegates to incrementalSync with filters applied via queryFn
  return incrementalSync(supabase, table, primaryKey, store, {
    timestampColumn: options?.timestampColumn,
    schema: options?.schema,
    conflict: options?.conflict,
    filters: options?.filters,
  })
}

export type PrioritizedStore = {
  store: StoreApi<TableStore<any, any, any>>
  priority: number
}

/**
 * Sync multiple stores in priority order (lower number = higher priority).
 * Fetches sequentially to avoid overwhelming the server.
 */
export async function syncAllByPriority(
  stores: PrioritizedStore[],
): Promise<void> {
  const sorted = [...stores].sort((a, b) => a.priority - b.priority)
  for (const { store } of sorted) {
    await store.getState().fetch().catch(() => {})
  }
}

/**
 * Fetch a single page of data using cursor-based pagination.
 * Wraps buildCursorQuery + processCursorResults for convenience.
 */
export async function fetchPage<
  Row extends Record<string, unknown>,
  InsertRow extends Record<string, unknown>,
  UpdateRow extends Record<string, unknown>,
>(
  store: StoreApi<TableStore<Row, InsertRow, UpdateRow>>,
  options: CursorPaginationOptions<Row>,
): Promise<{ data: Row[]; pagination: PaginationState }> {
  const { filters, sort, limit } = buildCursorQuery(options)
  const rows = await store.getState().fetch({ filters, sort, limit })
  return processCursorResults(rows as Row[], options)
}

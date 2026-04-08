import type { StoreApi } from "zustand"
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  TableStoreState,
  TrackedRow,
  FetchOptions,
  FilterDescriptor,
  SortDescriptor,
  PersistenceAdapter,
  SyncLogger,
  CacheStrategy,
} from "./types.js"
import { createTableStore } from "./createTableStore.js"

/** Read-only store type for database views */
export type ViewStore<Row> = TableStoreState<Row> & {
  fetch: (options?: FetchOptions<Row>) => Promise<TrackedRow<Row>[]>
  fetchOne: (id: string | number) => Promise<TrackedRow<Row> | null>
  refetch: () => Promise<TrackedRow<Row>[]>
  hydrate: () => Promise<void>
  persist: () => Promise<void>
  clearAll: () => void
  mergeRecords: (rows: Row[]) => void
  clearAndFetch: (options?: FetchOptions<Row>) => Promise<TrackedRow<Row>[]>
}

export type CreateViewStoreOptions<DB, Row extends Record<string, unknown>> = {
  supabase: SupabaseClient<DB>
  view: string
  schema?: string
  primaryKey?: string
  defaultFilters?: FilterDescriptor<Row>[]
  defaultSort?: SortDescriptor<Row>[]
  defaultSelect?: string
  persistence?: { adapter: PersistenceAdapter }
  cacheStrategy?: CacheStrategy
  devtools?: boolean | { name?: string }
  logger?: SyncLogger
}

/**
 * Creates a read-only Zustand store for a database view.
 * Mutations are disabled — only fetch operations are available.
 */
export function createViewStore<
  DB,
  Row extends Record<string, unknown>,
>(
  options: CreateViewStoreOptions<DB, Row>,
): StoreApi<ViewStore<Row>> {
  const { view, ...rest } = options

  const store = createTableStore<DB, Row, never, never>({
    ...rest,
    table: view,
    isView: true,
  })

  return store as unknown as StoreApi<ViewStore<Row>>
}

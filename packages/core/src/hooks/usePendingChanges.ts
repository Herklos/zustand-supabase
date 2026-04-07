"use client"

import { useStore } from "zustand"
import type { StoreApi } from "zustand"
import type { TableStore, TrackedRow } from "../types.js"

export type PendingChange<Row = Record<string, unknown>> = {
  id: string | number
  row: TrackedRow<Row>
  mutationType: "insert" | "update" | "delete"
}

/**
 * React hook that returns all rows with pending optimistic mutations
 * from a single table store.
 *
 * @example
 * const pending = usePendingChanges(stores.todos)
 * // [{ id: 1, row: { ... }, mutationType: "update" }]
 */
export function usePendingChanges<Row extends Record<string, unknown>>(
  store: StoreApi<TableStore<Row, any, any>>,
): PendingChange<Row>[] {
  const records = useStore(store, (s) => s.records)

  const pending: PendingChange<Row>[] = []
  for (const [id, row] of records.entries()) {
    if (row._zs_pending) {
      pending.push({ id, row, mutationType: row._zs_pending })
    }
  }
  return pending
}

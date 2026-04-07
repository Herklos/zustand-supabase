"use client"

import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import type { StoreApi } from "zustand"
import type { TableStore, TrackedRow, FetchOptions } from "../types.js"

const suspenseCache = new WeakMap<StoreApi<any>, Promise<unknown>>()

/**
 * React Suspense-compatible query hook.
 * Throws a promise while data is loading (for use with Suspense boundaries).
 * Returns data directly when available.
 */
export function useSuspenseQuery<
  Row extends Record<string, unknown>,
  InsertRow extends Record<string, unknown>,
  UpdateRow extends Record<string, unknown>,
>(
  store: StoreApi<TableStore<Row, InsertRow, UpdateRow>>,
  options?: FetchOptions<Row>,
): TrackedRow<Row>[] {
  // Call hooks unconditionally FIRST (Rules of Hooks)
  const data = useStore(
    store,
    useShallow((s: TableStore<Row, InsertRow, UpdateRow>) => {
      const result: TrackedRow<Row>[] = []
      for (const id of s.order) {
        const record = s.records.get(id)
        if (record) result.push(record)
      }
      return result
    }),
  )

  // THEN do Suspense throw logic
  const state = store.getState()

  // If data hasn't been fetched yet (initial load or loading in progress)
  if (!state.lastFetchedAt) {
    let promise = suspenseCache.get(store)
    if (!promise) {
      if (state.isLoading) {
        // Another fetch is in progress — wait for it via subscription
        promise = new Promise<void>((resolve) => {
          const unsub = store.subscribe((s) => {
            if (!(s as any).isLoading || (s as any).lastFetchedAt) {
              unsub()
              resolve()
            }
          })
        })
      } else {
        // No fetch in progress — trigger one
        promise = store.getState().fetch(options)
      }
      promise.catch(() => {})
      suspenseCache.set(store, promise)
      // Clear cache only after state has settled
      promise.finally(() => {
        if (store.getState().lastFetchedAt) {
          suspenseCache.delete(store)
        }
      })
    }
    throw promise
  }

  if (state.error) {
    throw state.error
  }

  return data
}

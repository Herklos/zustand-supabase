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

  if (!state.lastFetchedAt && !state.isLoading) {
    let promise = suspenseCache.get(store)
    if (!promise) {
      promise = store.getState().fetch(options)
      suspenseCache.set(store, promise)
      // Prevent unhandled rejection — error boundary reads state.error
      promise.catch(() => {})
      promise.finally(() => suspenseCache.delete(store))
    }
    throw promise
  }

  if (state.isLoading && !state.lastFetchedAt) {
    const promise = suspenseCache.get(store)
    if (promise) throw promise
    const newPromise = store.getState().fetch(options)
    suspenseCache.set(store, newPromise)
    newPromise.catch(() => {})
    newPromise.finally(() => suspenseCache.delete(store))
    throw newPromise
  }

  if (state.error) {
    throw state.error
  }

  return data
}

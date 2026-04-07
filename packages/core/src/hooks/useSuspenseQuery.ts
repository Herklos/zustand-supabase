"use client"

import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import type { StoreApi } from "zustand"
import type { TableStore, TrackedRow, FetchOptions } from "../types.js"

// Cache of in-flight fetch promises for Suspense
const suspenseCache = new WeakMap<StoreApi<any>, Promise<unknown>>()

/**
 * React Suspense-compatible query hook.
 * Throws a promise while data is loading (for use with <Suspense> boundaries).
 * Returns data directly when available — no isLoading/error states needed.
 *
 * @example
 * ```tsx
 * function TodoList() {
 *   const data = useSuspenseQuery(todosStore)
 *   // No loading check needed — Suspense handles it
 *   return <ul>{data.map(t => <li key={t.id}>{t.title}</li>)}</ul>
 * }
 *
 * // Wrap in Suspense
 * <Suspense fallback={<Spinner />}>
 *   <TodoList />
 * </Suspense>
 * ```
 */
export function useSuspenseQuery<
  Row extends Record<string, unknown>,
  InsertRow extends Record<string, unknown>,
  UpdateRow extends Record<string, unknown>,
>(
  store: StoreApi<TableStore<Row, InsertRow, UpdateRow>>,
  options?: FetchOptions<Row>,
): TrackedRow<Row>[] {
  const state = store.getState()

  // If no data has been fetched yet, throw a promise (Suspense protocol)
  if (!state.lastFetchedAt && !state.isLoading) {
    let promise = suspenseCache.get(store)
    if (!promise) {
      promise = store.getState().fetch(options)
      suspenseCache.set(store, promise)
      promise.finally(() => {
        suspenseCache.delete(store)
      })
    }
    throw promise
  }

  // If currently loading (initial fetch), throw the cached promise
  if (state.isLoading && !state.lastFetchedAt) {
    const promise = suspenseCache.get(store)
    if (promise) throw promise
    // Shouldn't happen, but fallback
    const newPromise = store.getState().fetch(options)
    suspenseCache.set(store, newPromise)
    newPromise.finally(() => suspenseCache.delete(store))
    throw newPromise
  }

  // If there was an error, throw it for Error Boundary
  if (state.error) {
    throw state.error
  }

  // Data is available — return it with shallow equality
  return useStore(
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
}

"use client"

import { useEffect, useRef, useCallback } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import type { StoreApi } from "zustand"
import type { TableStore, TrackedRow, FetchOptions } from "../types.js"

type UseQueryResult<Row> = {
  data: TrackedRow<Row>[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<TrackedRow<Row>[]>
  isHydrated: boolean
}

/**
 * Declarative data-fetching hook with automatic refetch on filter changes.
 *
 * @param options.staleTime - Time in ms before data is considered stale and
 *   refetched on mount. Defaults to 5000 (5s). Set to 0 to always refetch.
 */
export function useQuery<
  Row extends Record<string, unknown>,
  InsertRow extends Record<string, unknown>,
  UpdateRow extends Record<string, unknown>,
>(
  store: StoreApi<TableStore<Row, InsertRow, UpdateRow>>,
  options?: FetchOptions<Row> & {
    deps?: unknown[]
    enabled?: boolean
    refetchInterval?: number
    staleTime?: number
  },
): UseQueryResult<Row> {
  const enabled = options?.enabled ?? true
  const deps = options?.deps ?? []
  const refetchInterval = options?.refetchInterval
  const staleTime = options?.staleTime ?? 5000
  const optionsRef = useRef(options)
  optionsRef.current = options
  const filterKey = JSON.stringify(options?.filters ?? null)
  const sortKey = JSON.stringify(options?.sort ?? null)

  const isLoading = useStore(store, (s) => s.isLoading)
  const error = useStore(store, (s) => s.error)
  const isHydrated = useStore(store, (s) => s.isHydrated)

  const data = useStore(
    store,
    useShallow((state: TableStore<Row, InsertRow, UpdateRow>) => {
      const result: TrackedRow<Row>[] = []
      for (const id of state.order) {
        const record = state.records.get(id)
        if (record) result.push(record)
      }
      return result
    }),
  )

  const fetch = useCallback(async () => {
    const { deps: _deps, enabled: _enabled, refetchInterval: _ri, staleTime: _st, ...fetchOpts } =
      optionsRef.current ?? {}
    return store.getState().fetch(fetchOpts)
  }, [store])

  // Initial fetch + refetch on filter/sort/deps changes
  // Skip if data was fetched recently (within staleTime)
  useEffect(() => {
    if (!enabled) return
    const { lastFetchedAt } = store.getState()
    if (staleTime > 0 && lastFetchedAt && Date.now() - lastFetchedAt < staleTime) return
    // Error is captured in store.error state; prevent unhandled rejection
    fetch().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fetch, filterKey, sortKey, ...deps])

  // Refetch interval
  useEffect(() => {
    if (!enabled || !refetchInterval) return
    const interval = setInterval(() => { fetch().catch(() => {}) }, refetchInterval)
    return () => clearInterval(interval)
  }, [enabled, refetchInterval, fetch])

  return { data, isLoading, error, refetch: fetch, isHydrated }
}

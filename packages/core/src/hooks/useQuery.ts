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
  },
): UseQueryResult<Row> {
  const enabled = options?.enabled ?? true
  const deps = options?.deps ?? []
  const refetchInterval = options?.refetchInterval
  const optionsRef = useRef(options)
  optionsRef.current = options

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
    const { deps: _deps, enabled: _enabled, refetchInterval: _ri, ...fetchOpts } =
      optionsRef.current ?? {}
    return store.getState().fetch(fetchOpts)
  }, [store])

  // Initial fetch
  useEffect(() => {
    if (!enabled) return
    fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fetch, ...deps])

  // Refetch interval
  useEffect(() => {
    if (!enabled || !refetchInterval) return
    const interval = setInterval(fetch, refetchInterval)
    return () => clearInterval(interval)
  }, [enabled, refetchInterval, fetch])

  return { data, isLoading, error, refetch: fetch, isHydrated }
}

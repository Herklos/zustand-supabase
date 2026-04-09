"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { StoreApi } from "zustand"
import type { TableStore } from "../types.js"

export type UseLinkedQueryResult<T> = {
  data: T | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Custom async query that auto-refetches when linked stores mutate.
 *
 * Use for queries with joins or complex selects that can't use `useQuery`
 * directly but should still react to optimistic mutations on related stores.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLinkedQuery(
 *   () => fetchOfferApplications(supabase, offerId),
 *   {
 *     stores: [stores.applications],
 *     deps: [offerId],
 *     enabled: !!offerId,
 *   },
 * )
 * ```
 *
 * @example List → detail with instant cache (stale-while-revalidate)
 * ```tsx
 * // List hook — populates the store as a side-effect
 * const { data: offers } = useLinkedQuery(
 *   () => fetchOffers(supabase),
 *   { stores: [stores.offers], mergeToStore: stores.offers },
 * )
 *
 * // Detail hook — reads from the store immediately, refreshes in background
 * const { data: offer } = useLinkedQuery(
 *   () => fetchOffer(supabase, id),
 *   {
 *     stores: [stores.offers],
 *     deps: [id],
 *     initialData: () => stores.offers.getState().records.get(id),
 *   },
 * )
 * ```
 */
export function useLinkedQuery<T>(
  queryFn: () => Promise<T>,
  options?: {
    stores?: StoreApi<TableStore<any, any, any>>[]
    deps?: unknown[]
    enabled?: boolean
    /**
     * Seed the initial data before the first fetch resolves.
     * Accepts a value or a getter function called once on mount.
     * When initial data is provided, `isLoading` starts as `false` and the
     * network fetch still fires in the background (stale-while-revalidate).
     */
    initialData?: T | (() => T | undefined)
    /**
     * Write successful query results back into this store via `mergeRecords()`.
     * Only applies when the result is an array — no-op otherwise.
     * Enables list queries to populate the store so detail queries can use
     * `initialData` to serve cached records instantly.
     */
    mergeToStore?: StoreApi<TableStore<any, any, any>>
  },
): UseLinkedQueryResult<T> {
  const enabled = options?.enabled ?? true
  const deps = options?.deps ?? []
  const linkedStores = options?.stores ?? []
  const mergeToStore = options?.mergeToStore

  const resolveInitialData = (): T | undefined => {
    const raw = options?.initialData
    return typeof raw === "function" ? (raw as () => T | undefined)() : raw
  }

  const initialValue = resolveInitialData()
  const hasInitialData = initialValue !== undefined

  const [data, setData] = useState<T | undefined>(initialValue)
  const [isLoading, setIsLoading] = useState(enabled && !hasInitialData)
  const [error, setError] = useState<Error | null>(null)

  const queryFnRef = useRef(queryFn)
  queryFnRef.current = queryFn
  const generationRef = useRef(0)
  const mergeToStoreRef = useRef(mergeToStore)
  mergeToStoreRef.current = mergeToStore

  // Track store mutation version — increments when any linked store's records change
  const [storeVersion, setStoreVersion] = useState(0)

  useEffect(() => {
    if (linkedStores.length === 0) return

    // Capture initial records refs to avoid refetching on mount
    const prevRecords = linkedStores.map((s) => s.getState().records)

    const unsubs = linkedStores.map((store, i) =>
      store.subscribe((state) => {
        if (state.records !== prevRecords[i]) {
          prevRecords[i] = state.records
          setStoreVersion((v) => v + 1)
        }
      }),
    )
    return () => unsubs.forEach((u) => u())
    // Re-subscribe only when the store array identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedStores.length, ...linkedStores])

  const refetch = useCallback(async () => {
    const gen = ++generationRef.current
    setIsLoading(true)
    setError(null)
    try {
      const result = await queryFnRef.current()
      if (gen === generationRef.current) {
        setData(result)
        if (mergeToStoreRef.current && Array.isArray(result)) {
          mergeToStoreRef.current.getState().mergeRecords(result)
        }
      }
    } catch (err) {
      if (gen === generationRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      if (gen === generationRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  // Fetch on mount, when deps change, or when linked stores mutate
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false)
      return
    }
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refetch, storeVersion, ...deps])

  return { data, isLoading, error, refetch }
}

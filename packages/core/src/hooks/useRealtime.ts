"use client"

import { useEffect } from "react"
import { useStore } from "zustand"
import type { StoreApi } from "zustand"
import type { TableStore, RealtimeStatus, FilterDescriptor } from "../types.js"

type UseRealtimeResult = {
  status: RealtimeStatus
}

/**
 * Hook that manages realtime subscription lifecycle.
 * Subscribes on mount, unsubscribes on unmount.
 */
export function useRealtime<
  Row extends Record<string, unknown>,
  InsertRow extends Record<string, unknown>,
  UpdateRow extends Record<string, unknown>,
>(
  store: StoreApi<TableStore<Row, InsertRow, UpdateRow>>,
  options?: {
    filter?: FilterDescriptor<Row>[]
    enabled?: boolean
  },
): UseRealtimeResult {
  const enabled = options?.enabled ?? true
  const status = useStore(store, (s) => s.realtimeStatus)

  useEffect(() => {
    if (!enabled) return

    const unsubscribe = store.getState().subscribe(options?.filter)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, store])

  return { status }
}

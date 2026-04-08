"use client"

import { useSyncExternalStore, useCallback, useRef } from "react"
import type { StoreApi } from "zustand"
import type { TableStore, NetworkStatusAdapter } from "../types.js"

export type SyncStatus = "synced" | "syncing" | "offline" | "error"

export type SyncStatusResult = {
  pendingCount: number
  isSyncing: boolean
  lastSyncedAt: number | null
  failedCount: number
  status: SyncStatus
}

/**
 * Pure computation of sync status from multiple stores.
 * Exported for direct use and testing without React.
 */
export function computeSyncStatus(
  stores: StoreApi<TableStore<any, any, any>>[],
  network?: NetworkStatusAdapter,
): SyncStatusResult {
  let pendingCount = 0
  let failedCount = 0
  let isSyncing = false
  let oldestFetch: number | null = null
  let hasError = false

  for (const store of stores) {
    const state = store.getState()
    if (state.isLoading) isSyncing = true
    if (state.error) {
      hasError = true
      failedCount++
    }

    for (const row of state.records.values()) {
      if (row._anchor_pending) pendingCount++
    }

    if (state.lastFetchedAt !== null) {
      if (oldestFetch === null || state.lastFetchedAt < oldestFetch) {
        oldestFetch = state.lastFetchedAt
      }
    }
  }

  const isOffline = network ? !network.isOnline() : false

  let status: SyncStatus = "synced"
  if (hasError) status = "error"
  else if (isOffline) status = "offline"
  else if (isSyncing || pendingCount > 0) status = "syncing"

  return { pendingCount, isSyncing, lastSyncedAt: oldestFetch, failedCount, status }
}

/**
 * React hook that aggregates sync status across multiple table stores.
 *
 * @example
 * const { status, pendingCount } = useSyncStatus([stores.todos, stores.users])
 * // status: "synced" | "syncing" | "offline" | "error"
 */
export function useSyncStatus(
  stores: StoreApi<TableStore<any, any, any>>[],
  options?: { network?: NetworkStatusAdapter },
): SyncStatusResult {
  const storesRef = useRef(stores)
  storesRef.current = stores

  const networkRef = useRef(options?.network)
  networkRef.current = options?.network

  const cachedRef = useRef<SyncStatusResult>({
    pendingCount: 0,
    isSyncing: false,
    lastSyncedAt: null,
    failedCount: 0,
    status: "synced",
  })

  const subscribe = useCallback((onStoreChange: () => void) => {
    const unsubs = storesRef.current.map((s) => s.subscribe(onStoreChange))
    return () => unsubs.forEach((u) => u())
  }, [])

  const getSnapshot = useCallback(() => {
    const next = computeSyncStatus(storesRef.current, networkRef.current)
    const prev = cachedRef.current
    if (
      prev.pendingCount === next.pendingCount &&
      prev.isSyncing === next.isSyncing &&
      prev.lastSyncedAt === next.lastSyncedAt &&
      prev.failedCount === next.failedCount &&
      prev.status === next.status
    ) {
      return prev
    }
    cachedRef.current = next
    return next
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

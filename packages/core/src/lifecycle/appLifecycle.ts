import type { StoreApi } from "zustand"
import type {
  TableStore,
  AuthStore,
  AppLifecycleAdapter,
  NetworkStatusAdapter,
} from "../types.js"
import { isStale } from "../cache/cacheTtl.js"

export type AppLifecycleOptions = {
  adapter: AppLifecycleAdapter
  stores?: StoreApi<TableStore<any, any, any>>[]
  authStore?: StoreApi<AuthStore>
  queue?: { flush(): Promise<unknown> }
  network?: NetworkStatusAdapter
  /** Refresh auth session on foreground (default: true) */
  refreshAuthOnForeground?: boolean
  /** Flush offline queue on foreground (default: true) */
  flushQueueOnForeground?: boolean
  /** Unsubscribe realtime on background, resubscribe on foreground (default: false) */
  pauseRealtimeOnBackground?: boolean
  /** Revalidate stale stores on foreground (default: true) */
  revalidateOnForeground?: boolean
  /** Stale threshold in ms (default: 5 minutes) */
  staleTTL?: number
}

/**
 * Wire app lifecycle events (foreground/background) to store operations.
 * Returns a cleanup function.
 */
export function setupAppLifecycle(options: AppLifecycleOptions): () => void {
  const {
    adapter,
    stores = [],
    authStore,
    queue,
    network,
    refreshAuthOnForeground = true,
    flushQueueOnForeground = true,
    pauseRealtimeOnBackground = false,
    revalidateOnForeground = true,
    staleTTL = 5 * 60 * 1000,
  } = options

  // Track realtime cleanup functions for pause/resume
  const realtimeCleanups: (() => void)[] = []

  const unsubForeground = adapter.onForeground(() => {
    // Only act if online (or no network adapter provided)
    const online = network ? network.isOnline() : true

    // Resume realtime subscriptions if they were paused
    if (pauseRealtimeOnBackground) {
      for (const store of stores) {
        const state = store.getState()
        if (state.realtimeStatus === "disconnected") {
          const unsub = state.subscribe()
          realtimeCleanups.push(unsub)
        }
      }
    }

    // Errors from these best-effort operations are surfaced via the store's
    // own error state and SyncLogger — no need to double-report here.
    if (flushQueueOnForeground && queue && online) {
      queue.flush().catch(() => {})
    }

    if (refreshAuthOnForeground && authStore && online) {
      authStore.getState().refreshSession().catch(() => {})
    }

    if (revalidateOnForeground && online) {
      for (const store of stores) {
        if (isStale(store, staleTTL)) {
          store.getState().refetch().catch(() => {})
        }
      }
    }
  })

  const unsubBackground = adapter.onBackground(() => {
    if (pauseRealtimeOnBackground) {
      // Unsubscribe all stores from realtime
      for (const store of stores) {
        store.getState().unsubscribe()
      }
      // Clear tracked cleanups since we manually unsubscribed
      realtimeCleanups.length = 0
    }
  })

  return () => {
    unsubForeground()
    unsubBackground()
    for (const cleanup of realtimeCleanups) cleanup()
  }
}

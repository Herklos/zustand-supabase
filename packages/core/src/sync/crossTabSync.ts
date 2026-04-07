/// <reference lib="dom" />
import type { StoreApi } from "zustand"

type SyncableState = {
  records: Map<string | number, unknown>
  order: (string | number)[]
  isRestoring: boolean
  isHydrated: boolean
}

type CrossTabPayload = {
  records: [string | number, unknown][]
  order: (string | number)[]
  sessionId?: string
}

/**
 * Sets up cross-tab synchronization using the BroadcastChannel API.
 * State changes in one tab are automatically reflected in others.
 *
 * @param sessionId - Optional session ID to prevent data leaking across auth sessions.
 */
export function setupBroadcastSync(
  store: StoreApi<SyncableState>,
  name: string,
  sessionId?: string,
): () => void {
  const channel = new BroadcastChannel(`zs:${name}`)
  let receiving = false

  channel.onmessage = (event: MessageEvent<CrossTabPayload>) => {
    // Ignore messages from different auth sessions
    if (sessionId && event.data.sessionId && event.data.sessionId !== sessionId) return

    const current = store.getState()
    // Don't apply cross-tab data during hydration — it would overwrite partially-loaded state
    if (!current.isHydrated) return

    receiving = true
    try {
      const incoming = new Map(event.data.records)
      // Preserve locally pending rows (optimistic mutations in flight)
      for (const [id, row] of current.records) {
        if ((row as any)?._zs_pending) {
          incoming.set(id, row)
        }
      }
      const order = [...event.data.order]
      const orderSet = new Set<string | number>(order)
      for (const [id] of current.records) {
        if ((current.records.get(id) as any)?._zs_pending && !orderSet.has(id as string | number)) {
          order.push(id as string | number)
          orderSet.add(id as string | number)
        }
      }
      store.setState({
        records: incoming,
        order,
        isRestoring: false,
      } as Partial<SyncableState>)
    } finally {
      receiving = false
    }
  }

  const unsub = store.subscribe((state, prev) => {
    // Don't echo back received data
    if (receiving) return
    // Don't broadcast during restore
    if (state.isRestoring) return
    // Only broadcast if records or order changed
    if (state.records === prev.records && state.order === prev.order) return

    try {
      channel.postMessage({
        records: [...state.records.entries()],
        order: state.order,
        sessionId,
      } satisfies CrossTabPayload)
    } catch (err) {
      console.warn(`[zs:crossTab:${name}] Failed to broadcast:`, err)
    }
  })

  return () => {
    unsub()
    channel.close()
  }
}

/**
 * Sets up cross-tab synchronization using localStorage events.
 * Fallback for environments without BroadcastChannel support.
 *
 * @param sessionId - Optional session ID to prevent data leaking across auth sessions.
 */
export function setupStorageFallback(
  store: StoreApi<SyncableState>,
  name: string,
  sessionId?: string,
): () => void {
  const key = `zs:broadcast:${name}`
  let receiving = false

  const onStorage = (event: StorageEvent) => {
    if (event.key !== key || !event.newValue) return
    try {
      const payload = JSON.parse(event.newValue) as CrossTabPayload

      // Ignore messages from different auth sessions
      if (sessionId && payload.sessionId && payload.sessionId !== sessionId) return

      const current = store.getState()
      // Don't apply cross-tab data during hydration
      if (!current.isHydrated) return

      receiving = true
      try {
        const incoming = new Map(payload.records)
        // Preserve locally pending rows
        for (const [id, row] of current.records) {
          if ((row as any)?._zs_pending) {
            incoming.set(id, row)
          }
        }
        const order = [...payload.order]
        const orderSet = new Set<string | number>(order)
        for (const [id] of current.records) {
          if ((current.records.get(id) as any)?._zs_pending && !orderSet.has(id as string | number)) {
            order.push(id as string | number)
            orderSet.add(id as string | number)
          }
        }
        store.setState({
          records: incoming,
          order,
          isRestoring: false,
        } as Partial<SyncableState>)
      } finally {
        receiving = false
      }
    } catch (err) {
      console.warn(`[zs:crossTab:${name}] Failed to parse cross-tab data:`, err)
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage)
  }

  const unsub = store.subscribe((state, prev) => {
    if (receiving) return
    if (state.isRestoring) return
    if (state.records === prev.records && state.order === prev.order) return

    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          records: [...state.records.entries()],
          order: state.order,
          sessionId,
        } satisfies CrossTabPayload),
      )
    } catch (err) {
      console.warn(`[zs:crossTab:${name}] Failed to persist cross-tab data:`, err)
    }
  })

  return () => {
    unsub()
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage)
    }
  }
}

/**
 * Sets up cross-tab synchronization using the best available method.
 * Uses BroadcastChannel when available, falls back to localStorage events.
 *
 * @param sessionId - Optional session ID to prevent data leaking across auth sessions.
 */
export function setupCrossTabSync(
  store: StoreApi<SyncableState>,
  name: string,
  sessionId?: string,
): () => void {
  if (typeof BroadcastChannel !== "undefined") {
    return setupBroadcastSync(store, name, sessionId)
  }
  if (
    typeof window !== "undefined" &&
    typeof localStorage !== "undefined"
  ) {
    return setupStorageFallback(store, name, sessionId)
  }
  return () => {}
}

/// <reference lib="dom" />
import type { StoreApi } from "zustand"

type SyncableState = {
  records: Map<string | number, unknown>
  order: (string | number)[]
  isRestoring: boolean
}

type CrossTabPayload = {
  records: [string | number, unknown][]
  order: (string | number)[]
}

/**
 * Sets up cross-tab synchronization using the BroadcastChannel API.
 * State changes in one tab are automatically reflected in others.
 */
export function setupBroadcastSync(
  store: StoreApi<SyncableState>,
  name: string,
): () => void {
  const channel = new BroadcastChannel(`zs:${name}`)
  let lastReceivedOrder: (string | number)[] | null = null

  channel.onmessage = (event: MessageEvent<CrossTabPayload>) => {
    lastReceivedOrder = event.data.order
    const records = new Map(event.data.records)
    store.setState({
      records,
      order: event.data.order,
      isRestoring: false,
    } as Partial<SyncableState>)
  }

  const unsub = store.subscribe((state, prev) => {
    // Don't echo back received data
    if (state.order === lastReceivedOrder) return
    // Don't broadcast during restore
    if (state.isRestoring) return
    // Only broadcast if records or order changed
    if (state.records === prev.records && state.order === prev.order) return

    try {
      channel.postMessage({
        records: [...state.records.entries()],
        order: state.order,
      } satisfies CrossTabPayload)
    } catch {
      // Non-serializable data — skip
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
 */
export function setupStorageFallback(
  store: StoreApi<SyncableState>,
  name: string,
): () => void {
  const key = `zs:broadcast:${name}`
  let lastReceivedOrder: (string | number)[] | null = null

  const onStorage = (event: StorageEvent) => {
    if (event.key !== key || !event.newValue) return
    try {
      const payload = JSON.parse(event.newValue) as CrossTabPayload
      lastReceivedOrder = payload.order
      const records = new Map(payload.records)
      store.setState({
        records,
        order: payload.order,
        isRestoring: false,
      } as Partial<SyncableState>)
    } catch {
      // Corrupt data — skip
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage)
  }

  const unsub = store.subscribe((state, prev) => {
    if (state.order === lastReceivedOrder) return
    if (state.isRestoring) return
    if (state.records === prev.records && state.order === prev.order) return

    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          records: [...state.records.entries()],
          order: state.order,
        } satisfies CrossTabPayload),
      )
    } catch {
      // Quota exceeded or non-serializable — skip
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
 */
export function setupCrossTabSync(
  store: StoreApi<SyncableState>,
  name: string,
): () => void {
  if (typeof BroadcastChannel !== "undefined") {
    return setupBroadcastSync(store, name)
  }
  if (
    typeof window !== "undefined" &&
    typeof localStorage !== "undefined"
  ) {
    return setupStorageFallback(store, name)
  }
  return () => {}
}

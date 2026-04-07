import type { NetworkStatusAdapter } from "zustand-supabase"

/**
 * Web network status adapter using navigator.onLine and online/offline events.
 */
export class WebNetworkStatus implements NetworkStatusAdapter {
  isOnline(): boolean {
    return typeof navigator !== "undefined" ? navigator.onLine : true
  }

  subscribe(callback: (online: boolean) => void): () => void {
    if (typeof window === "undefined") return () => {}

    const onOnline = () => callback(true)
    const onOffline = () => callback(false)

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)

    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }
}

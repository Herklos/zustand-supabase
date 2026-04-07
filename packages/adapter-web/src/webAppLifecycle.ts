import type { AppLifecycleAdapter } from "zustand-supabase"

/**
 * Web implementation of AppLifecycleAdapter using the Page Visibility API.
 * Maps `document.visibilityState === "visible"` to foreground.
 * SSR-safe: returns no-op cleanup when `document` is unavailable.
 */
export class WebAppLifecycle implements AppLifecycleAdapter {
  onForeground(cb: () => void): () => void {
    if (typeof document === "undefined") return () => {}
    const handler = () => {
      if (document.visibilityState === "visible") cb()
    }
    document.addEventListener("visibilitychange", handler)
    return () => document.removeEventListener("visibilitychange", handler)
  }

  onBackground(cb: () => void): () => void {
    if (typeof document === "undefined") return () => {}
    const handler = () => {
      if (document.visibilityState === "hidden") cb()
    }
    document.addEventListener("visibilitychange", handler)
    return () => document.removeEventListener("visibilitychange", handler)
  }
}

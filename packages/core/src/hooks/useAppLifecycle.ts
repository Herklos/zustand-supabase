"use client"

import { useEffect } from "react"
import { setupAppLifecycle } from "../lifecycle/appLifecycle.js"
import type { AppLifecycleOptions } from "../lifecycle/appLifecycle.js"

/**
 * React hook that wires app lifecycle events to store operations.
 * Flushes queue, refreshes auth, and revalidates stale data on foreground.
 */
export function useAppLifecycle(options: AppLifecycleOptions): void {
  useEffect(() => {
    return setupAppLifecycle(options)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.adapter])
}

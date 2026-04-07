"use client"

import { useState, useEffect } from "react"
import type { SyncMetrics, MetricsSnapshot } from "../sync/syncMetrics.js"

/**
 * React hook that subscribes to SyncMetrics and returns a reactive snapshot.
 */
export function useSyncMetrics(metrics: SyncMetrics): MetricsSnapshot {
  const [snapshot, setSnapshot] = useState<MetricsSnapshot>(() => metrics.getMetrics())

  useEffect(() => {
    const unsubscribe = metrics.onMetricsUpdate(setSnapshot)
    return unsubscribe
  }, [metrics])

  return snapshot
}

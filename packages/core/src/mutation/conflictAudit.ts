import type { ConflictStrategy } from "../types.js"

export type ConflictAuditEntry = {
  table: string
  rowId: string | number
  timestamp: number
  strategy: ConflictStrategy
  localValue: Record<string, unknown>
  remoteValue: Record<string, unknown>
  resolvedValue: Record<string, unknown> | null
}

export class ConflictAuditLog {
  private entries: ConflictAuditEntry[] = []
  private listeners = new Set<(entry: ConflictAuditEntry) => void>()

  record(entry: Omit<ConflictAuditEntry, "timestamp">): void {
    const full: ConflictAuditEntry = { ...entry, timestamp: Date.now() }
    this.entries.push(full)
    for (const cb of this.listeners) cb(full)
  }

  getLog(options?: { table?: string; since?: number }): ConflictAuditEntry[] {
    let result = this.entries
    if (options?.table) result = result.filter((e) => e.table === options.table)
    if (options?.since)
      result = result.filter((e) => e.timestamp >= options.since!)
    return [...result]
  }

  clearLog(): void {
    this.entries = []
  }

  onConflict(cb: (entry: ConflictAuditEntry) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }
}

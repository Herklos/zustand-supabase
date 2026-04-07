"use client"

import { useState, useEffect } from "react"
import type {
  ConflictAuditLog,
  ConflictAuditEntry,
} from "../mutation/conflictAudit.js"

export function useConflictNotifications(auditLog: ConflictAuditLog) {
  const [conflicts, setConflicts] = useState<ConflictAuditEntry[]>([])

  useEffect(() => {
    return auditLog.onConflict((entry) => {
      setConflicts((prev) => [...prev, entry])
    })
  }, [auditLog])

  return {
    conflicts,
    clearAll: () => setConflicts([]),
    dismiss: (index: number) =>
      setConflicts((prev) => prev.filter((_, i) => i !== index)),
  }
}

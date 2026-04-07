import type {
  ConflictResolver,
  ConflictContext,
  ConflictConfig,
  TrackedRow,
} from "../types.js"
import type { ConflictAuditLog } from "./conflictAudit.js"

/**
 * Remote always wins. Simplest strategy.
 */
export function remoteWins<
  Row extends Record<string, unknown>,
>(): ConflictResolver<Row> {
  return (_local, remote, _context) => remote
}

/**
 * Local always wins. Offline edits are preserved.
 */
export function localWins<
  Row extends Record<string, unknown>,
>(): ConflictResolver<Row> {
  return (local, _remote, _context) => {
    // Strip tracking metadata
    const { _zs_pending, _zs_optimistic, _zs_mutationId, ...clean } =
      local as TrackedRow<Row> & Record<string, unknown>
    return clean as Row
  }
}

/**
 * Last-write-wins based on a timestamp column.
 * When timestamps are equal (ties), the remote (server) value wins
 * since the server is the authoritative source of truth.
 */
export function lastWriteWins<Row extends Record<string, unknown>>(
  timestampColumn = "updated_at",
): ConflictResolver<Row> {
  return (local, remote, _context) => {
    const localTs = (local as Record<string, unknown>)[timestampColumn]
    const remoteTs = (remote as Record<string, unknown>)[timestampColumn]

    if (!localTs || !remoteTs) return remote

    const localTime =
      typeof localTs === "string"
        ? new Date(localTs).getTime()
        : (localTs as number)
    const remoteTime =
      typeof remoteTs === "string"
        ? new Date(remoteTs).getTime()
        : (remoteTs as number)

    if (localTime > remoteTime) {
      const { _zs_pending, _zs_optimistic, _zs_mutationId, ...clean } =
        local as TrackedRow<Row> & Record<string, unknown>
      return clean as Row
    }

    return remote
  }
}

/**
 * Field-level merge: per-field, newer value wins.
 * NOTE: Uses shallow assignment — nested objects and arrays are not deep-merged.
 * For complex nested data, use a custom resolver.
 */
export function fieldLevelMerge<Row extends Record<string, unknown>>(options?: {
  timestampColumn?: string
  serverOwnedFields?: string[]
  clientOwnedFields?: string[]
}): ConflictResolver<Row> {
  const {
    timestampColumn = "updated_at",
    serverOwnedFields = [],
    clientOwnedFields = [],
  } = options ?? {}

  return (local, remote, _context) => {
    const merged = { ...remote } as Record<string, unknown>

    const localTs = (local as Record<string, unknown>)[timestampColumn]
    const remoteTs = (remote as Record<string, unknown>)[timestampColumn]
    const localNewer =
      localTs && remoteTs
        ? new Date(localTs as string).getTime() >
          new Date(remoteTs as string).getTime()
        : false

    for (const key of Object.keys(local as Record<string, unknown>)) {
      // Skip metadata
      if (key.startsWith("_zs_")) continue

      // Server-owned: always use remote
      if (serverOwnedFields.includes(key)) continue

      // Client-owned: always use local
      if (clientOwnedFields.includes(key)) {
        merged[key] = (local as Record<string, unknown>)[key]
        continue
      }

      // For other fields: use whichever is newer
      if (localNewer) {
        merged[key] = (local as Record<string, unknown>)[key]
      }
    }

    return merged as Row
  }
}

/**
 * Resolve a conflict using the configured strategy.
 */
export function resolveConflict<Row extends Record<string, unknown>>(
  local: TrackedRow<Row> | undefined,
  remote: Row,
  config: ConflictConfig<Row>,
  context: ConflictContext,
  auditLog?: ConflictAuditLog,
): Row | null {
  if (!local) return remote

  let result: Row | null

  // Custom resolver takes precedence
  if (config.resolver) {
    result = config.resolver(local, remote, context)
  } else {
    switch (config.strategy ?? "server-wins") {
      case "server-wins":
        result = remoteWins<Row>()(local, remote, context)
        break
      case "client-wins":
        result = localWins<Row>()(local, remote, context)
        break
      case "last-write-wins":
        result = lastWriteWins<Row>(config.timestampColumn)(
          local,
          remote,
          context,
        )
        break
      case "field-merge":
        result = fieldLevelMerge<Row>({
          timestampColumn: config.timestampColumn,
          serverOwnedFields: config.serverOwnedFields,
          clientOwnedFields: config.clientOwnedFields,
        })(local, remote, context)
        break
      case "custom":
        // Requires resolver to be set
        result = remote
        break
      default:
        result = remote
        break
    }
  }

  if (auditLog && local) {
    const pk = context.primaryKey
    const rowId = Object.values(pk)[0] as string | number
    auditLog.record({
      table: context.table,
      rowId,
      strategy: config.strategy ?? "server-wins",
      localValue: local as Record<string, unknown>,
      remoteValue: remote as Record<string, unknown>,
      resolvedValue: result as Record<string, unknown> | null,
    })
  }

  return result
}

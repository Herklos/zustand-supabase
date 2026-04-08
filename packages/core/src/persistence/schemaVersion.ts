import type { PersistenceAdapter } from "../types.js"

const SCHEMA_VERSION_KEY = "anchor:__schema_version"

export type SchemaVersionResult = {
  versionChanged: boolean
  previousVersion: number | null
}

/**
 * Check if the stored schema version matches the current version.
 * If mismatch: clears all `anchor:` prefixed cache keys and updates stored version.
 * After cache clear, normal fetch() repopulates from Supabase.
 */
export async function checkSchemaVersion(
  adapter: PersistenceAdapter,
  currentVersion: number,
): Promise<SchemaVersionResult> {
  const stored = await adapter.getItem<number>(SCHEMA_VERSION_KEY)

  if (stored === currentVersion) {
    return { versionChanged: false, previousVersion: stored }
  }

  // Version mismatch — clear all zs: prefixed keys
  if (adapter.keys && adapter.clear) {
    const allKeys = await adapter.keys("anchor:")
    for (const key of allKeys) {
      if (key === SCHEMA_VERSION_KEY) continue
      await adapter.removeItem(key)
    }
  } else if (adapter.clear) {
    await adapter.clear()
  }

  // Store the new version
  await adapter.setItem(SCHEMA_VERSION_KEY, currentVersion)

  return { versionChanged: true, previousVersion: stored }
}

/**
 * Read the currently stored schema version.
 */
export async function getSchemaVersion(
  adapter: PersistenceAdapter,
): Promise<number | null> {
  return adapter.getItem<number>(SCHEMA_VERSION_KEY)
}

/**
 * Manually set the schema version without clearing cache.
 */
export async function setSchemaVersion(
  adapter: PersistenceAdapter,
  version: number,
): Promise<void> {
  await adapter.setItem(SCHEMA_VERSION_KEY, version)
}

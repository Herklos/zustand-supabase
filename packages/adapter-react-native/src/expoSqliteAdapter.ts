import type { PersistenceAdapter } from "anchor/persistence"

/**
 * React Native persistence adapter using expo-sqlite.
 * Stores data as JSON in a key-value table.
 *
 * Requires `expo-sqlite` as a peer dependency.
 */
export class ExpoSqliteAdapter implements PersistenceAdapter {
  private db: any // SQLiteDatabase

  constructor(dbName = "anchor") {
    // Dynamic import to avoid bundling expo-sqlite in web builds
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SQLite = require("expo-sqlite")
      this.db = SQLite.openDatabaseSync(dbName)
      this.db.execSync(
        "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)",
      )
    } catch {
      throw new Error(
        "expo-sqlite is required for ExpoSqliteAdapter. Install with: npx expo install expo-sqlite",
      )
    }
  }

  async getItem<T>(key: string): Promise<T | null> {
    const row = this.db.getFirstSync(
      "SELECT value FROM kv WHERE key = ?",
      [key],
    )
    if (!row?.value) return null
    try {
      return JSON.parse(row.value) as T
    } catch (err) {
      console.warn(`[zs:expoSqlite] Failed to parse data for key "${key}":`, err)
      return null
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    this.db.runSync(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      [key, JSON.stringify(value)],
    )
  }

  async removeItem(key: string): Promise<void> {
    this.db.runSync("DELETE FROM kv WHERE key = ?", [key])
  }

  async multiSet(entries: [string, unknown][]): Promise<void> {
    this.db.withTransactionSync(() => {
      for (const [key, value] of entries) {
        this.db.runSync(
          "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
          [key, JSON.stringify(value)],
        )
      }
    })
  }

  async keys(prefix?: string): Promise<string[]> {
    const rows = prefix
      ? this.db.getAllSync("SELECT key FROM kv WHERE key LIKE ?", [
          `${prefix}%`,
        ])
      : this.db.getAllSync("SELECT key FROM kv")
    return rows.map((r: any) => r.key as string)
  }

  async clear(): Promise<void> {
    this.db.runSync("DELETE FROM kv WHERE key LIKE 'zs:%'")
  }
}

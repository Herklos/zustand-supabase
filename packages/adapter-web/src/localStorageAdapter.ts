import type { PersistenceAdapter } from "@drakkar.software/anchor/persistence"

/**
 * Web localStorage adapter. Good for small datasets (<5MB).
 */
export class LocalStorageAdapter implements PersistenceAdapter {
  async getItem<T>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : null
    } catch (err) {
      console.warn(`[anchor:localStorage] Failed to parse data for key "${key}":`, err)
      return null
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (err) {
      throw new Error(
        `Failed to persist data for key "${key}": ${err instanceof Error ? err.message : String(err)}. Consider using IndexedDBAdapter for larger datasets.`,
      )
    }
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key)
  }

  async multiSet(entries: [string, unknown][]): Promise<void> {
    for (const [key, value] of entries) {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch (err) {
        throw new Error(
          `Failed to persist data for key "${key}" during multiSet: ${err instanceof Error ? err.message : String(err)}. Consider using IndexedDBAdapter for larger datasets.`,
        )
      }
    }
  }

  async keys(prefix?: string): Promise<string[]> {
    const allKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) allKeys.push(key)
    }
    if (!prefix) return allKeys
    return allKeys.filter((k) => k.startsWith(prefix))
  }

  async clear(): Promise<void> {
    const zsKeys = await this.keys("anchor:")
    for (const key of zsKeys) {
      localStorage.removeItem(key)
    }
  }
}

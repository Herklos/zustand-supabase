import type { PersistenceAdapter } from "@drakkar.software/anchor/persistence"

/**
 * React Native persistence adapter using @react-native-async-storage/async-storage.
 * Simple key-value storage, good for smaller datasets.
 *
 * Requires `@react-native-async-storage/async-storage` as a peer dependency.
 */
export class AsyncStorageAdapter implements PersistenceAdapter {
  private storage: any // AsyncStorageStatic

  constructor() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.storage =
        require("@react-native-async-storage/async-storage").default
    } catch {
      throw new Error(
        "@react-native-async-storage/async-storage is required. Install with: npx expo install @react-native-async-storage/async-storage",
      )
    }
  }

  async getItem<T>(key: string): Promise<T | null> {
    const raw = await this.storage.getItem(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch (err) {
      console.warn(`[anchor:asyncStorage] Failed to parse data for key "${key}":`, err)
      return null
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    await this.storage.setItem(key, JSON.stringify(value))
  }

  async removeItem(key: string): Promise<void> {
    await this.storage.removeItem(key)
  }

  async multiSet(entries: [string, unknown][]): Promise<void> {
    const pairs = entries.map(
      ([key, value]) => [key, JSON.stringify(value)] as [string, string],
    )
    await this.storage.multiSet(pairs)
  }

  async keys(prefix?: string): Promise<string[]> {
    const allKeys: string[] = await this.storage.getAllKeys()
    if (!prefix) return allKeys
    return allKeys.filter((k: string) => k.startsWith(prefix))
  }

  async clear(): Promise<void> {
    const zsKeys = await this.keys("anchor:")
    if (zsKeys.length > 0) {
      await this.storage.multiRemove(zsKeys)
    }
  }
}

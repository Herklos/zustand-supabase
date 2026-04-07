import type { PersistenceAdapter } from "zustand-supabase/persistence"

const DB_NAME = "zustand-supabase"
const STORE_NAME = "kv"
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  const transaction = db.transaction(STORE_NAME, mode)
  return transaction.objectStore(STORE_NAME)
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Web IndexedDB adapter. Good for large datasets.
 */
export class IndexedDBAdapter implements PersistenceAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB()
    }
    return this.dbPromise
  }

  async getItem<T>(key: string): Promise<T | null> {
    const db = await this.getDB()
    const store = tx(db, "readonly")
    const result = await promisify(store.get(key))
    return (result as T) ?? null
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    const db = await this.getDB()
    const store = tx(db, "readwrite")
    await promisify(store.put(value, key))
  }

  async removeItem(key: string): Promise<void> {
    const db = await this.getDB()
    const store = tx(db, "readwrite")
    await promisify(store.delete(key))
  }

  async multiSet(entries: [string, unknown][]): Promise<void> {
    const db = await this.getDB()
    const transaction = db.transaction(STORE_NAME, "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    for (const [key, value] of entries) {
      store.put(value, key)
    }
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  async keys(prefix?: string): Promise<string[]> {
    const db = await this.getDB()
    const store = tx(db, "readonly")
    const allKeys = (await promisify(store.getAllKeys())) as string[]
    if (!prefix) return allKeys
    return allKeys.filter((k) => k.startsWith(prefix))
  }

  async clear(): Promise<void> {
    const db = await this.getDB()
    const store = tx(db, "readwrite")
    await promisify(store.clear())
  }
}

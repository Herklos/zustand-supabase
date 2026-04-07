/**
 * Example: Setting up zustand-supabase stores for a Todo app.
 *
 * This file creates typed stores for all tables with:
 * - Offline-first persistence (localStorage)
 * - Realtime subscriptions
 * - Network status detection
 * - Redux DevTools integration
 * - Custom extensions (computed values + actions)
 */
import { createClient } from "@supabase/supabase-js"
import {
  createSupabaseStores,
  createTableStore,
  setupAuthGate,
  isPending,
  eq,
} from "zustand-supabase"
import { LocalStorageAdapter, WebNetworkStatus } from "zustand-supabase-adapter-web"
import type { Database } from "./database.types"

// ─── Supabase Client ─────────────────────────────────────────────────

const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// ─── Option A: Quick setup with createSupabaseStores ─────────────────

export const stores = createSupabaseStores<Database>({
  supabase,
  tables: ["todos", "profiles"],
  persistence: { adapter: new LocalStorageAdapter() },
  network: new WebNetworkStatus(),
  realtime: { enabled: true },
  devtools: import.meta.env.DEV,
  tableOptions: {
    todos: {
      defaultSort: [{ column: "created_at", ascending: false }],
      realtime: { events: ["INSERT", "UPDATE", "DELETE"] },
    },
    profiles: {
      realtime: { enabled: false },
    },
  },
})

// Set up auth-gated stores: clear on sign-out, refetch on sign-in
setupAuthGate(supabase, stores.auth, [stores.todos, stores.profiles], {
  clearOnSignOut: true,
  refetchOnSignIn: true,
})

// ─── Option B: Single store with extensions ──────────────────────────

type TodoRow = Database["public"]["Tables"]["todos"]["Row"]
type TodoInsert = Database["public"]["Tables"]["todos"]["Insert"]
type TodoUpdate = Database["public"]["Tables"]["todos"]["Update"]

type TodoExtensions = {
  completedCount: () => number
  pendingCount: () => number
  toggleComplete: (id: string) => Promise<void>
  clearCompleted: () => Promise<void>
}

export const todosStore = createTableStore<
  Database,
  TodoRow,
  TodoInsert,
  TodoUpdate,
  TodoExtensions
>({
  supabase,
  table: "todos",
  primaryKey: "id",
  defaultSort: [{ column: "created_at", ascending: false }],
  persistence: { adapter: new LocalStorageAdapter() },
  // Note: realtime, conflict, network, and offlineQueue options require
  // createSupabaseStores(). For standalone stores, use manual setup with
  // RealtimeManager + bindRealtimeToStore, or use createSupabaseStores above.
  devtools: { name: "todos" },
  crossTab: { enabled: true },
  validate: {
    insert: (data) =>
      data.title && data.title.length > 0
        ? true
        : ["Title is required"],
  },
  extend: (_set, get, _store, _supabase) => ({
    completedCount: () =>
      [...get().records.values()].filter((t) => t.completed).length,

    pendingCount: () =>
      [...get().records.values()].filter((t) => isPending(t)).length,

    toggleComplete: async (id: string) => {
      const todo = get().records.get(id)
      if (todo) {
        await get().update(id, { completed: !todo.completed })
      }
    },

    clearCompleted: async () => {
      const completed = [...get().records.entries()].filter(
        ([, t]) => t.completed,
      )
      for (const [id] of completed) {
        await get().remove(id)
      }
    },
  }),
})

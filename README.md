<p align="center">
  <img src="assets/logo.png" alt="zustand-supabase" width="200" />
</p>

<h1 align="center">zustand-supabase</h1>

<p align="center">Type-safe Zustand stores auto-generated from your Supabase schema. Offline-first, realtime, with optimistic updates.</p>

## Features

- **Auto-generated stores** from Supabase `Database` types
- **Optimistic mutations** with automatic rollback on failure
- **Offline-first** with persistent mutation queue and auto-flush
- **Realtime** subscriptions with pending-mutation protection
- **Type-safe** — filters, mutations, and hooks fully typed from your schema
- **Platform adapters** — Web (localStorage/IndexedDB) and React Native (expo-sqlite/AsyncStorage)
- **Cross-tab sync** via BroadcastChannel
- **Auth integration** with session-gated stores and RLS awareness
- **React Suspense** and **Server Components** support
- **Storage & Edge Functions** — full Supabase feature coverage
- **Cursor pagination**, **incremental sync**, **cache TTL**

## Installation

```bash
npm install zustand-supabase zustand @supabase/supabase-js
# Web adapters
npm install zustand-supabase-adapter-web
# React Native adapters
npm install zustand-supabase-adapter-react-native
```

## Quick Start

### 1. Generate types from your Supabase schema

```bash
npx supabase gen types typescript --project-id $PROJECT_REF > database.types.ts
```

### 2. Create stores for all tables

```typescript
import { createClient } from '@supabase/supabase-js'
import { createSupabaseStores } from 'zustand-supabase'
import { LocalStorageAdapter, WebNetworkStatus } from 'zustand-supabase-adapter-web'
import type { Database } from './database.types'

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
)

export const stores = createSupabaseStores<Database>({
  supabase,
  tables: ['todos', 'profiles'],
  persistence: { adapter: new LocalStorageAdapter() },
  network: new WebNetworkStatus(),
  realtime: { enabled: true },
  devtools: process.env.NODE_ENV === 'development',
})
```

### 3. Use in React components

```tsx
import { useQuery, useMutation, eq } from 'zustand-supabase'

function TodoList() {
  const { data, isLoading } = useQuery(stores.todos, {
    filters: [eq('completed', false)],
  })
  const { insert, remove } = useMutation(stores.todos)

  if (isLoading) return <div>Loading...</div>

  return (
    <ul>
      {data.map(todo => (
        <li key={todo.id}>
          {todo.title}
          {todo._zs_pending && <span> (saving...)</span>}
          <button onClick={() => remove(todo.id)}>Delete</button>
        </li>
      ))}
      <button onClick={() => insert({ title: 'New todo' })}>
        Add Todo
      </button>
    </ul>
  )
}
```

## API Reference

### Store Factories

#### `createTableStore(options)`

Creates a Zustand store for a single Supabase table.

```typescript
const todosStore = createTableStore<Database, TodoRow, TodoInsert, TodoUpdate>({
  supabase,
  table: 'todos',
  primaryKey: 'id',                    // default: 'id'
  schema: 'public',                    // default: 'public'
  defaultSort: [{ column: 'created_at', ascending: false }],
  persistence: { adapter: new LocalStorageAdapter() },
  devtools: true,
  crossTab: { enabled: true },
  validate: {
    insert: (data) => data.title?.length > 0 ? true : ['Title required'],
    update: (data) => true,
  },
  extend: (set, get, store, supabase) => ({
    completedCount: () =>
      [...get().records.values()].filter(t => t.completed).length,
    toggleComplete: async (id: number) => {
      const current = get().records.get(id)
      if (current) await get().update(id, { completed: !current.completed })
    },
  }),
})
```

> **Note:** `realtime`, `conflict`, `network`, and `offlineQueue` options require `createSupabaseStores()` which wires up the shared RealtimeManager and OfflineQueue. Use `createSupabaseStores()` for full-featured stores, or manually set up these features with `RealtimeManager`, `bindRealtimeToStore`, and `OfflineQueue`.

#### `createSupabaseStores(options)`

Creates typed stores for multiple tables at once.

```typescript
const stores = createSupabaseStores<Database>({
  supabase,
  tables: ['todos', 'profiles', 'comments'],
  persistence: { adapter: new LocalStorageAdapter() },
  realtime: { enabled: true },
  tableOptions: {
    todos: { defaultSort: [{ column: 'created_at', ascending: false }] },
    profiles: { realtime: { enabled: false } },
  },
})

// Fully typed:
stores.todos.getState().insert({ title: 'Buy milk' })
stores.profiles.getState().fetch()
stores._destroy() // Clean up all subscriptions
```

#### `createViewStore(options)`

Creates a read-only store for database views. Mutations throw an error.

```typescript
const statsStore = createViewStore<Database, StatsRow>({
  supabase,
  view: 'dashboard_stats',
})

const stats = await statsStore.getState().fetch()
// statsStore.getState().insert({}) // Throws: "Cannot mutate view"
```

### Store Actions

Every table store provides these actions:

| Action | Description |
|--------|-------------|
| `fetch(options?)` | Fetch rows from Supabase with filters/sort/pagination |
| `fetchOne(id)` | Fetch a single row by primary key |
| `refetch()` | Re-run the last fetch |
| `insert(row)` | Insert a row (optimistic) |
| `insertMany(rows)` | Batch insert (single HTTP request) |
| `update(id, changes)` | Update a row (optimistic with rollback) |
| `upsert(row)` | Insert or update (optimistic with rollback) |
| `remove(id)` | Delete a row (optimistic with rollback) |
| `subscribe(filter?)` | Subscribe to realtime changes |
| `hydrate()` | Load from local persistence |
| `flushQueue()` | Flush the offline mutation queue |
| `getQueueSize()` | Number of pending mutations |
| `clearAll()` | Clear all records |
| `mergeRecords(rows)` | Merge remote rows (skip pending) |

### Hooks

#### `useQuery(store, options?)`

Declarative data fetching with auto-refetch.

```tsx
const { data, isLoading, error, refetch, isHydrated } = useQuery(
  stores.todos,
  {
    filters: [eq('completed', false)],
    sort: [{ column: 'created_at', ascending: false }],
    limit: 20,
    enabled: true,           // Toggle fetching
    deps: [statusFilter],    // Refetch when deps change
    refetchInterval: 30000,  // Auto-refetch every 30s
  },
)
```

#### `useMutation(store)`

Type-safe mutations with loading/error tracking.

```tsx
const { insert, update, upsert, remove, isLoading, error } = useMutation(stores.todos)

await insert({ title: 'New todo', completed: false })
await update(1, { completed: true })
await remove(1)
```

#### `useSuspenseQuery(store, options?)`

React Suspense-compatible query. Throws promise while loading.

```tsx
function TodoList() {
  const data = useSuspenseQuery(stores.todos)
  return <ul>{data.map(t => <li key={t.id}>{t.title}</li>)}</ul>
}

// Wrap in Suspense boundary
<Suspense fallback={<Spinner />}>
  <TodoList />
</Suspense>
```

#### `useAuth(authStore)`

Auth state with automatic session listener.

```tsx
const { session, user, isLoading, signIn, signOut } = useAuth(stores.auth)

await signIn({ email: 'user@example.com', password: 'secret' })
```

#### `useRealtime(store, options?)`

Manages realtime subscription lifecycle.

```tsx
const { status } = useRealtime(stores.todos)
// status: 'disconnected' | 'connecting' | 'connected' | 'error'
```

#### `useRpc(supabase, functionName, args?, options?)`

Call Postgres functions.

```tsx
const { data, isLoading, error, refetch } = useRpc<Stats>(
  supabase, 'get_dashboard_stats', { user_id: '123' },
)
```

#### `useEdgeFunction(supabase, functionName)`

Invoke Supabase Edge Functions.

```tsx
const { data, isLoading, invoke } = useEdgeFunction<Response>(supabase, 'send-email')
await invoke({ body: { to: 'user@example.com', subject: 'Hello' } })
```

#### `useStorage(supabase, bucket)`

Supabase Storage operations.

```tsx
const { upload, download, getPublicUrl, list, remove, isLoading } = useStorage(supabase, 'avatars')

await upload('user-123.png', file, { upsert: true })
const url = getPublicUrl('user-123.png')
```

### Filters

Type-safe filter DSL matching Supabase's PostgREST operators:

```typescript
import {
  eq, neq, gt, gte, lt, lte,
  like, ilike, is, inValues,
  contains, containedBy, overlaps, textSearch,
  match, asc, desc,
} from 'zustand-supabase'

// Comparison
eq('status', 'active')
neq('status', 'archived')
gt('priority', 3)
gte('priority', 3)
lt('priority', 10)
lte('priority', 10)

// Pattern matching
like('title', '%milk%')         // case-sensitive
ilike('title', '%milk%')        // case-insensitive

// Null/boolean check
is('deleted_at', null)

// Array/set operations
inValues('category', ['work', 'personal'])
contains('tags', ['urgent'])
containedBy('tags', ['urgent', 'important'])
overlaps('tags', ['urgent'])

// Full-text search
textSearch('body', 'hello & world', { type: 'websearch' })

// Match shorthand (multiple eq)
match({ status: 'active', priority: 1 })

// Advanced: not and filter with custom operator
// These accept { op, value } objects for the inner operator
{ column: 'status', op: 'not', value: { op: 'eq', value: 'archived' } }
{ column: 'priority', op: 'filter', value: { op: 'gt', value: 3 } }
```

### Fluent Query Builder

Alternative to filter arrays:

```typescript
import { query } from 'zustand-supabase'

const result = await store.getState().fetch(
  query<Todo>()
    .where('status').eq('active')
    .where('priority').gte(3)
    .orderBy('created_at', 'desc')
    .limit(20)
    .build()
)
```

### Cursor Pagination

Efficient keyset pagination for large datasets:

```typescript
import { buildCursorQuery, processCursorResults } from 'zustand-supabase'

const { filters, sort, limit } = buildCursorQuery<Todo>({
  cursorColumn: 'created_at',
  pageSize: 20,
  cursor: lastItem?.created_at,
  direction: 'forward',
})

const rows = await store.getState().fetch({ filters, sort, limit })
const { data, pagination } = processCursorResults(rows, { cursorColumn: 'created_at', pageSize: 20 })
// pagination.hasNextPage, pagination.cursor
```

### Offline-First

Mutations are queued when offline and automatically flushed on reconnect:

```typescript
const stores = createSupabaseStores<Database>({
  supabase,
  tables: ['todos'],
  persistence: { adapter: new LocalStorageAdapter() },
  network: new WebNetworkStatus(),
})

// Works offline — mutation is queued
await stores.todos.getState().insert({ title: 'Offline todo' })

// Queue status
stores.todos.getState().getQueueSize() // 1

// Manual flush
await stores.todos.getState().flushQueue()
```

The queue supports:
- **Coalescing** — insert+update becomes single insert; insert+delete cancels both
- **Dependency tracking** — `dependsOn` field ensures parent mutations complete before children
- **Exponential backoff** — retries with `base * 2^attempt + jitter`
- **Rollback** — permanent failures restore the original state

### Conflict Resolution

Five built-in strategies, configurable per table:

```typescript
import { remoteWins, localWins, lastWriteWins, fieldLevelMerge } from 'zustand-supabase'

createTableStore({
  // ...
  conflict: {
    strategy: 'last-write-wins',
    timestampColumn: 'updated_at',
  },
})

// Or field-level merge:
createTableStore({
  // ...
  conflict: {
    strategy: 'field-merge',
    serverOwnedFields: ['computed_score'],  // Always use server value
    clientOwnedFields: ['draft_content'],   // Always use local value
  },
})

// Or custom resolver:
createTableStore({
  // ...
  conflict: {
    strategy: 'custom',
    resolver: (local, remote, context) => ({
      ...remote,
      title: local.title,  // Keep local title, use remote for rest
    }),
  },
})
```

### Validation

Validate data before mutations:

```typescript
import { zodValidator } from 'zustand-supabase'
import { z } from 'zod'

const todoSchema = z.object({
  title: z.string().min(1, 'Title required'),
  completed: z.boolean(),
})

createTableStore({
  // ...
  validate: {
    insert: zodValidator(todoSchema),
    update: zodValidator(todoSchema.partial()),
  },
})
```

### Concurrency Safety

The library handles concurrent operations safely:

- **Concurrent fetch()**: Uses a generation counter — stale responses from superseded fetches are discarded automatically
- **Concurrent mutations**: Uses compare-and-swap (CAS) rollback with `_zs_mutationId` — a failed update only rolls back if its own optimistic write is still current, preventing it from destroying a concurrent successful mutation's data
- **Realtime during mutations**: Rows with `_zs_pending` metadata are protected from being overwritten by realtime INSERT/UPDATE/DELETE events
- **Cross-tab sync**: Pending optimistic rows are preserved when receiving state from other tabs
- **Offline queue**: Flush uses a `flushing` guard to prevent concurrent execution, and in-place pruning preserves mutations enqueued during a flush

### Auth Integration

Session-gated stores with automatic clear/refetch:

```typescript
import { setupAuthGate, isRlsError } from 'zustand-supabase'

const cleanup = setupAuthGate(supabase, stores.auth, [stores.todos, stores.profiles], {
  clearOnSignOut: true,    // Clear all stores when user signs out
  refetchOnSignIn: true,   // Refetch all stores when user signs in
})
```

### Incremental Sync

Delta fetch — only get rows changed since last sync:

```typescript
import { incrementalSync } from 'zustand-supabase'

const { fetchedCount, mergedCount } = await incrementalSync(
  supabase, 'todos', 'id', stores.todos,
  { timestampColumn: 'updated_at' },
)
```

### Cache TTL

Stale-while-revalidate pattern:

```typescript
import { fetchWithSwr, setupAutoRevalidation, isStale } from 'zustand-supabase'

// Serve stale data, refetch in background
await fetchWithSwr(stores.todos, { staleTTL: 5 * 60 * 1000 })

// Auto-revalidate every minute
const cleanup = setupAutoRevalidation(stores.todos, {
  staleTTL: 5 * 60 * 1000,
  checkInterval: 60 * 1000,
})
```

### Cross-Tab Sync

State changes sync across browser tabs:

```typescript
import { setupCrossTabSync } from 'zustand-supabase'

const cleanup = setupCrossTabSync(store, 'todos')
// Uses BroadcastChannel, falls back to localStorage events
```

Or enable via store options:

```typescript
createTableStore({
  // ...
  crossTab: { enabled: true },
})
```

### Storage

Full Supabase Storage support:

```typescript
import { createStorageActions } from 'zustand-supabase'

const avatars = createStorageActions(supabase, 'avatars')

await avatars.upload('user-123.png', file, { upsert: true })
const url = avatars.getPublicUrl('user-123.png')
const { signedUrl } = await avatars.createSignedUrl('private/doc.pdf', { expiresIn: 3600 })
const files = await avatars.list('uploads/')
await avatars.remove(['old-file.png'])
```

### Edge Functions

```typescript
import { createEdgeFunctionAction } from 'zustand-supabase'

const sendEmail = createEdgeFunctionAction<{ success: boolean }>(supabase, 'send-email')
const result = await sendEmail({ body: { to: 'user@example.com', subject: 'Hello' } })
```

### RPC (Postgres Functions)

```typescript
import { createRpcAction } from 'zustand-supabase'

const getStats = createRpcAction<DashboardStats>(supabase, 'get_dashboard_stats')
const { data, error } = await getStats({ user_id: '123' })
```

### Server Components (RSC)

Server-side prefetch for React Server Components:

```tsx
// app/todos/page.tsx (Server Component)
import { prefetch } from 'zustand-supabase'

export default async function TodosPage() {
  const { data } = await prefetch<Todo>(supabase, 'todos', {
    sort: [{ column: 'created_at', ascending: false }],
    limit: 50,
  })

  return <TodoList initialData={data} />
}
```

### Platform Adapters

#### Web

```typescript
import { LocalStorageAdapter, IndexedDBAdapter, WebNetworkStatus } from 'zustand-supabase-adapter-web'

// Small datasets (<5MB)
new LocalStorageAdapter()

// Large datasets
new IndexedDBAdapter()

// Network detection
new WebNetworkStatus()
```

#### React Native

```typescript
import { ExpoSqliteAdapter, AsyncStorageAdapter, RNNetworkStatus } from 'zustand-supabase-adapter-react-native'

// Structured (recommended)
new ExpoSqliteAdapter()

// Simple fallback
new AsyncStorageAdapter()

// Network detection
new RNNetworkStatus()
```

### Middleware

#### Devtools

```typescript
createTableStore({
  // ...
  devtools: true,
  // or with custom name:
  devtools: { name: 'todos-store' },
})
```

#### Immer

```typescript
import { immer } from 'zustand/middleware/immer'

createTableStore({
  // ...
  immer, // Pass the middleware function
})
```

## Packages

| Package | Description |
|---------|-------------|
| `zustand-supabase` | Core library |
| `zustand-supabase-adapter-web` | Web: localStorage, IndexedDB, WebNetworkStatus |
| `zustand-supabase-adapter-react-native` | React Native: expo-sqlite, AsyncStorage, NetInfo |

## Tree-Shakeable Imports

```typescript
// Full API
import { createTableStore, useQuery, eq } from 'zustand-supabase'

// Hooks only
import { useQuery, useMutation } from 'zustand-supabase/hooks'

// Query builder only
import { query, QueryBuilder } from 'zustand-supabase/query/queryBuilder'

// Server-only (no React dependency)
import { prefetch } from 'zustand-supabase/server/prefetch'

// Storage only
import { createStorageActions } from 'zustand-supabase/storage/storageActions'
```

## Requirements

- **zustand** >= 4.5.0
- **@supabase/supabase-js** >= 2.0.0
- **TypeScript** >= 5.0 (recommended)
- **React** >= 18.0 (optional, for hooks)
- **immer** (optional, for draft-based mutations)

## License

MIT

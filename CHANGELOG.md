# Changelog

## [1.0.0] - 2026-04-07

### Core

- **Store-per-table architecture**: Auto-generate typed Zustand stores from Supabase Database schema via `createTableStore()` and `createSupabaseStores()`
- **Normalized state**: Records stored as `Map<PK, TrackedRow>` with separate `order` array preserving query ordering
- **Full TypeScript support**: End-to-end type safety from Database schema to store actions — `TableRow`, `TableInsert`, `TableUpdate` extracted automatically
- **Middleware composition**: `immer` -> `devtools` -> `subscribeWithSelector` middleware chain with opt-in per feature
- **Store extensions**: `extend()` callback for adding computed values and custom actions to any store
- **View mode**: `isView: true` disables all mutations, ideal for read-only dashboards

### Offline-First

- **Persistent offline queue**: FIFO mutation queue with automatic persistence, coalescing (INSERT+UPDATE -> INSERT, INSERT+DELETE -> remove both), and `dependsOn` dependency enforcement
- **Exponential backoff with jitter**: Failed mutations retry with configurable backoff (`retryBaseDelay`, `maxRetries`)
- **Optimistic mutations**: All mutations (insert, insertMany, update, upsert, remove) apply optimistically with snapshot-based rollback
- **Compare-and-swap rollback**: `_zs_mutationId` on optimistic rows ensures rollback only reverts the originating mutation, not concurrent writes
- **Fetch generation counter**: Stale fetch responses are automatically discarded when a newer fetch is in progress
- **Pending mutation protection**: External data merges (realtime, cross-tab, fetch, incremental sync) never overwrite rows with `_zs_pending` metadata
- **Temp ID resolution**: Temporary client-generated IDs are resolved to server IDs after INSERT, with mappings persisted across flushes for dependent mutations
- **Network-aware auto-flush**: Queue automatically flushes when network comes online via `NetworkStatusAdapter`

### Realtime

- **Realtime subscriptions**: `RealtimeManager` manages Supabase `postgres_changes` channel lifecycle with status tracking
- **Store bindings**: `bindRealtimeToStore()` wires INSERT/UPDATE/DELETE events to store state with pending mutation protection
- **Conflict resolution**: Configurable strategies — `server-wins`, `client-wins`, `last-write-wins`, `field-merge`, `custom`
- **ConflictContext**: Custom resolvers receive table, primary key, and actual pending mutations from the offline queue

### Persistence

- **Platform-agnostic adapters**: `PersistenceAdapter` interface with `MemoryAdapter` (core), `LocalStorageAdapter` (web), `IndexedDBAdapter` (web), and React Native adapters
- **Debounced writes**: Persistence writes are debounced (100ms) to avoid excessive serialization during rapid mutations
- **Auto-hydration**: Stores automatically hydrate from persistence on creation with `isHydrated` / `isRestoring` status tracking
- **Error surfacing**: Persistence failures are surfaced to the store's `error` state

### Sync

- **Cross-tab synchronization**: `BroadcastChannel` with `localStorage` fallback for multi-tab state sync
- **Auth session isolation**: Cross-tab sync supports `sessionId` to prevent data leaking between tabs with different users
- **Hydration guard**: Cross-tab messages are ignored while a store is hydrating from persistence
- **Incremental sync**: Delta sync via `updated_at > lastSyncAt` with NULL timestamp handling and conflict resolution support
- **Stale-while-revalidate**: `fetchWithSwr()` returns cached data immediately while fetching fresh data in background
- **Auto-revalidation**: `setupAutoRevalidation()` with configurable TTL intervals

### Query

- **Filter DSL**: Type-safe `eq()`, `neq()`, `gt()`, `gte()`, `lt()`, `lte()`, `like()`, `ilike()`, `is()`, `in()`, `contains()`, `overlaps()`, `textSearch()`, `match()`, `not()`, `or()`, `filter()`
- **Fluent query builder**: `query<T>().where('col').eq(val).orderBy('col').limit(n).build()`
- **Cursor-based pagination**: `buildCursorQuery()` + `processCursorResults()` for keyset pagination
- **Schema support**: `fromTable()` helper enables non-public schema queries
- **Fetch truncation warning**: Logs warning when Supabase's default row limit truncates results

### Mutations

- **Batch operations**: `updateMany()` and `removeMany()` with optimistic apply and CAS rollback
- **Validation**: `validate.insert` / `validate.update` callbacks with `zodValidator()` helper for schema validation
- **Composite key utilities**: `encodeKey()` / `buildPkFilter()` / `applyPkFilters()` for multi-column primary keys

### Auth

- **Auth store**: `createAuthStore()` with `signIn`, `signUp`, `signOut`, `signInWithOAuth`, `refreshSession`
- **Auth gate**: `setupAuthGate()` clears stores on sign-out, refetches on sign-in, with `isRlsError()` detection

### React Hooks

- **`useQuery`**: Declarative data fetching with auto-refetch on filter/sort/deps changes and configurable polling
- **`useSuspenseQuery`**: React Suspense-compatible hook with 30s cache timeout safety
- **`useRealtime`**: Manages subscription lifecycle with proper filter change resubscription
- **`useAuth`**: Auth state and actions with stable memoized references
- **`useOptimistic`**: Selector for pending/optimistic records
- **`useStorage`**: Supabase Storage operations (upload, download, list, remove)
- **`useRpc`**: Postgres RPC calls with loading/error state

### Server

- **RSC prefetch**: `prefetchTable()` for server-side data loading with `serializePrefetchResult()` / `deserializePrefetchResult()`

### Supabase Features

- **Storage**: `createStorageActions()` for upload, download, getPublicUrl, createSignedUrl, list, remove
- **Edge Functions**: `invokeEdgeFunction()` and `createEdgeFunctionAction()`
- **RPC**: `callRpc()` and `createRpcAction()`

### Platform Adapters

- **`zustand-supabase-adapter-web`**: `LocalStorageAdapter`, `IndexedDBAdapter`, `WebNetworkStatus`
- **`zustand-supabase-adapter-react-native`**: `AsyncStorageAdapter`, `ExpoSQLiteAdapter`, `RNNetworkStatus`

### Developer Experience

- **Redux DevTools**: Opt-in DevTools integration via `devtools` option
- **SyncLogger**: Pluggable logging interface with `consoleLogger` and `noopLogger` presets
- **Tree-shakeable**: 16 entry points with conditional exports for minimal bundle size
- **204 tests across 27 files**: Comprehensive test coverage for all features

### Testing

- 204 tests across 27 test files
- Mock Supabase client for unit testing
- `MemoryAdapter` for persistence testing
- Tests for cross-tab sync (hydration guard, auth isolation, pending row preservation)
- Tests for fetch exception recovery and persistence debouncing

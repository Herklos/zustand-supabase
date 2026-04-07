# Changelog

## [1.1.2] - 2026-04-07

### Linked Queries

- **`useLinkedQuery()` hook**: Custom async query that auto-refetches when linked store(s) mutate — bridges custom Supabase queries (joins, complex selects) with optimistic store updates

## [1.1.1] - 2026-04-07

### Performance

- **Stale-while-revalidate fetch**: `fetch()` no longer sets `isLoading: true` when the store already has cached data — hydrated/persisted records display instantly while a background refresh happens
- **In-flight fetch deduplication**: When multiple components call `fetch()` on the same store simultaneously, only one network request fires — subsequent calls return the same in-flight promise
- **Configurable staleTime**: `useQuery` accepts `staleTime` option (default 5s) — skips fetching if the store was fetched within this window, preventing redundant requests across page navigations

## [1.1.0] - 2026-04-07

### App Lifecycle Management

- **`AppLifecycleAdapter` interface**: Platform-agnostic foreground/background detection
- **`setupAppLifecycle()`**: Wires lifecycle events to store operations — auto-flushes offline queue, refreshes auth session, revalidates stale data on foreground; pauses/resumes realtime subscriptions on background
- **`useAppLifecycle()` hook**: React hook wrapping `setupAppLifecycle` with cleanup
- **`WebAppLifecycle`**: Web adapter using Page Visibility API (`document.visibilitychange`)
- **`RNAppLifecycle`**: React Native adapter using `AppState` API

### Background Sync

- **`BackgroundTaskAdapter` interface**: Platform-agnostic background task registration
- **`setupBackgroundSync()`**: Registers a background task to flush the offline mutation queue when the app is backgrounded
- **`RNBackgroundSync`**: React Native adapter using `expo-task-manager` and `expo-background-fetch`

### OAuth / Deep Link Helpers

- **`createExpoOAuthHandler()`**: Expo/React Native OAuth handler with deep link URL construction, PKCE code exchange, and implicit flow support via `expo-linking`

### Data Encryption at Rest

- **`EncryptedAdapter`**: Transparent encryption wrapper for any `PersistenceAdapter` — encrypts values on write, decrypts on read
- **`createWebCryptoEncryption()`**: AES-GCM encryption using Web Crypto API

### Storage Quota Management

- **`StorageQuotaManager`**: Monitor storage usage (`getUsage`), set per-table record limits (`setTableLimit` / `enforceLimit`), evict oldest entries (`evictByCount`)
- **`useStorageQuota()` hook**: Reactive storage usage monitoring with auto-refresh

### Selective / Partial Sync

- **`selectiveSync()`**: Incremental sync with user-defined filter criteria
- **`syncAllByPriority()`**: Fetch multiple stores in priority order (lower number = higher priority)
- **`fetchPage()`**: Convenience wrapper for cursor-based pagination
- **`incrementalSync` filters**: Added optional `filters` parameter to `IncrementalSyncOptions`

### Multi-Device Sync

- **`setupMultiDeviceSync()`**: Sync store state across devices via Supabase Realtime broadcast channel with delta-only broadcasts, per-table debouncing, conflict resolution, and pending mutation protection

### Sync Health Monitoring

- **`SyncMetrics`**: `SyncLogger` implementation that tracks fetch/mutation counts, latencies (p50/p95/p99), error rates, queue flush counts, conflict counts, and realtime event counts with cached percentile computation
- **`useSyncMetrics()` hook**: Reactive metrics snapshot via subscription

### Conflict Audit Trail

- **`ConflictAuditLog`**: Records conflict resolution events with table, row ID, strategy, local/remote/resolved values; filterable by table and timestamp
- **`useConflictNotifications()` hook**: Reactive conflict notification list with dismiss/clear
- **`resolveConflict()` audit integration**: Optional `auditLog` parameter logs all conflict resolutions

### Schema Version + Cache Invalidation

- **`checkSchemaVersion()`**: Detects schema version mismatch and clears stale cached data, letting `fetch()` repopulate from Supabase
- **`getSchemaVersion()` / `setSchemaVersion()`**: Read/write the stored schema version

### Optimistic UI Helpers

- **`useSyncStatus()` hook**: Aggregates sync status across multiple stores — returns `pendingCount`, `isSyncing`, `lastSyncedAt`, `failedCount`, and `status` (`synced` | `syncing` | `offline` | `error`)
- **`computeSyncStatus()`**: Pure function version for non-React usage
- **`useQueueStatus()` hook**: Per-store pending count and queue size
- **`usePendingChanges()` hook**: Array of pending rows with mutation type (`insert` | `update` | `delete`)

### Build & Packaging

- **CJS + ESM dual format**: All 3 packages now output both CommonJS and ESM bundles
- **9 new entry points**: `./lifecycle`, `./sync/background`, `./sync/selective`, `./sync/multiDevice`, `./sync/metrics`, `./persistence/encrypted`, `./persistence/quota`, `./persistence/schemaVersion`, `./mutation/audit`

### Testing

- 340 tests across 39 test files (up from 198 tests in 26 files)

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

### Testing

- 198 tests across 26 test files
- Mock Supabase client for unit testing
- `MemoryAdapter` for persistence testing
- Tests for cross-tab sync (hydration guard, auth isolation, pending row preservation)
- Tests for fetch exception recovery and persistence debouncing

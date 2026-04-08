# CLAUDE.md — zustand-supabase

## Project Overview

TypeScript library that binds Zustand state management to Supabase. Auto-generates stores from schema with offline-first, realtime, and optimistic updates.

**Monorepo structure:**
- `packages/core` — main library (`zustand-supabase`)
- `packages/adapter-web` — web adapters (`zustand-supabase-adapter-web`)
- `packages/adapter-react-native` — RN adapters (`zustand-supabase-adapter-react-native`)
- `examples/todo-app` — complete example app

## Build & Test Commands

```bash
# Type-check (excludes test files via tsconfig)
npx tsc --noEmit

# Run tests (198 tests, 26 files)
cd packages/core && ../../node_modules/.bin/vitest run

# Build (17 entry points, ESM + DTS)
cd packages/core && ../../node_modules/.bin/tsup

# Install deps
npm install
```

## Architecture

### Store-per-table pattern
Each Supabase table gets its own Zustand store. `createTableStore()` for single stores, `createSupabaseStores()` for bulk creation from Database type.

### Key data structures
- `records: Map<string | number, TrackedRow<Row>>` — normalized record storage
- `order: (string | number)[]` — preserves query ordering
- These MUST stay in sync — every path that modifies records must also update order

### Middleware chain
`immer → devtools → subscribeWithSelector → storeCreator` (outermost wraps first)

### Mutation pipeline
`assertNotView → runValidation → optimistic apply (with _zs_mutationId) → remote execute → confirm/rollback`

### Concurrency patterns
- **Fetch generation counter**: `fetchGeneration` increments per fetch(), stale responses discarded
- **CAS rollback**: `_zs_mutationId` on optimistic rows — rollback only if this mutation's write is still current
- **Pending protection**: `_zs_pending` rows are never overwritten by realtime, cross-tab, or fetch
- **OfflineQueue**: `flushing` boolean guard, in-place splice pruning, `dependsOn` enforcement

## Critical Invariants

1. **records/order sync**: Every `records.set(id)` must have corresponding `order.push(id)` if new. Every `records.delete(id)` must filter from order.
2. **Pending protection**: Any code merging external data (realtime, cross-tab, fetch, incrementalSync) MUST check `existing?._zs_pending` before overwriting.
3. **CAS rollback**: update/upsert/updateMany rollback MUST check `current?._zs_mutationId === mutationId` before restoring snapshot.
4. **Set vs includes**: Use `Set` for O(1) lookup in loops (insertMany, removeMany, incrementalSync). Single-row `order.includes()` is acceptable.
5. **Persistence key**: Always use `persistenceKey` (derived from `persistence.key ?? 'zs:${schema}:${table}'`) — never hardcode the key string.
6. **Error-check-first in auth**: Always check `error` before accessing `data.session`/`data.user` in auth methods.
7. **No silent catches**: Every `.catch()` must either log via SyncLogger or surface error to store state. No `.catch(() => {})` without justification.
8. **try/finally for flags**: The `flushing` flag in OfflineQueue and `receiving` flag in crossTabSync MUST use try/finally.

## Options that require createSupabaseStores()

These options in `CreateTableStoreOptions` only work via `createSupabaseStores()`:
- `realtime` — needs shared RealtimeManager + bindRealtimeToStore
- `conflict` — needs realtime bindings for conflict resolution
- `network` — needs shared NetworkStatusAdapter for auto-flush
- `offlineQueue` — needs shared OfflineQueue instance

When passed to standalone `createTableStore()`, these trigger a `console.warn`. The `_queue` internal option is how `createSupabaseStores` injects the shared queue.

## File Organization

| Directory | Purpose |
|-----------|---------|
| `src/query/` | Filter DSL, query executor, fluent builder, pagination |
| `src/mutation/` | Offline queue, mutation pipeline, conflict resolution, validation, batch ops |
| `src/realtime/` | RealtimeManager, store bindings |
| `src/auth/` | Auth store, auth gate (session-gated stores) |
| `src/persistence/` | PersistenceAdapter interface, MemoryAdapter |
| `src/network/` | NetworkStatusAdapter, ManualNetworkStatus |
| `src/hooks/` | React hooks (all have `"use client"` directive) |
| `src/sync/` | Cross-tab sync, incremental sync |
| `src/cache/` | Cache TTL, stale-while-revalidate |
| `src/storage/` | Supabase Storage operations |
| `src/functions/` | Edge Functions |
| `src/rpc/` | Postgres RPC |
| `src/server/` | RSC prefetch |
| `src/utils/` | Composite key encoding |

## Testing Conventions

- Tests live next to source: `foo.ts` → `foo.test.ts`
- Mock Supabase client in `src/__tests__/mockSupabase.ts`
- Use `MemoryAdapter` for persistence tests
- Test files excluded from tsconfig (avoids noUnusedLocals on test imports)

## Change Process

- **CHANGELOG.md must be updated** with every user-facing change (features, fixes, breaking changes, build/packaging). Add entries under the appropriate version heading before committing.
- Update `examples/todo-app` when adding new features or APIs to keep examples current.

## Common Pitfalls

- **Don't set `error: null` in confirmation `set()` calls** — it masks concurrent errors. Only clear error in the optimistic-apply step.
- **Don't restore full `order` array on rollback** — it destroys concurrent mutations. Re-insert specific rows instead.
- **Don't use `order.includes()` in loops** — use Set. Single-call is OK.
- **Don't use reference equality for echo prevention** — use boolean flags (`receiving`).
- **Composite PKs**: `createTableStore` throws at runtime for array PKs with >1 column. Use `encodeKey`/`applyPkFilters` utilities directly.
- **`fromTable()` helper**: Always use for Supabase queries to support non-public schemas.

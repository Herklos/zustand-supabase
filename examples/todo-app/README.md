# Todo App Example

A complete example demonstrating all zustand-supabase features.

## Files

| File | What it demonstrates |
|------|---------------------|
| `src/database.types.ts` | Supabase generated types (normally via `supabase gen types`) |
| `src/stores.ts` | Store setup: createSupabaseStores, createTableStore with extensions, auth gate |
| `src/App.tsx` | React app: useQuery, useMutation, useAuth, useRealtime, useSuspenseQuery, fluent query builder |
| `src/rpc-storage-example.ts` | Standalone features: RPC, Edge Functions, Storage, incremental sync, cache TTL |
| `src/server-example.tsx` | React Server Components: server-side prefetch + client hydration |

## Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Create the `todos` and `profiles` tables
3. Generate types: `npx supabase gen types typescript > src/database.types.ts`
4. Set environment variables:
   ```
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
5. Install dependencies and run

## Features Demonstrated

- **Optimistic mutations** — UI updates instantly, rolls back on failure
- **Offline support** — Mutations queue when offline, auto-flush on reconnect
- **Realtime** — Live updates from other users
- **Auth** — Sign in/out with session management
- **Validation** — Title required validation before insert
- **Cross-tab sync** — Changes sync across browser tabs
- **Conflict resolution** — Last-write-wins via `updated_at`
- **React Suspense** — Suspense-compatible data fetching
- **Fluent queries** — `query<Todo>().where('completed').eq(false).build()`
- **RPC** — Call Postgres functions
- **Edge Functions** — Invoke Supabase Edge Functions
- **Storage** — File upload/download
- **Server Components** — Server-side prefetch
- **Cache TTL** — Stale-while-revalidate pattern
- **Incremental sync** — Delta fetch since last sync

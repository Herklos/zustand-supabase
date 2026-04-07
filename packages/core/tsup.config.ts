import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "hooks/index": "src/hooks/index.ts",
    "query/filters": "src/query/filters.ts",
    "auth/authStore": "src/auth/authStore.ts",
    "realtime/realtimeManager": "src/realtime/realtimeManager.ts",
    "persistence/persistenceAdapter": "src/persistence/persistenceAdapter.ts",
    "rpc/rpcAction": "src/rpc/rpcAction.ts",
    "sync/crossTabSync": "src/sync/crossTabSync.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: [
    "zustand",
    "zustand/middleware",
    "zustand/shallow",
    "zustand/vanilla",
    "@supabase/supabase-js",
    "react",
    "immer",
  ],
})

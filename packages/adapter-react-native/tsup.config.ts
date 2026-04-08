import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    "@drakkar.software/anchor",
    "expo-sqlite",
    "@react-native-async-storage/async-storage",
    "@react-native-community/netinfo",
    "react-native",
    "expo-task-manager",
    "expo-background-fetch",
    "expo-linking",
    "@supabase/supabase-js",
  ],
})

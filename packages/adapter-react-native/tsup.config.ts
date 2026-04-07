import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    "zustand-supabase",
    "expo-sqlite",
    "@react-native-async-storage/async-storage",
    "@react-native-community/netinfo",
  ],
})

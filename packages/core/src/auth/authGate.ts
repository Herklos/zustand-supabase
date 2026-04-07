import type { StoreApi } from "zustand"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { TableStore, AuthStore } from "../types.js"

export type AuthGateOptions = {
  /** Clear all table stores on sign-out */
  clearOnSignOut?: boolean
  /** Refetch all table stores on sign-in */
  refetchOnSignIn?: boolean
  /** Custom callback when auth state changes */
  onAuthChange?: (event: string, session: unknown) => void
}

/**
 * Detect if a Supabase error is an RLS policy violation.
 */
export function isRlsError(error: Error | null): boolean {
  if (!error) return false
  const msg = error.message.toLowerCase()
  return (
    msg.includes("row-level security") ||
    msg.includes("rls") ||
    msg.includes("new row violates row-level security policy") ||
    msg.includes("permission denied") ||
    msg.includes("42501") // PostgreSQL insufficient_privilege
  )
}

/**
 * Wire auth state changes to table store lifecycle.
 * Clears stores on sign-out, refetches on sign-in.
 */
export function setupAuthGate(
  supabase: SupabaseClient,
  _authStore: StoreApi<AuthStore>,
  tableStores: StoreApi<TableStore<any, any, any>>[],
  options: AuthGateOptions = {},
): () => void {
  const {
    clearOnSignOut = true,
    refetchOnSignIn = true,
    onAuthChange,
  } = options

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      onAuthChange?.(event, session)

      if (event === "SIGNED_OUT" && clearOnSignOut) {
        for (const store of tableStores) {
          store.getState().clearAll()
        }
      }

      if (event === "SIGNED_IN" && refetchOnSignIn) {
        for (const store of tableStores) {
          store.getState().fetch().catch((err: unknown) => {
            store.setState({ error: err instanceof Error ? err : new Error(String(err)) } as any)
          })
        }
      }

      if (event === "TOKEN_REFRESHED") {
        // Token refreshed — no action needed, Supabase client auto-uses new token
      }
    },
  )

  return () => subscription.unsubscribe()
}

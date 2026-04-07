import type { SupabaseClient } from "@supabase/supabase-js"
import { createStore, type StoreApi } from "zustand/vanilla"
import type { AuthStore } from "../types.js"

type CreateAuthStoreOptions = {
  supabase: SupabaseClient
  devtools?: boolean
}

/**
 * Creates a Zustand store for Supabase auth state.
 */
export function createAuthStore(
  options: CreateAuthStoreOptions,
): StoreApi<AuthStore> {
  const { supabase } = options

  return createStore<AuthStore>()((set, _get) => ({
    // State
    session: null,
    user: null,
    isLoading: true,
    error: null,

    // Actions
    async initialize() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        set({
          session,
          user: session?.user ?? null,
          isLoading: false,
          error: error ? new Error(error.message) : null,
        })
      } catch (err) {
        set({
          isLoading: false,
          error:
            err instanceof Error ? err : new Error(String(err)),
        })
      }
    },

    async signIn({ email, password }) {
      set({ isLoading: true, error: null })
      const { data, error } =
        await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        set({ isLoading: false, error: new Error(error.message) })
        throw new Error(error.message)
      }

      set({
        session: data.session,
        user: data.user,
        isLoading: false,
        error: null,
      })
    },

    async signUp({ email, password }) {
      set({ isLoading: true, error: null })
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        set({ isLoading: false, error: new Error(error.message) })
        throw new Error(error.message)
      }

      set({
        session: data.session,
        user: data.user,
        isLoading: false,
        error: null,
      })
    },

    async signOut() {
      set({ isLoading: true })
      const { error } = await supabase.auth.signOut()

      if (error) {
        set({ isLoading: false, error: new Error(error.message) })
        throw new Error(error.message)
      }

      set({
        session: null,
        user: null,
        isLoading: false,
        error: null,
      })
    },

    async signInWithOAuth({ provider, redirectTo }) {
      set({ isLoading: true, error: null })
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: { redirectTo },
      })

      if (error) {
        set({ error: new Error(error.message), isLoading: false })
        throw new Error(error.message)
      }

      // OAuth redirects away; reset loading for SPA/webview contexts
      set({ isLoading: false })
    },

    async refreshSession() {
      try {
        const { data, error } = await supabase.auth.refreshSession()

        if (error) {
          set({ error: new Error(error.message) })
          return
        }

        set({
          session: data.session,
          user: data.user,
          error: null,
        })
      } catch (err) {
        set({
          error: err instanceof Error ? err : new Error(String(err)),
        })
      }
    },

    onAuthStateChange() {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
          isLoading: false,
        })
      })

      return () => subscription.unsubscribe()
    },
  }))
}

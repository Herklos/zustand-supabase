import { describe, it, expect, beforeEach } from "vitest"
import { createAuthStore } from "./authStore.js"
import { createMockSupabase } from "../__tests__/mockSupabase.js"

describe("createAuthStore", () => {
  let supabase: any

  beforeEach(() => {
    supabase = createMockSupabase()
  })

  it("creates store with loading initial state", () => {
    const store = createAuthStore({ supabase })
    const state = store.getState()

    expect(state.session).toBeNull()
    expect(state.user).toBeNull()
    expect(state.isLoading).toBe(true)
    expect(state.error).toBeNull()
  })

  describe("initialize", () => {
    it("initializes with no session", async () => {
      const store = createAuthStore({ supabase })
      await store.getState().initialize()

      expect(store.getState().isLoading).toBe(false)
      expect(store.getState().session).toBeNull()
      expect(store.getState().user).toBeNull()
    })

    it("initializes with existing session", async () => {
      const session = { access_token: "token", user: { id: "u1", email: "a@b.com" } }
      supabase._setSession(session)

      const store = createAuthStore({ supabase })
      await store.getState().initialize()

      expect(store.getState().session).toEqual(session)
      expect(store.getState().user).toEqual(session.user)
      expect(store.getState().isLoading).toBe(false)
    })
  })

  describe("signIn", () => {
    it("signs in with email and password", async () => {
      const store = createAuthStore({ supabase })
      await store.getState().signIn({ email: "test@test.com", password: "pass" })

      expect(store.getState().user).toBeDefined()
      expect((store.getState().user as any).email).toBe("test@test.com")
      expect(store.getState().session).toBeDefined()
      expect(store.getState().isLoading).toBe(false)
    })
  })

  describe("signUp", () => {
    it("signs up with email and password", async () => {
      const store = createAuthStore({ supabase })
      await store.getState().signUp({ email: "new@test.com", password: "pass" })

      expect(store.getState().user).toBeDefined()
      expect((store.getState().user as any).email).toBe("new@test.com")
    })
  })

  describe("signOut", () => {
    it("clears session on sign out", async () => {
      const store = createAuthStore({ supabase })
      await store.getState().signIn({ email: "test@test.com", password: "pass" })

      expect(store.getState().session).not.toBeNull()

      await store.getState().signOut()

      expect(store.getState().session).toBeNull()
      expect(store.getState().user).toBeNull()
      expect(store.getState().isLoading).toBe(false)
    })
  })

  describe("claims", () => {
    it("starts with empty claims", () => {
      const store = createAuthStore({ supabase })
      expect(store.getState().claims).toEqual({})
    })

    it("parses JWT claims on sign-in", async () => {
      // Create a mock JWT with custom claims
      const payload = { sub: "user-1", role: "admin", org_id: "org-123" }
      const fakeJwt = `header.${btoa(JSON.stringify(payload))}.signature`
      supabase._setSession({ access_token: fakeJwt, user: { id: "user-1", email: "a@b.com" } })

      const store = createAuthStore({ supabase })
      await store.getState().initialize()

      expect(store.getState().claims.role).toBe("admin")
      expect(store.getState().claims.org_id).toBe("org-123")
    })

    it("getClaim returns specific claim value", async () => {
      const payload = { sub: "user-1", role: "editor" }
      const fakeJwt = `header.${btoa(JSON.stringify(payload))}.signature`
      supabase._setSession({ access_token: fakeJwt, user: { id: "user-1", email: "a@b.com" } })

      const store = createAuthStore({ supabase })
      await store.getState().initialize()

      expect(store.getState().getClaim("role")).toBe("editor")
      expect(store.getState().getClaim("nonexistent")).toBeUndefined()
    })

    it("clears claims on sign-out", async () => {
      const store = createAuthStore({ supabase })
      await store.getState().signIn({ email: "a@b.com", password: "x" })
      await store.getState().signOut()

      expect(store.getState().claims).toEqual({})
    })
  })

  describe("onAuthStateChange", () => {
    it("subscribes to auth changes and returns unsubscribe", () => {
      const store = createAuthStore({ supabase })
      const unsubscribe = store.getState().onAuthStateChange()

      expect(typeof unsubscribe).toBe("function")

      // Should not throw
      unsubscribe()
    })

    it("updates store when auth state changes", async () => {
      const store = createAuthStore({ supabase })
      store.getState().onAuthStateChange()

      // Sign in triggers auth state change
      await store.getState().signIn({ email: "test@test.com", password: "pass" })

      expect(store.getState().user).toBeDefined()
    })
  })
})

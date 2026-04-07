/**
 * Example: RPC, Storage, and Edge Functions usage.
 *
 * These features are standalone and don't require Zustand stores.
 */
import { createClient } from "@supabase/supabase-js"
import {
  createRpcAction,
  createEdgeFunctionAction,
  createStorageActions,
  incrementalSync,
  fetchWithSwr,
  setupAutoRevalidation,
} from "zustand-supabase"
import { stores } from "./stores"

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// ─── RPC: Call Postgres Functions ────────────────────────────────────

type DashboardStats = {
  total_todos: number
  completed_todos: number
  avg_priority: number
}

const getDashboardStats = createRpcAction<DashboardStats>(
  supabase,
  "get_dashboard_stats",
)

async function showDashboard() {
  const { data, error } = await getDashboardStats({ user_id: "123" })
  if (error) {
    console.error("RPC error:", error.message)
    return
  }
  console.log("Dashboard:", data)
}

// ─── Edge Functions ──────────────────────────────────────────────────

type EmailResult = { success: boolean; messageId: string }

const sendNotification = createEdgeFunctionAction<EmailResult>(
  supabase,
  "send-notification",
)

async function notifyUser() {
  const { data, error } = await sendNotification({
    body: {
      to: "user@example.com",
      subject: "Todo completed!",
      body: "Your todo has been completed.",
    },
    method: "POST",
  })

  if (error) {
    console.error("Edge function error:", error.message)
    return
  }
  console.log("Notification sent:", data?.messageId)
}

// ─── Storage: File Uploads ───────────────────────────────────────────

const avatars = createStorageActions(supabase, "avatars")

async function uploadAvatar(userId: string, file: File) {
  const path = `${userId}/${file.name}`

  const result = await avatars.upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  })

  if (result.error) {
    console.error("Upload error:", result.error.message)
    return null
  }

  // Get public URL
  const url = avatars.getPublicUrl(path)
  console.log("Avatar URL:", url)
  return url
}

async function listUserAvatars(userId: string) {
  const result = await avatars.list(userId)
  if (result.error) {
    console.error("List error:", result.error.message)
    return []
  }
  return result.data
}

// ─── Incremental Sync ────────────────────────────────────────────────

async function syncTodos() {
  const { fetchedCount, mergedCount } = await incrementalSync(
    supabase,
    "todos",
    "id",
    stores.todos,
    { timestampColumn: "updated_at" },
  )
  console.log(`Synced: ${fetchedCount} fetched, ${mergedCount} merged`)
}

// ─── Cache TTL: Stale-While-Revalidate ───────────────────────────────

async function setupCaching() {
  // Serve stale data while refetching in background
  await fetchWithSwr(stores.todos, {
    staleTTL: 5 * 60 * 1000,  // 5 minutes
    cacheTTL: 30 * 60 * 1000, // 30 minutes
  })

  // Auto-revalidate every minute
  const cleanup = setupAutoRevalidation(stores.todos, {
    staleTTL: 5 * 60 * 1000,
    checkInterval: 60 * 1000,
  })

  // Call cleanup() to stop auto-revalidation
  return cleanup
}

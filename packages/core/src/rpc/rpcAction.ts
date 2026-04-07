import type { SupabaseClient } from "@supabase/supabase-js"

export type RpcResult<T> = {
  data: T | null
  error: Error | null
}

/**
 * Call a Postgres function via Supabase RPC.
 */
export async function callRpc<
  T = unknown,
  Args extends Record<string, unknown> = Record<string, unknown>,
>(
  supabase: SupabaseClient,
  functionName: string,
  args?: Args,
): Promise<RpcResult<T>> {
  const { data, error } = await supabase.rpc(functionName, args as any)
  if (error) return { data: null, error: new Error(error.message) }
  return { data: data as T, error: null }
}

/**
 * Creates a reusable typed RPC action.
 *
 * @example
 * ```typescript
 * const getStats = createRpcAction<Stats>(supabase, 'get_dashboard_stats')
 * const result = await getStats({ user_id: '123' })
 * ```
 */
export function createRpcAction<
  T = unknown,
  Args extends Record<string, unknown> = Record<string, unknown>,
>(supabase: SupabaseClient, functionName: string) {
  return (args?: Args): Promise<RpcResult<T>> =>
    callRpc<T, Args>(supabase, functionName, args)
}

import type { SupabaseClient } from "@supabase/supabase-js"
import { withRetry, type RetryOptions } from "../utils/retry.js"

export type EdgeFunctionResult<T> = {
  data: T | null
  error: Error | null
}

export type InvokeOptions = {
  headers?: Record<string, string>
  body?: unknown
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  /** Retry configuration for transient failures */
  retry?: RetryOptions
}

/**
 * Invoke a Supabase Edge Function.
 */
export async function invokeEdgeFunction<T = unknown>(
  supabase: SupabaseClient,
  functionName: string,
  options?: InvokeOptions,
): Promise<EdgeFunctionResult<T>> {
  const execute = async (): Promise<EdgeFunctionResult<T>> => {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: options?.body as Record<string, unknown> | undefined,
      headers: options?.headers,
      method: options?.method,
    })

    if (error) {
      throw new Error(error.message)
    }
    return { data: data as T, error: null }
  }

  try {
    if (options?.retry) {
      return await withRetry(execute, options.retry)
    }
    return await execute()
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}

/**
 * Creates a reusable typed Edge Function action.
 *
 * @example
 * ```typescript
 * const sendEmail = createEdgeFunctionAction<{ success: boolean }>(supabase, 'send-email')
 * const result = await sendEmail({ body: { to: 'user@example.com', subject: 'Hello' } })
 * ```
 */
export function createEdgeFunctionAction<T = unknown>(
  supabase: SupabaseClient,
  functionName: string,
) {
  return (options?: InvokeOptions): Promise<EdgeFunctionResult<T>> =>
    invokeEdgeFunction<T>(supabase, functionName, options)
}

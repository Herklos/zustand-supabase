"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { callRpc } from "../rpc/rpcAction.js"

type UseRpcOptions = {
  enabled?: boolean
  deps?: unknown[]
}

type UseRpcResult<T> = {
  data: T | null
  error: Error | null
  isLoading: boolean
  refetch: () => Promise<void>
}

/**
 * React hook for calling Supabase RPC functions.
 *
 * @example
 * ```typescript
 * const { data, isLoading } = useRpc<Stats>(supabase, 'get_stats', { user_id: '123' })
 * ```
 */
export function useRpc<
  T = unknown,
  Args extends Record<string, unknown> = Record<string, unknown>,
>(
  supabase: SupabaseClient,
  functionName: string,
  args?: Args,
  options?: UseRpcOptions,
): UseRpcResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const enabled = options?.enabled ?? true
  const deps = options?.deps ?? []
  const argsRef = useRef(args)
  argsRef.current = args

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await callRpc<T, Args>(
        supabase,
        functionName,
        argsRef.current,
      )
      setData(result.data)
      setError(result.error)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [supabase, functionName])

  useEffect(() => {
    if (!enabled) return
    fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fetch, ...deps])

  return { data, error, isLoading, refetch: fetch }
}

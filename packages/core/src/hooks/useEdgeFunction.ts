"use client"

import { useState, useCallback } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  invokeEdgeFunction,
  type InvokeOptions,
  type EdgeFunctionResult,
} from "../functions/edgeFunctions.js"

type UseEdgeFunctionResult<T> = {
  data: T | null
  error: Error | null
  isLoading: boolean
  invoke: (options?: InvokeOptions) => Promise<EdgeFunctionResult<T>>
}

/**
 * React hook for invoking Supabase Edge Functions.
 */
export function useEdgeFunction<T = unknown>(
  supabase: SupabaseClient,
  functionName: string,
): UseEdgeFunctionResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const invoke = useCallback(
    async (options?: InvokeOptions): Promise<EdgeFunctionResult<T>> => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await invokeEdgeFunction<T>(supabase, functionName, options)
        setData(result.data)
        setError(result.error)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        return { data: null, error }
      } finally {
        setIsLoading(false)
      }
    },
    [supabase, functionName],
  )

  return { data, error, isLoading, invoke }
}

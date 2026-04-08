"use client"

import { useState, useCallback, useRef } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { FilterDescriptor, SortDescriptor } from "../types.js"
import {
  buildCursorQuery,
  processCursorResults,
  type CursorPaginationOptions,
  type PaginationState,
} from "../query/pagination.js"
import { applyFilters, applySort, fromTable } from "../query/queryExecutor.js"

export type UseInfiniteQueryOptions<Row> = {
  /** Column to paginate on (must be sortable, e.g. created_at, id) */
  cursorColumn: string & keyof Row
  /** Number of items per page (default: 20) */
  pageSize?: number
  /** Additional filters to apply */
  filters?: FilterDescriptor<Row>[]
  /** Additional sort rules (cursor column sort is added automatically) */
  sort?: SortDescriptor<Row>[]
  /** Select specific columns */
  select?: string
  /** Schema for non-public tables */
  schema?: string
  /** Table name */
  table: string
  /** Whether the query is enabled (default: true) */
  enabled?: boolean
}

export type UseInfiniteQueryResult<Row> = {
  /** All loaded pages flattened into a single array */
  data: Row[]
  /** All pages as separate arrays */
  pages: Row[][]
  /** Whether the initial page is loading */
  isLoading: boolean
  /** Whether a subsequent page is loading */
  isLoadingMore: boolean
  /** Whether there are more pages to load */
  hasMore: boolean
  /** Error from the last operation */
  error: Error | null
  /** Load the next page */
  loadMore: () => Promise<void>
  /** Reset and refetch from the beginning */
  reset: () => Promise<void>
  /** Current pagination state */
  pagination: PaginationState | null
}

/**
 * Infinite scroll / load-more hook built on cursor pagination.
 *
 * @example
 * ```tsx
 * const { data, loadMore, hasMore, isLoadingMore } = useInfiniteQuery(supabase, {
 *   table: 'posts',
 *   cursorColumn: 'created_at',
 *   pageSize: 20,
 * })
 * ```
 */
export function useInfiniteQuery<Row extends Record<string, unknown>>(
  supabase: SupabaseClient,
  options: UseInfiniteQueryOptions<Row>,
): UseInfiniteQueryResult<Row> {
  const {
    cursorColumn,
    pageSize = 20,
    filters = [],
    sort = [],
    select,
    schema,
    table,
    enabled = true,
  } = options

  const [pages, setPages] = useState<Row[][]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [pagination, setPagination] = useState<PaginationState | null>(null)
  const cursorRef = useRef<unknown>(undefined)
  const hasInitiallyFetched = useRef(false)

  const fetchPage = useCallback(async (cursor: unknown, isInitial: boolean) => {
    if (isInitial) {
      setIsLoading(true)
    } else {
      setIsLoadingMore(true)
    }
    setError(null)

    try {
      const cursorOpts: CursorPaginationOptions<Row> = {
        cursorColumn,
        pageSize,
        cursor: cursor ?? undefined,
        direction: "forward",
      }

      const { filters: cursorFilters, sort: cursorSort, limit } = buildCursorQuery(cursorOpts)

      let query = fromTable(supabase, table, schema)
        .select(select ?? "*")

      // Apply user filters + cursor filters
      query = applyFilters(query, [...filters as FilterDescriptor<Record<string, unknown>>[], ...cursorFilters as FilterDescriptor<Record<string, unknown>>[]])
      // Apply user sort + cursor sort (cursor sort takes precedence for pagination correctness)
      query = applySort(query, [...sort as SortDescriptor<Record<string, unknown>>[], ...cursorSort as SortDescriptor<Record<string, unknown>>[]])
      query = query.limit(limit)

      const { data, error: queryError } = await query

      if (queryError) {
        throw new Error((queryError as any).message ?? String(queryError))
      }

      const rows = (data ?? []) as Row[]
      const result = processCursorResults(rows, cursorOpts)

      cursorRef.current = result.pagination.cursor
      setPagination(result.pagination)

      if (isInitial) {
        setPages([result.data])
      } else {
        setPages((prev) => [...prev, result.data])
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [supabase, table, schema, cursorColumn, pageSize, select, JSON.stringify(filters), JSON.stringify(sort)])

  // Auto-fetch first page
  if (enabled && !hasInitiallyFetched.current && !isLoading) {
    hasInitiallyFetched.current = true
    fetchPage(undefined, true)
  }

  const loadMore = useCallback(async () => {
    if (isLoadingMore || isLoading || !pagination?.hasNextPage) return
    await fetchPage(cursorRef.current, false)
  }, [fetchPage, isLoadingMore, isLoading, pagination?.hasNextPage])

  const reset = useCallback(async () => {
    setPages([])
    cursorRef.current = undefined
    setPagination(null)
    await fetchPage(undefined, true)
  }, [fetchPage])

  const data = pages.flat()

  return {
    data,
    pages,
    isLoading,
    isLoadingMore,
    hasMore: pagination?.hasNextPage ?? false,
    error,
    loadMore,
    reset,
    pagination,
  }
}

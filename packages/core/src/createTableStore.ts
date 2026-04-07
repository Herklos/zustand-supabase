import type { SupabaseClient } from "@supabase/supabase-js"
import { createStore, type StoreApi } from "zustand/vanilla"
import { subscribeWithSelector, devtools } from "zustand/middleware"
import type {
  TableStore,
  TableStoreState,
  TableStoreActions,
  TrackedRow,
  CreateTableStoreOptions,
  FilterDescriptor,
  FetchOptions,
} from "./types.js"
import { noopLogger, createTempId } from "./types.js"
import { runValidation } from "./mutation/validation.js"
import { executeQuery, executeQueryOne, fromTable } from "./query/queryExecutor.js"

type StoreSet<Row, InsertRow, UpdateRow> = StoreApi<
  TableStore<Row, InsertRow, UpdateRow>
>["setState"]
type StoreGet<Row, InsertRow, UpdateRow> = StoreApi<
  TableStore<Row, InsertRow, UpdateRow>
>["getState"]

/**
 * Creates a Zustand store for a single Supabase table.
 */
export function createTableStore<
  DB,
  Row extends Record<string, unknown>,
  InsertRow extends Record<string, unknown>,
  UpdateRow extends Record<string, unknown>,
  Extensions extends Record<string, unknown> = Record<string, never>,
>(
  options: CreateTableStoreOptions<DB, Row, InsertRow, UpdateRow, Extensions>,
): StoreApi<TableStore<Row, InsertRow, UpdateRow> & Extensions> {
  const {
    supabase,
    table,
    schema = "public",
    primaryKey: rawPrimaryKey = "id",
    defaultFilters,
    defaultSort,
    defaultSelect,
    persistence,
    offlineQueue: _offlineQueue,
    network: _network,
    realtime: _realtime,
    conflict: _conflict,
    logger = noopLogger,
    isView = false,
    immer: immerMiddleware,
    devtools: devtoolsOption,
    validate,
    _queue,
    extend,
  } = options

  // Normalize composite PK to string for internal Map key usage
  // For composite keys, consumers should use encodeKey/applyPkFilters utilities
  const primaryKey = typeof rawPrimaryKey === "string" ? rawPrimaryKey : rawPrimaryKey[0]!

  // Track last fetch options for refetch
  let lastFetchOptions: FetchOptions<Row> | undefined

  const storeCreator = (
    set: StoreSet<Row, InsertRow, UpdateRow>,
    get: StoreGet<Row, InsertRow, UpdateRow>,
    api: StoreApi<TableStore<Row, InsertRow, UpdateRow>>,
  ): TableStore<Row, InsertRow, UpdateRow> & Extensions => {
    // ── Helpers ────────────────────────────────────────────────────

    function mergeFilters(
      custom?: FilterDescriptor<Row>[],
    ): FilterDescriptor<Row>[] | undefined {
      if (!defaultFilters && !custom) return undefined
      return [...(defaultFilters ?? []), ...(custom ?? [])]
    }

    function recordsToArray(
      records: Map<string | number, TrackedRow<Row>>,
      order: (string | number)[],
    ): TrackedRow<Row>[] {
      const result: TrackedRow<Row>[] = []
      for (const id of order) {
        const record = records.get(id)
        if (record) result.push(record)
      }
      return result
    }

    function rowsToMap(
      rows: Row[],
    ): { records: Map<string | number, TrackedRow<Row>>; order: (string | number)[] } {
      const records = new Map<string | number, TrackedRow<Row>>()
      const order: (string | number)[] = []
      for (const row of rows) {
        const id = (row as Record<string, unknown>)[primaryKey] as
          | string
          | number
        records.set(id, row as TrackedRow<Row>)
        order.push(id)
      }
      return { records, order }
    }

    function persistIfConfigured(): void {
      if (persistence) {
        const state = get()
        const data = recordsToArray(state.records, state.order)
        persistence.adapter
          .setItem(`zs:${schema}:${table}`, data)
          .catch((err) => {
            logger.mutationError(table, "PERSIST" as any, err instanceof Error ? err.message : String(err))
          })
      }
    }

    function assertNotView(): void {
      if (isView) throw new Error(`Cannot mutate view "${table}"`)
    }

    // ── Initial state ─────────────────────────────────────────────

    const initialState: TableStoreState<Row> = {
      records: new Map(),
      order: [],
      isLoading: false,
      error: null,
      isHydrated: false,
      isRestoring: false,
      lastFetchedAt: null,
      realtimeStatus: "disconnected",
    }

    // ── Actions ───────────────────────────────────────────────────

    const actions: TableStoreActions<Row, InsertRow, UpdateRow> = {
      // ── Query ─────────────────────────────────────────────────

      async fetch(fetchOptions) {
        set({ isLoading: true, error: null } as Partial<
          TableStore<Row, InsertRow, UpdateRow>
        >)
        lastFetchOptions = fetchOptions

        const start = Date.now()
        logger.fetchStart(table)

        const opts: FetchOptions<Row> = {
          ...fetchOptions,
          filters: mergeFilters(fetchOptions?.filters),
          sort: fetchOptions?.sort ?? defaultSort,
          select: fetchOptions?.select ?? defaultSelect,
        }

        const { data, error } = await executeQuery<Row>(
          supabase as SupabaseClient,
          table,
          schema,
          opts,
        )

        if (error) {
          logger.fetchError(table, error.message)
          set({ isLoading: false, error } as Partial<
            TableStore<Row, InsertRow, UpdateRow>
          >)
          return []
        }

        const { records, order } = rowsToMap(data)

        // Preserve rows with pending mutations
        const currentState = get()
        for (const [id, existing] of currentState.records) {
          if (existing._zs_pending && !records.has(id)) {
            records.set(id, existing)
            order.push(id)
          } else if (existing._zs_pending && records.has(id)) {
            records.set(id, existing)
          }
        }

        logger.fetchSuccess(table, data.length, Date.now() - start)
        set({
          records,
          order,
          isLoading: false,
          error: null,
          lastFetchedAt: Date.now(),
        } as Partial<TableStore<Row, InsertRow, UpdateRow>>)

        persistIfConfigured()

        return recordsToArray(records, order)
      },

      async fetchOne(id) {
        const { data, error } = await executeQueryOne<Row>(
          supabase as SupabaseClient,
          table,
          primaryKey,
          id,
          defaultSelect,
          schema,
        )

        if (error) {
          set({ error } as Partial<TableStore<Row, InsertRow, UpdateRow>>)
          return null
        }
        if (!data) return null

        const tracked = data as TrackedRow<Row>
        set((prev) => {
          const records = new Map(prev.records)
          const order = [...prev.order]
          records.set(id, tracked)
          if (!prev.records.has(id)) order.push(id)
          return { ...prev, records, order }
        })

        persistIfConfigured()
        return tracked
      },

      async refetch() {
        return actions.fetch(lastFetchOptions)
      },

      // ── Mutations ─────────────────────────────────────────────

      async insert(row) {
        assertNotView()
        runValidation(validate?.insert, row, "insert")
        const start = Date.now()
        logger.mutationStart(table, "INSERT")

        // Optimistically add
        const tempId =
          (row as Record<string, unknown>)[primaryKey] ??
          createTempId()
        const optimisticRow: TrackedRow<Row> = {
          ...(row as unknown as Row),
          [primaryKey]: tempId,
          _zs_pending: "insert",
          _zs_optimistic: true,
        }

        set((prev) => {
          const records = new Map(prev.records)
          const order = [...prev.order]
          records.set(tempId as string | number, optimisticRow)
          order.push(tempId as string | number)
          return { ...prev, records, order, error: null }
        })

        // Execute remote
        const { data, error } = await fromTable(supabase as unknown as SupabaseClient, table, schema)
          .insert(row as any)
          .select(defaultSelect ?? "*")
          .single()

        if (error) {
          // Rollback
          logger.mutationError(table, "INSERT", error.message)
          set((prev) => {
            const records = new Map(prev.records)
            const order = prev.order.filter((o) => o !== tempId)
            records.delete(tempId as string | number)
            return { ...prev, records, order, error: new Error(error.message) }
          })
          throw new Error(error.message)
        }

        const serverRow = data as unknown as Row
        const serverId = (serverRow as Record<string, unknown>)[
          primaryKey
        ] as string | number

        // Confirm: replace optimistic with server response
        set((prev) => {
          const records = new Map(prev.records)
          const order = [...prev.order]

          // Remove temp entry if ID changed
          if (serverId !== tempId) {
            records.delete(tempId as string | number)
            const idx = order.indexOf(tempId as string | number)
            if (idx >= 0) order[idx] = serverId
          }

          records.set(serverId, serverRow as TrackedRow<Row>)
          return { ...prev, records, order }
        })

        logger.mutationSuccess(table, "INSERT", Date.now() - start)
        persistIfConfigured()
        return serverRow as TrackedRow<Row>
      },

      async insertMany(rows) {
        assertNotView()
        for (const row of rows) {
          runValidation(validate?.insert, row, "insert")
        }
        const start = Date.now()
        logger.mutationStart(table, "INSERT")

        // Optimistic apply all rows
        const tempIds: (string | number)[] = []
        for (const row of rows) {
          const tempId =
            (row as Record<string, unknown>)[primaryKey] ??
            createTempId()
          tempIds.push(tempId as string | number)

          set((prev) => {
            const records = new Map(prev.records)
            const order = [...prev.order]
            records.set(tempId as string | number, {
              ...(row as unknown as Row),
              [primaryKey]: tempId,
              _zs_pending: "insert",
              _zs_optimistic: true,
            } as TrackedRow<Row>)
            order.push(tempId as string | number)
            return { ...prev, records, order, error: null }
          })
        }

        // Batched remote insert
        const { data, error } = await fromTable(supabase as unknown as SupabaseClient, table, schema)
          .insert(rows as any[])
          .select(defaultSelect ?? "*")

        if (error) {
          // Rollback all optimistic inserts
          logger.mutationError(table, "INSERT", error.message)
          set((prev) => {
            const records = new Map(prev.records)
            const order = prev.order.filter(
              (o) => !tempIds.includes(o),
            )
            for (const id of tempIds) records.delete(id)
            return { ...prev, records, order, error: new Error(error.message) }
          })
          throw new Error(error.message)
        }

        // Confirm: replace optimistic with server responses
        const serverRows = (data as unknown as Row[]) ?? []
        set((prev) => {
          const records = new Map(prev.records)
          const order = [...prev.order]

          // Remove temp entries
          for (const tempId of tempIds) {
            records.delete(tempId)
          }

          // Add server rows
          for (const serverRow of serverRows) {
            const serverId = (serverRow as Record<string, unknown>)[
              primaryKey
            ] as string | number
            records.set(serverId, serverRow as TrackedRow<Row>)
            // Replace temp IDs in order array
            const tempIdx = order.findIndex((o) => tempIds.includes(o))
            if (tempIdx >= 0) {
              order[tempIdx] = serverId
            } else {
              order.push(serverId)
            }
          }

          // Remove remaining temp IDs from order
          const finalOrder = order.filter((o) => !tempIds.includes(o) || records.has(o))
          return { ...prev, records, order: finalOrder }
        })

        logger.mutationSuccess(table, "INSERT", Date.now() - start)
        persistIfConfigured()
        return serverRows as TrackedRow<Row>[]
      },

      async update(id, changes) {
        assertNotView()
        runValidation(validate?.update, changes, "update")
        const start = Date.now()
        logger.mutationStart(table, "UPDATE")

        // Snapshot for rollback
        const snapshot = get().records.get(id)

        // Optimistic apply
        set((prev) => {
          const records = new Map(prev.records)
          const existing = records.get(id)
          if (existing) {
            records.set(id, {
              ...existing,
              ...(changes as Record<string, unknown>),
              _zs_pending: "update",
              _zs_optimistic: true,
            } as TrackedRow<Row>)
          }
          return { ...prev, records, error: null }
        })

        // Execute remote
        const { data, error } = await fromTable(supabase as unknown as SupabaseClient, table, schema)
          .update(changes as any)
          .eq(primaryKey, id as any)
          .select(defaultSelect ?? "*")
          .single()

        if (error) {
          // Rollback
          logger.mutationError(table, "UPDATE", error.message)
          set((prev) => {
            const records = new Map(prev.records)
            if (snapshot) {
              records.set(id, snapshot)
            }
            return { ...prev, records, error: new Error(error.message) }
          })
          throw new Error(error.message)
        }

        // Confirm with server response
        set((prev) => {
          const records = new Map(prev.records)
          records.set(id, data as unknown as TrackedRow<Row>)
          return { ...prev, records }
        })

        logger.mutationSuccess(table, "UPDATE", Date.now() - start)
        persistIfConfigured()
        return data as unknown as TrackedRow<Row>
      },

      async upsert(row) {
        assertNotView()
        runValidation(validate?.insert, row, "upsert")
        const start = Date.now()
        logger.mutationStart(table, "UPSERT")

        // Optimistic apply
        const optimisticId =
          (row as Record<string, unknown>)[primaryKey] as
            | string
            | number
            | undefined
        const snapshot = optimisticId
          ? get().records.get(optimisticId)
          : undefined

        if (optimisticId) {
          set((prev) => {
            const records = new Map(prev.records)
            const order = [...prev.order]
            records.set(optimisticId, {
              ...(row as unknown as Row),
              _zs_pending: "update",
              _zs_optimistic: true,
            } as TrackedRow<Row>)
            if (!prev.records.has(optimisticId)) order.push(optimisticId)
            return { ...prev, records, order, error: null }
          })
        }

        const { data, error } = await fromTable(supabase as unknown as SupabaseClient, table, schema)
          .upsert(row as any)
          .select(defaultSelect ?? "*")
          .single()

        if (error) {
          logger.mutationError(table, "UPSERT", error.message)
          // Rollback
          if (optimisticId) {
            set((prev) => {
              const records = new Map(prev.records)
              const order = [...prev.order]
              if (snapshot) {
                records.set(optimisticId, snapshot)
              } else {
                records.delete(optimisticId)
                const idx = order.indexOf(optimisticId)
                if (idx >= 0) order.splice(idx, 1)
              }
              return { ...prev, records, order, error: new Error(error.message) }
            })
          }
          throw new Error(error.message)
        }

        const serverRow = data as unknown as Row
        const id = (serverRow as Record<string, unknown>)[primaryKey] as
          | string
          | number

        set((prev) => {
          const records = new Map(prev.records)
          const order = [...prev.order]
          records.set(id, serverRow as TrackedRow<Row>)
          if (!prev.records.has(id)) order.push(id)
          return { ...prev, records, order, error: null }
        })

        logger.mutationSuccess(table, "UPSERT", Date.now() - start)
        persistIfConfigured()
        return serverRow as TrackedRow<Row>
      },

      async remove(id) {
        assertNotView()
        const start = Date.now()
        logger.mutationStart(table, "DELETE")

        // Snapshot for rollback
        const snapshot = get().records.get(id)

        // Optimistic remove
        set((prev) => {
          const records = new Map(prev.records)
          const order = prev.order.filter((o) => o !== id)
          records.delete(id)
          return { ...prev, records, order, error: null }
        })

        // Execute remote
        const { error } = await fromTable(supabase as unknown as SupabaseClient, table, schema)
          .delete()
          .eq(primaryKey, id as any)

        if (error) {
          // Rollback
          logger.mutationError(table, "DELETE", error.message)
          set((prev) => {
            const records = new Map(prev.records)
            const order = [...prev.order]
            if (snapshot) {
              records.set(id, snapshot)
              order.push(id)
            }
            return { ...prev, records, order, error: new Error(error.message) }
          })
          throw new Error(error.message)
        }

        logger.mutationSuccess(table, "DELETE", Date.now() - start)
        persistIfConfigured()
      },

      // ── Local-only ────────────────────────────────────────────

      setRecord(id, row) {
        set((prev) => {
          const records = new Map(prev.records)
          const order = [...prev.order]
          records.set(id, row)
          if (!prev.records.has(id)) order.push(id)
          return { ...prev, records, order }
        })
        persistIfConfigured()
      },

      removeRecord(id) {
        set((prev) => {
          const records = new Map(prev.records)
          const order = prev.order.filter((o) => o !== id)
          records.delete(id)
          return { ...prev, records, order }
        })
        persistIfConfigured()
      },

      clearAll() {
        set({
          records: new Map(),
          order: [],
          error: null,
          lastFetchedAt: null,
        } as Partial<TableStore<Row, InsertRow, UpdateRow>>)
        if (persistence) {
          persistence.adapter
            .removeItem(`zs:${schema}:${table}`)
            .catch((err) => {
              logger.mutationError(table, "PERSIST" as any, err instanceof Error ? err.message : String(err))
            })
        }
      },

      mergeRecords(rows) {
        set((prev) => {
          const records = new Map(prev.records)
          const order = [...prev.order]
          for (const row of rows) {
            const id = (row as Record<string, unknown>)[primaryKey] as
              | string
              | number
            // Don't overwrite pending records
            const existing = records.get(id)
            if (existing?._zs_pending) continue
            records.set(id, row as TrackedRow<Row>)
            if (!prev.records.has(id)) order.push(id)
          }
          return { ...prev, records, order }
        })
        persistIfConfigured()
      },

      // ── Realtime (stub — implemented in realtimeBindings) ─────

      subscribe(_filter) {
        return () => {}
      },

      unsubscribe() {},

      // ── Persistence ───────────────────────────────────────────

      async hydrate() {
        if (!persistence) return

        set({ isRestoring: true } as Partial<
          TableStore<Row, InsertRow, UpdateRow>
        >)

        try {
          const key = persistence.key ?? `zs:${schema}:${table}`
          const data = await persistence.adapter.getItem<Row[]>(key)

          if (data && Array.isArray(data)) {
            const { records, order } = rowsToMap(data)
            set({
              records,
              order,
              isHydrated: true,
              isRestoring: false,
            } as Partial<TableStore<Row, InsertRow, UpdateRow>>)
          } else {
            set({ isHydrated: true, isRestoring: false } as Partial<
              TableStore<Row, InsertRow, UpdateRow>
            >)
          }
        } catch {
          set({ isHydrated: true, isRestoring: false } as Partial<
            TableStore<Row, InsertRow, UpdateRow>
          >)
        }
      },

      async persist() {
        persistIfConfigured()
      },

      // ── Queue (stub — implemented in offlineQueue) ────────────

      async flushQueue() {
        if (_queue) {
          const q = _queue as import("./mutation/offlineQueue.js").OfflineQueue
          await q.flush()
        }
      },

      getQueueSize() {
        if (_queue) {
          const q = _queue as import("./mutation/offlineQueue.js").OfflineQueue
          return q.pendingMutations.filter((m) => m.table === table).length
        }
        return 0
      },
    }

    // ── Build the full store ──────────────────────────────────────

    const extensions = extend
      ? extend(
          set as any,
          get as any,
          api as any,
          supabase,
        )
      : ({} as Extensions)

    return {
      ...initialState,
      ...actions,
      ...extensions,
    }
  }

  // ── Create the store with middleware ─────────────────────────────
  // Middleware order (outermost wraps first):
  //   immer → devtools → subscribeWithSelector → storeCreator

  let combinedCreator: any = subscribeWithSelector(storeCreator as any)

  if (devtoolsOption) {
    const devtoolsName =
      typeof devtoolsOption === "object"
        ? devtoolsOption.name ?? `zs:${table}`
        : `zs:${table}`
    combinedCreator = devtools(combinedCreator, { name: devtoolsName })
  }

  if (immerMiddleware) {
    combinedCreator = immerMiddleware(combinedCreator)
  }

  const store = createStore<TableStore<Row, InsertRow, UpdateRow> & Extensions>()(
    combinedCreator as any,
  )

  // Auto-hydrate if persistence configured
  if (persistence) {
    store.getState().hydrate()
  }

  // Set up cross-tab sync if configured
  if (options.crossTab?.enabled) {
    import("./sync/crossTabSync.js").then(({ setupCrossTabSync }) => {
      const cleanup = setupCrossTabSync(store as any, options.crossTab!.name ?? `${schema}:${table}`)
      // Attach cleanup so createSupabaseStores._destroy() can call it
      ;(store as any)._destroyCrossTab = cleanup
    }).catch(() => {})
  }

  return store
}

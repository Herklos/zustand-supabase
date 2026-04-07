// ─── Core Types ──────────────────────────────────────────────────────
export type {
  // Schema extraction
  ExtractSchema,
  TableNames,
  TableRow,
  TableInsert,
  TableUpdate,
  DatabaseEnum,
  // Record tracking
  RecordMeta,
  TrackedRow,
  // Filter & Query
  FilterOperator,
  FilterDescriptor,
  SortDescriptor,
  FetchOptions,
  // Store
  TableStoreState,
  TableStoreActions,
  TableStore,
  RealtimeStatus,
  RealtimeEvent,
  // Mutation queue
  MutationId,
  MutationOperation,
  MutationStatus,
  QueuedMutation,
  // Persistence
  PersistenceAdapter,
  NetworkStatusAdapter,
  // Conflict
  ConflictStrategy,
  ConflictResolver,
  ConflictContext,
  ConflictConfig,
  // Auth
  AuthState,
  AuthActions,
  AuthStore,
  // Hydration
  HydrationPhase,
  // Logger
  SyncLogger,
  // Factory options
  CreateTableStoreOptions,
  CreateSupabaseStoresOptions,
  SupabaseStores,
} from "./types.js"

// ─── Runtime Exports ─────────────────────────────────────────────────
export {
  TEMP_ID_PREFIX,
  createTempId,
  isTempId,
  noopLogger,
  consoleLogger,
} from "./types.js"

// ─── Store Factories ─────────────────────────────────────────────────
export { createTableStore } from "./createTableStore.js"
export { createSupabaseStores } from "./createSupabaseStores.js"

// ─── Query ───────────────────────────────────────────────────────────
export {
  eq, neq, gt, gte, lt, lte,
  like, ilike, is, inValues,
  contains, containedBy, overlaps, textSearch,
  match, asc, desc,
} from "./query/filters.js"
export {
  applyFilters, applySort,
  executeQuery, executeQueryOne, fromTable,
} from "./query/queryExecutor.js"
export { QueryBuilder, query } from "./query/queryBuilder.js"
export { buildCursorQuery, processCursorResults } from "./query/pagination.js"
export type { CursorPaginationOptions, PaginationState } from "./query/pagination.js"

// ─── Mutation ────────────────────────────────────────────────────────
export { OfflineQueue } from "./mutation/offlineQueue.js"
export type { FlushResult, MutationExecutor } from "./mutation/offlineQueue.js"
export { executeRemoteMutation, createMutationExecutor } from "./mutation/mutationPipeline.js"
export { remoteWins, localWins, lastWriteWins, fieldLevelMerge, resolveConflict } from "./mutation/conflictResolution.js"
export { ValidationError, zodValidator, runValidation } from "./mutation/validation.js"
export type { Validator, ValidationConfig } from "./mutation/validation.js"
export { updateMany, removeMany } from "./mutation/batchOperations.js"

// ─── Realtime ────────────────────────────────────────────────────────
export { RealtimeManager } from "./realtime/realtimeManager.js"
export { bindRealtimeToStore } from "./realtime/realtimeBindings.js"

// ─── Auth ────────────────────────────────────────────────────────────
export { createAuthStore } from "./auth/authStore.js"
export { setupAuthGate, isRlsError } from "./auth/authGate.js"

// ─── Persistence ─────────────────────────────────────────────────────
export { MemoryAdapter } from "./persistence/persistenceAdapter.js"

// ─── Network ─────────────────────────────────────────────────────────
export { ManualNetworkStatus } from "./network/onlineManager.js"

// ─── Views ───────────────────────────────────────────────────────────
export { createViewStore } from "./createViewStore.js"
export type { ViewStore, CreateViewStoreOptions } from "./createViewStore.js"

// ─── RPC ─────────────────────────────────────────────────────────────
export { callRpc, createRpcAction } from "./rpc/rpcAction.js"
export type { RpcResult } from "./rpc/rpcAction.js"

// ─── Edge Functions ──────────────────────────────────────────────────
export { invokeEdgeFunction, createEdgeFunctionAction } from "./functions/edgeFunctions.js"
export type { EdgeFunctionResult, InvokeOptions } from "./functions/edgeFunctions.js"

// ─── Storage ─────────────────────────────────────────────────────────
export {
  uploadFile, downloadFile, getPublicUrl,
  createSignedUrl, listFiles, removeFiles,
  createStorageActions,
} from "./storage/storageActions.js"
export type { StorageResult, UploadOptions, ListOptions, SignedUrlOptions } from "./storage/storageActions.js"

// ─── Cross-Tab Sync ──────────────────────────────────────────────────
export { setupCrossTabSync, setupBroadcastSync, setupStorageFallback } from "./sync/crossTabSync.js"

// ─── Incremental Sync ────────────────────────────────────────────────
export { incrementalSync } from "./sync/incrementalSync.js"

// ─── Cache ───────────────────────────────────────────────────────────
export { isStale, isExpired, fetchWithSwr, setupAutoRevalidation } from "./cache/cacheTtl.js"
export type { CacheConfig } from "./cache/cacheTtl.js"

// ─── Composite Keys ─────────────────────────────────────────────────
export { encodeKey, buildPkFilter, applyPkFilters, normalizePk } from "./utils/compositeKey.js"

// ─── Hooks ───────────────────────────────────────────────────────────
export { createTableHook, useRecords, useRecord } from "./hooks/useTableStore.js"
export { useQuery } from "./hooks/useQuery.js"
export { useMutation } from "./hooks/useMutation.js"
export { useAuth } from "./hooks/useAuth.js"
export { useRealtime } from "./hooks/useRealtime.js"
export { useRpc } from "./hooks/useRpc.js"
export { useEdgeFunction } from "./hooks/useEdgeFunction.js"
export { useStorage } from "./hooks/useStorage.js"
export { useSuspenseQuery } from "./hooks/useSuspenseQuery.js"

// ─── Server ──────────────────────────────────────────────────────────
export { prefetch, serializePrefetchResult, deserializePrefetchResult } from "./server/prefetch.js"
export type { PrefetchResult } from "./server/prefetch.js"

import type { SupabaseClient } from "@supabase/supabase-js"

export type StorageResult<T> = {
  data: T | null
  error: Error | null
}

export type UploadOptions = {
  cacheControl?: string
  contentType?: string
  upsert?: boolean
}

export type ListOptions = {
  limit?: number
  offset?: number
  sortBy?: { column: string; order: "asc" | "desc" }
  search?: string
}

export type SignedUrlOptions = {
  expiresIn: number
  download?: boolean | string
}

/**
 * Upload a file to Supabase Storage.
 */
export async function uploadFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  file: File | Blob | ArrayBuffer | string,
  options?: UploadOptions,
): Promise<StorageResult<{ path: string }>> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: options?.cacheControl,
        contentType: options?.contentType,
        upsert: options?.upsert,
      })
    if (error) return { data: null, error: new Error(error.message) }
    return { data: { path: data.path }, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * Download a file from Supabase Storage.
 */
export async function downloadFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<StorageResult<Blob>> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path)
    if (error) return { data: null, error: new Error(error.message) }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * Get the public URL for a file.
 */
export function getPublicUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Create a signed URL for private file access.
 */
export async function createSignedUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  options: SignedUrlOptions,
): Promise<StorageResult<{ signedUrl: string }>> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, options.expiresIn, {
        download: options.download,
      })
    if (error) return { data: null, error: new Error(error.message) }
    return { data: { signedUrl: data.signedUrl }, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * List files in a bucket/folder.
 */
export async function listFiles(
  supabase: SupabaseClient,
  bucket: string,
  path?: string,
  options?: ListOptions,
): Promise<StorageResult<Array<{ name: string; id: string | null; metadata: Record<string, unknown> | null }>>> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(path, {
        limit: options?.limit,
        offset: options?.offset,
        sortBy: options?.sortBy,
        search: options?.search,
      })
    if (error) return { data: null, error: new Error(error.message) }
    return {
      data: (data ?? []).map((f) => ({
        name: f.name,
        id: f.id ?? null,
        metadata: (f.metadata as Record<string, unknown>) ?? null,
      })),
      error: null,
    }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * Remove files from a bucket.
 */
export async function removeFiles(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<StorageResult<void>> {
  try {
    const { error } = await supabase.storage.from(bucket).remove(paths)
    if (error) return { data: null, error: new Error(error.message) }
    return { data: undefined as unknown as void, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * Creates a typed storage helper bound to a specific bucket.
 */
export function createStorageActions(supabase: SupabaseClient, bucket: string) {
  return {
    upload: (path: string, file: File | Blob | ArrayBuffer | string, options?: UploadOptions) =>
      uploadFile(supabase, bucket, path, file, options),
    download: (path: string) => downloadFile(supabase, bucket, path),
    getPublicUrl: (path: string) => getPublicUrl(supabase, bucket, path),
    createSignedUrl: (path: string, options: SignedUrlOptions) =>
      createSignedUrl(supabase, bucket, path, options),
    list: (path?: string, options?: ListOptions) =>
      listFiles(supabase, bucket, path, options),
    remove: (paths: string[]) => removeFiles(supabase, bucket, paths),
  }
}

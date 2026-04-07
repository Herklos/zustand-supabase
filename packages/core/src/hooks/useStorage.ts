"use client"

import { useState, useCallback } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  uploadFile,
  downloadFile,
  getPublicUrl,
  createSignedUrl,
  listFiles,
  removeFiles,
  type UploadOptions,
  type SignedUrlOptions,
  type ListOptions,
} from "../storage/storageActions.js"

type UseStorageResult = {
  upload: (path: string, file: File | Blob | ArrayBuffer | string, options?: UploadOptions) => Promise<{ path: string } | null>
  download: (path: string) => Promise<Blob | null>
  getPublicUrl: (path: string) => string
  createSignedUrl: (path: string, options: SignedUrlOptions) => Promise<string | null>
  list: (path?: string, options?: ListOptions) => Promise<Array<{ name: string }> | null>
  remove: (paths: string[]) => Promise<boolean>
  isLoading: boolean
  error: Error | null
}

/**
 * React hook for Supabase Storage operations on a specific bucket.
 */
export function useStorage(
  supabase: SupabaseClient,
  bucket: string,
): UseStorageResult {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const upload = useCallback(
    async (path: string, file: File | Blob | ArrayBuffer | string, options?: UploadOptions) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await uploadFile(supabase, bucket, path, file, options)
        setError(result.error)
        return result.data
      } finally {
        setIsLoading(false)
      }
    },
    [supabase, bucket],
  )

  const download = useCallback(
    async (path: string) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await downloadFile(supabase, bucket, path)
        setError(result.error)
        return result.data
      } finally {
        setIsLoading(false)
      }
    },
    [supabase, bucket],
  )

  const getUrl = useCallback(
    (path: string) => getPublicUrl(supabase, bucket, path),
    [supabase, bucket],
  )

  const signUrl = useCallback(
    async (path: string, options: SignedUrlOptions) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await createSignedUrl(supabase, bucket, path, options)
        setError(result.error)
        return result.data?.signedUrl ?? null
      } finally {
        setIsLoading(false)
      }
    },
    [supabase, bucket],
  )

  const listAction = useCallback(
    async (path?: string, options?: ListOptions) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await listFiles(supabase, bucket, path, options)
        setError(result.error)
        return result.data
      } finally {
        setIsLoading(false)
      }
    },
    [supabase, bucket],
  )

  const removeAction = useCallback(
    async (paths: string[]) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await removeFiles(supabase, bucket, paths)
        setError(result.error)
        return !result.error
      } finally {
        setIsLoading(false)
      }
    },
    [supabase, bucket],
  )

  return {
    upload,
    download,
    getPublicUrl: getUrl,
    createSignedUrl: signUrl,
    list: listAction,
    remove: removeAction,
    isLoading,
    error,
  }
}

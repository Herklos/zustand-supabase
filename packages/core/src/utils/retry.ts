export type RetryOptions = {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelay?: number
  /** Whether to add random jitter to backoff (default: true) */
  jitter?: boolean
  /** Predicate to decide if the error is retryable (default: all errors) */
  isRetryable?: (error: unknown) => boolean
}

/**
 * Wrap an async function with exponential backoff retry logic.
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => callRpc(supabase, 'my_function'),
 *   { maxAttempts: 3, baseDelay: 500 },
 * )
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    jitter = true,
    isRetryable = () => true,
  } = options ?? {}

  let lastError: unknown
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt >= maxAttempts || !isRetryable(err)) {
        throw err
      }
      const exponential = baseDelay * Math.pow(2, attempt)
      const delay = jitter
        ? exponential + Math.random() * baseDelay
        : exponential
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

/** Declarative redirect outcome from a route loader or action (consumers navigate to {@link RedirectResult.to}). */
export type RedirectResult = {
  kind: 'redirect'
  to: string
  replace?: boolean
}

/** Declarative data outcome from a loader or action (status/headers are optional HTTP-style metadata). */
export type ResponseResult<T = unknown> = {
  kind: 'response'
  status?: number
  headers?: Record<string, string>
  data: T
}

/**
 * Build a {@link RedirectResult} for the router to apply after a loader or action.
 *
 * @param to — Target location (path or URL string accepted by the host history adapter).
 * @param options.replace — When true, replace the current history entry instead of pushing.
 */
export function redirect(to: string, options: { replace?: boolean } = {}): RedirectResult {
  return { kind: 'redirect', to, replace: options.replace }
}

/**
 * Wrap arbitrary data as a {@link ResponseResult} for loaders/actions that return JSON-like payloads
 * or other serializable values without setting `Content-Type` automatically.
 */
export function response<T>(
  data: T,
  options: { status?: number; headers?: Record<string, string> } = {},
): ResponseResult<T> {
  return {
    kind: 'response',
    status: options.status,
    headers: options.headers,
    data,
  }
}

/**
 * Same as {@link response} but sets `Content-Type: application/json` unless the caller overrides it
 * in `options.headers` (later keys from `options.headers` win for the same header name).
 */
export function json<T>(
  data: T,
  options: { status?: number; headers?: Record<string, string> } = {},
): ResponseResult<T> {
  return response(data, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
}

/**
 * Narrow unknown loader/action results to {@link RedirectResult}.
 * Only checks that `value` is a non-null object and `value.kind === 'redirect'` (including inherited `kind`).
 */
export function isRedirectResult(value: unknown): value is RedirectResult {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'redirect'
}

/**
 * Narrow unknown loader/action results to {@link ResponseResult}.
 * Only checks that `value` is a non-null object and `value.kind === 'response'` (including inherited `kind`).
 */
export function isResponseResult(value: unknown): value is ResponseResult<unknown> {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'response'
}

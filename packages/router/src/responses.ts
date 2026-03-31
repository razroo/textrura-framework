export type RedirectResult = {
  kind: 'redirect'
  to: string
  replace?: boolean
}

export type ResponseResult<T = unknown> = {
  kind: 'response'
  status?: number
  headers?: Record<string, string>
  data: T
}

export function redirect(to: string, options: { replace?: boolean } = {}): RedirectResult {
  return { kind: 'redirect', to, replace: options.replace }
}

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

export function isRedirectResult(value: unknown): value is RedirectResult {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'redirect'
}

export function isResponseResult(value: unknown): value is ResponseResult<unknown> {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'response'
}

import type { TwResult } from './index.js'
import { resolveToken } from './resolver.js'

/** Parse a class string into tokens and resolve each to props. */
export function parseClasses(input: string): TwResult {
  if (typeof input !== 'string') return {} as TwResult
  const tokens = input.split(/\s+/).filter(Boolean)
  const result: Record<string, unknown> = {}
  for (const token of tokens) {
    const resolved = resolveToken(token)
    if (resolved) Object.assign(result, resolved)
  }
  return result as TwResult
}

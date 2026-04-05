import type { TwResult } from './index.js'
import { resolveToken } from './resolver.js'

/**
 * Maximum number of whitespace-delimited utility tokens processed per {@link parseClasses} call
 * (and therefore per {@link import('./index.js').tw} after joining arguments). Additional trailing
 * tokens are ignored so hostile megabyte strings cannot force unbounded `split` allocations.
 */
export const MAX_TW_CLASS_TOKENS = 4096

/** Parse a class string into tokens and resolve each to props. */
export function parseClasses(input: string): TwResult {
  if (typeof input !== 'string') return {} as TwResult
  const result: Record<string, unknown> = {}
  const tokenRe = /\S+/g
  let count = 0
  for (let m = tokenRe.exec(input); m !== null; m = tokenRe.exec(input)) {
    if (count >= MAX_TW_CLASS_TOKENS) break
    const resolved = resolveToken(m[0])
    if (resolved) Object.assign(result, resolved)
    count++
  }
  return result as TwResult
}

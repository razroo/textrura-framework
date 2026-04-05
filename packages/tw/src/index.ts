import type { FlexProps } from 'textura'
import type { StyleProps } from '@geometra/core'
import { parseClasses } from './parser.js'

/** Combined flex layout + visual style props returned by `tw()`. */
export type TwResult = FlexProps & StyleProps

/**
 * Convert Tailwind-style utility classes to Geometra props.
 *
 * ```ts
 * box(tw("flex-row items-center p-4 bg-blue-500 rounded-lg"), children)
 * ```
 *
 * Accepts one or more class strings. Last class wins on conflicts.
 * Unknown classes are silently ignored. Non-string arguments are skipped at runtime so corrupt spreads
 * (e.g. `Symbol` values) cannot make `Array#join` throw.
 */
export function tw(...classes: string[]): TwResult {
  const parts: string[] = []
  for (const c of classes) {
    if (typeof c === 'string') parts.push(c)
  }
  return parseClasses(parts.join(' '))
}

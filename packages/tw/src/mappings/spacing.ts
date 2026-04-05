import type { TwResult } from '../index.js'
import { resolveSpacing } from '../spacing.js'

/** Resolve padding/margin prefix classes like p-4, mx-auto, -mt-2. */
export function resolveSpacingPrefix(prefix: string, value: string, negative: boolean): Partial<TwResult> | undefined {
  // Handle margin auto
  if (value === 'auto') {
    switch (prefix) {
      case 'm': return { margin: 'auto' }
      case 'mx': return { marginLeft: 'auto', marginRight: 'auto' }
      case 'my': return { marginTop: 'auto', marginBottom: 'auto' }
      case 'mt': return { marginTop: 'auto' }
      case 'mr': return { marginRight: 'auto' }
      case 'mb': return { marginBottom: 'auto' }
      case 'ml': return { marginLeft: 'auto' }
      default: return undefined
    }
  }

  const px = resolveSpacing(value)
  if (px === undefined) return undefined
  const v = negative ? -px : px

  switch (prefix) {
    case 'p': return { padding: v }
    case 'px': return { paddingHorizontal: v }
    case 'py': return { paddingVertical: v }
    case 'pt': return { paddingTop: v }
    case 'pr': return { paddingRight: v }
    case 'pb': return { paddingBottom: v }
    case 'pl': return { paddingLeft: v }
    case 'm': return { margin: v }
    case 'mx': return { marginHorizontal: v }
    case 'my': return { marginVertical: v }
    case 'mt': return { marginTop: v }
    case 'mr': return { marginRight: v }
    case 'mb': return { marginBottom: v }
    case 'ml': return { marginLeft: v }
    default: return undefined
  }
}

/** All spacing prefixes for prefix detection. */
export const spacingPrefixes = ['px', 'py', 'pt', 'pr', 'pb', 'pl', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'p', 'm'] as const

import type { TwResult } from '../index.js'
import { resolveColor } from '../colors.js'

/** Static border utility classes. */
export const borderMap: Record<string, Partial<TwResult>> = {
  'border': { borderWidth: 1 },
  'border-0': { borderWidth: 0 },
  'border-2': { borderWidth: 2 },
  'border-4': { borderWidth: 4 },
  'border-8': { borderWidth: 8 },

  'rounded-none': { borderRadius: 0 },
  'rounded-sm': { borderRadius: 2 },
  'rounded': { borderRadius: 4 },
  'rounded-md': { borderRadius: 6 },
  'rounded-lg': { borderRadius: 8 },
  'rounded-xl': { borderRadius: 12 },
  'rounded-2xl': { borderRadius: 16 },
  'rounded-3xl': { borderRadius: 24 },
  'rounded-full': { borderRadius: 9999 },
}

/** Resolve border prefix classes like border-t-2, border-red-500. */
export function resolveBorderPrefix(prefix: string, value: string): Partial<TwResult> | undefined {
  // border-{color-shade} e.g. border-red-500
  if (prefix === 'border') {
    const color = resolveColor(value)
    if (color) return { borderColor: color }
    // Try as directional border width
    const num = parseFloat(value)
    if (!Number.isNaN(num)) return { borderWidth: num }
    return undefined
  }

  const num = parseFloat(value)
  if (Number.isNaN(num)) return undefined

  switch (prefix) {
    case 'border-t': return { borderTop: num }
    case 'border-r': return { borderRight: num }
    case 'border-b': return { borderBottom: num }
    case 'border-l': return { borderLeft: num }
    case 'rounded': return { borderRadius: num }
    default: return undefined
  }
}

/** Border prefixes for detection, longest first. */
export const borderPrefixes = ['border-t', 'border-r', 'border-b', 'border-l', 'border', 'rounded'] as const

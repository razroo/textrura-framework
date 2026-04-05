import type { TwResult } from '../index.js'
import { resolveSpacing } from '../spacing.js'

/** Static sizing classes. */
export const sizingMap: Record<string, Partial<TwResult>> = {
  'w-auto': { width: 'auto' },
  'h-auto': { height: 'auto' },
  'aspect-square': { aspectRatio: 1 },
  'aspect-video': { aspectRatio: 16 / 9 },
}

/** Resolve sizing/position prefix classes like w-16, min-h-0, top-4, inset-2. */
export function resolveSizingPrefix(prefix: string, value: string, negative: boolean): Partial<TwResult> | undefined {
  const px = resolveSpacing(value)
  if (px === undefined) return undefined
  const v = negative ? -px : px

  switch (prefix) {
    case 'w': return { width: v }
    case 'h': return { height: v }
    case 'min-w': return { minWidth: v }
    case 'max-w': return { maxWidth: v }
    case 'min-h': return { minHeight: v }
    case 'max-h': return { maxHeight: v }
    case 'top': return { top: v }
    case 'right': return { right: v }
    case 'bottom': return { bottom: v }
    case 'left': return { left: v }
    case 'inset': return { top: v, right: v, bottom: v, left: v }
    case 'aspect': {
      const num = parseFloat(value)
      return !Number.isNaN(num) ? { aspectRatio: num } : undefined
    }
    default: return undefined
  }
}

/** All sizing prefixes for prefix detection, longest first. */
export const sizingPrefixes = ['min-w', 'max-w', 'min-h', 'max-h', 'inset', 'top', 'right', 'bottom', 'left', 'aspect', 'w', 'h'] as const

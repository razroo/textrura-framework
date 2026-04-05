import type { TwResult } from '../index.js'
import { resolveColor } from '../colors.js'

/** Static visual utility classes. */
export const visualMap: Record<string, Partial<TwResult>> = {
  'cursor-default': { cursor: 'default' },
  'cursor-pointer': { cursor: 'pointer' },
  'cursor-grab': { cursor: 'grab' },
  'cursor-grabbing': { cursor: 'grabbing' },
  'cursor-text': { cursor: 'text' },
  'cursor-not-allowed': { cursor: 'not-allowed' },
  'cursor-crosshair': { cursor: 'crosshair' },
  'cursor-move': { cursor: 'move' },
  'cursor-help': { cursor: 'help' },
  'cursor-cell': { cursor: 'cell' },
  'cursor-zoom-in': { cursor: 'zoom-in' },
  'cursor-zoom-out': { cursor: 'zoom-out' },

  'pointer-events-none': { pointerEvents: 'none' },
  'pointer-events-auto': { pointerEvents: 'auto' },
}

/** Resolve visual prefix classes: bg-{color}, text-{color}, opacity-{n}, z-{n}. */
export function resolveVisualPrefix(prefix: string, value: string): Partial<TwResult> | undefined {
  switch (prefix) {
    case 'bg': {
      const color = resolveColor(value)
      return color ? { backgroundColor: color } : undefined
    }
    case 'text': {
      const color = resolveColor(value)
      return color ? { color } : undefined
    }
    case 'opacity': {
      const num = parseFloat(value)
      return !Number.isNaN(num) ? { opacity: num / 100 } : undefined
    }
    case 'z': {
      const num = parseFloat(value)
      return !Number.isNaN(num) ? { zIndex: num } : undefined
    }
    default: return undefined
  }
}

/** Visual prefixes for detection. */
export const visualPrefixes = ['bg', 'text', 'opacity', 'z'] as const

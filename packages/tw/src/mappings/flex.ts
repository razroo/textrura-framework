import type { TwResult } from '../index.js'
import { resolveSpacing } from '../spacing.js'

/** Static flex alignment and sizing classes. */
export const flexMap: Record<string, Partial<TwResult>> = {
  'justify-start': { justifyContent: 'flex-start' },
  'justify-center': { justifyContent: 'center' },
  'justify-end': { justifyContent: 'flex-end' },
  'justify-between': { justifyContent: 'space-between' },
  'justify-around': { justifyContent: 'space-around' },
  'justify-evenly': { justifyContent: 'space-evenly' },

  'items-start': { alignItems: 'flex-start' },
  'items-center': { alignItems: 'center' },
  'items-end': { alignItems: 'flex-end' },
  'items-stretch': { alignItems: 'stretch' },
  'items-baseline': { alignItems: 'baseline' },

  'self-auto': { alignSelf: 'auto' },
  'self-start': { alignSelf: 'flex-start' },
  'self-center': { alignSelf: 'center' },
  'self-end': { alignSelf: 'flex-end' },
  'self-stretch': { alignSelf: 'stretch' },
  'self-baseline': { alignSelf: 'baseline' },

  'content-start': { alignContent: 'flex-start' },
  'content-center': { alignContent: 'center' },
  'content-end': { alignContent: 'flex-end' },
  'content-stretch': { alignContent: 'stretch' },
  'content-between': { alignContent: 'space-between' },
  'content-around': { alignContent: 'space-around' },
  'content-evenly': { alignContent: 'space-evenly' },

  'grow': { flexGrow: 1 },
  'grow-0': { flexGrow: 0 },
  'shrink': { flexShrink: 1 },
  'shrink-0': { flexShrink: 0 },
  'basis-auto': { flexBasis: 'auto' },

  'flex-1': { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  'flex-auto': { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
  'flex-initial': { flexGrow: 0, flexShrink: 1, flexBasis: 'auto' },
  'flex-none': { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
}

/** Dynamic flex prefix handlers. */
export function resolveFlexPrefix(prefix: string, value: string): Partial<TwResult> | undefined {
  const px = resolveSpacing(value)
  switch (prefix) {
    case 'gap': return px !== undefined ? { gap: px } : undefined
    case 'gap-x': return px !== undefined ? { columnGap: px } : undefined
    case 'gap-y': return px !== undefined ? { rowGap: px } : undefined
    case 'basis': return px !== undefined ? { flexBasis: px } : undefined
    default: return undefined
  }
}

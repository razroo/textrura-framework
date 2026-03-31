import type { Direction, UIElement } from './types.js'

export type ResolvedDirection = 'ltr' | 'rtl'

/**
 * Resolve an element direction value to a concrete runtime direction.
 * `auto` currently inherits parent direction until script-level detection lands.
 */
export function resolveDirectionValue(
  dir: Direction | undefined,
  parentDirection: ResolvedDirection = 'ltr',
): ResolvedDirection {
  if (dir === 'rtl') return 'rtl'
  if (dir === 'ltr') return 'ltr'
  return parentDirection
}

/** Resolve concrete direction for a UI element from its own `dir` and parent context. */
export function resolveElementDirection(
  element: UIElement,
  parentDirection: ResolvedDirection = 'ltr',
): ResolvedDirection {
  const dir = (element.props as { dir?: Direction }).dir
  return resolveDirectionValue(dir, parentDirection)
}

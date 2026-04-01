import type { Direction, UIElement } from './types.js'

export type ResolvedDirection = 'ltr' | 'rtl'

/**
 * Resolve an element direction value to a concrete runtime direction.
 * Only `ltr` and `rtl` are honored; `undefined`, `auto`, and any other value (e.g. malformed
 * serialized props) inherit {@link parentDirection} until script-level `auto` detection lands.
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

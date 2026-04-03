import type { Direction, UIElement } from './types.js'

export type ResolvedDirection = 'ltr' | 'rtl'

function normalizeResolvedDirection(value: unknown): ResolvedDirection {
  return value === 'rtl' ? 'rtl' : 'ltr'
}

/**
 * Resolve an element direction value to a concrete runtime direction.
 * Only `ltr` and `rtl` are honored; `undefined`, `auto`, and any other value (e.g. malformed
 * serialized props) inherit {@link parentDirection} until script-level `auto` detection lands.
 * Non-`ltr` / non-`rtl` {@link parentDirection} values (bad callers or deserialized state) fall back to `ltr`.
 */
export function resolveDirectionValue(
  dir: Direction | undefined,
  parentDirection: ResolvedDirection = 'ltr',
): ResolvedDirection {
  const parent = normalizeResolvedDirection(parentDirection)
  if (dir === 'rtl') return 'rtl'
  if (dir === 'ltr') return 'ltr'
  return parent
}

/**
 * Resolve concrete direction for a UI element from its own `dir` and parent context.
 *
 * @param element Any {@link UIElement}; `dir` is read from {@link UIElement.props} when present.
 * @param parentDirection Resolved direction of the visual parent (default `'ltr'`). Invalid values are normalized like {@link resolveDirectionValue}.
 * @returns Concrete `ltr` or `rtl` for layout, text, and hit-testing.
 */
export function resolveElementDirection(
  element: UIElement,
  parentDirection: ResolvedDirection = 'ltr',
): ResolvedDirection {
  const dir = element.props.dir
  return resolveDirectionValue(dir, parentDirection)
}

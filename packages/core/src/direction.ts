import type { Direction, UIElement } from './types.js'

export type ResolvedDirection = 'ltr' | 'rtl'

function normalizeResolvedDirection(value: unknown): ResolvedDirection {
  return value === 'rtl' ? 'rtl' : 'ltr'
}

/**
 * Resolve an element direction value to a concrete runtime direction.
 * Only `ltr` and `rtl` are honored; `undefined`, `auto`, and any other value (e.g. malformed
 * serialized props) inherit {@link parentDirection}. Document-level direction for Yoga flex rows is set
 * separately via {@link import('./app.js').createApp}'s `layoutDirection` option (see `AppOptions` in `app.js`).
 * Non-`ltr` / non-`rtl` {@link parentDirection} values (bad callers or deserialized state) fall back to `ltr`.
 *
 * @returns Resolved `ltr` or `rtl` for layout, text, and hit-testing.
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

/**
 * Yoga / Textura **owner** direction for the layout-tree root: optional host override plus the live UI root.
 *
 * Only exact primitive `'ltr'` and `'rtl'` on `layoutDirection` win; any other value (omitted,
 * `'auto'`, malformed config, boxed strings, etc.) falls back to {@link resolveElementDirection} on
 * `root` with document default `'ltr'`, matching {@link import('./app.js').createApp} and keeping
 * server-driven layout aligned with local canvas apps.
 *
 * @param layoutDirection — Host override (`createServer` / `createApp` option), or any runtime garbage; only `'ltr'` / `'rtl'` count.
 * @param root — Live view root used when the override is absent or invalid. Any {@link UIElement} kind
 *   (`box`, `text`, `image`, `scene3d`) may be the root; `dir` is read from {@link UIElement.props} the same way.
 *
 * @returns Yoga / Textura owner direction: primitive `'ltr'` or `'rtl'` from the host when valid, otherwise
 *   {@link resolveElementDirection} on `root` with document default `'ltr'`.
 */
export function resolveComputeLayoutDirection(
  layoutDirection: unknown,
  root: UIElement,
): ResolvedDirection {
  if (layoutDirection === 'ltr' || layoutDirection === 'rtl') {
    return layoutDirection
  }
  return resolveElementDirection(root, 'ltr')
}

import type { LayoutNode } from 'textura'
import type { UIElement } from './types.js'

/**
 * Removes paint, hit-target, scroll-container, and non-Yoga metadata from element props.
 * Keep this list aligned with {@link StyleProps}, text/image-only fields, and `selectable`
 * (see tests in `tree.test.ts`). Per-node `dir` is forwarded to Textura for non-root nodes only
 * (see {@link toLayoutTree}).
 *
 * `overflow`, `scrollX`, and `scrollY` stay on the **live** {@link UIElement} tree for
 * {@link import('./hit-test.js').dispatchHit}, canvas/terminal paint, and {@link import('./selection.js').collectTextNodes},
 * but are omitted here so the Textura snapshot stays a pure flex/measure input. Scroll offsets and parent-bounds
 * containment come from the live tree in hit-testing/selection; renderers apply `overflow` clip modes when painting
 * instead of threading these props through Yoga/WASM for layout.
 */
function stripStyleProps(props: Record<string, unknown>): Record<string, unknown> {
  const layoutProps = { ...props }
  delete layoutProps.backgroundColor
  delete layoutProps.color
  delete layoutProps.borderColor
  delete layoutProps.borderRadius
  delete layoutProps.borderWidth
  delete layoutProps.opacity
  delete layoutProps.cursor
  delete layoutProps.pointerEvents
  delete layoutProps.zIndex
  delete layoutProps.overflow
  delete layoutProps.scrollX
  delete layoutProps.scrollY
  delete layoutProps.boxShadow
  delete layoutProps.gradient
  delete layoutProps.selectable
  // Image-only props
  delete layoutProps.src
  delete layoutProps.alt
  delete layoutProps.objectFit
  // Scene3d-only props
  delete layoutProps.background
  delete layoutProps.objects
  delete layoutProps.fov
  delete layoutProps.near
  delete layoutProps.far
  delete layoutProps.cameraPosition
  delete layoutProps.cameraTarget
  delete layoutProps.orbitControls
  delete layoutProps.maxPixelRatio
  return layoutProps
}

/**
 * Convert a {@link UIElement} tree into a Textura {@link LayoutNode} for Yoga/WASM layout.
 *
 * Strips everything that is not consumed by Textura layout: colors, borders, opacity, cursor,
 * `pointerEvents`, `zIndex`, `overflow` / `scrollX` / `scrollY`, `boxShadow`, `gradient`,
 * `selectable`, `dir` on the layout root only, image `src` / `alt` / `objectFit`, and scene3d host fields (`background`,
 * `objects`, `fov`, `near`, `far`, `cameraPosition`, `cameraTarget`, `orbitControls`, `maxPixelRatio`).
 * Remaining props are flex and sizing fields that belong in the layout pipeline.
 *
 * Although Textura’s flex props include `overflow`, Geometra does **not** forward it (or scroll offsets) into the
 * layout snapshot: scroll translation and parent rect gates use the live tree for interaction; backends clip paint from
 * `overflow`; Yoga output stays aligned with the layout geometry those paths consume.
 *
 * The layout **root** omits `dir` so {@link import('./app.js').createApp}'s
 * {@link import('./app.js').AppOptions.layoutDirection} (or the root element’s resolved `dir` when that
 * option is omitted) stays the single source of truth for the Yoga owner direction passed to Textura.
 * Descendant nodes forward `dir` (`ltr` | `rtl` | `auto`, or malformed strings from bad serialization) into Textura
 * for per-subtree flex direction; Textura maps non-`ltr` / non-`rtl` values to Yoga **Inherit** (same as `auto`).
 * Interaction helpers still resolve direction with {@link import('./direction.js').resolveElementDirection}.
 *
 * Does not mutate the source element or its `props` (strip list is applied to a shallow copy).
 *
 * @param isLayoutRoot — When `true` (default), this node's `dir` is omitted so
 * {@link import('./app.js').AppOptions.layoutDirection} (or Yoga owner direction from the host) stays the single
 * source of truth for the **geometric** layout root. Pass `false` only when treating this element as the root of a
 * subtree you embed yourself (e.g. custom `computeLayout` on a fragment): `dir` is then forwarded on that head like
 * any non-root node.
 *
 * Runtime fields on boxes (`handlers`, `semantic`, `key`) are not part of `element.props` and
 * are unchanged on the live tree — they are not copied into the layout snapshot.
 */
export function toLayoutTree(element: UIElement, isLayoutRoot = true): LayoutNode {
  const layoutProps = stripStyleProps(element.props as Record<string, unknown>)
  if (isLayoutRoot) {
    delete layoutProps.dir
  }

  if (element.kind === 'text' || element.kind === 'image' || element.kind === 'scene3d') {
    return layoutProps as LayoutNode
  }

  return {
    ...layoutProps,
    children: element.children.map((child) => toLayoutTree(child, false)),
  } as LayoutNode
}

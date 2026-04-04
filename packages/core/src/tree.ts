import type { LayoutNode } from 'textura'
import type { UIElement } from './types.js'

/**
 * Removes paint, hit-target, scroll-container, and non-Yoga metadata from element props.
 * Keep this list aligned with {@link StyleProps}, text/image-only fields, and `dir` /
 * `selectable` (see tests in `tree.test.ts`).
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
  // Direction metadata is resolved by interaction/text helpers, not Yoga.
  delete layoutProps.dir
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
 * `selectable`, `dir`, image `src` / `alt` / `objectFit`, and scene3d host fields (`background`,
 * `objects`, `fov`, `near`, `far`, `cameraPosition`, `cameraTarget`, `orbitControls`, `maxPixelRatio`).
 * Remaining props are flex and sizing fields that belong in the layout pipeline.
 *
 * Per-node `dir` is intentionally stripped from layout nodes: Yoga/Textura receives one document
 * direction from {@link import('./app.js').createApp}'s {@link import('./app.js').AppOptions.layoutDirection}
 * (or the root element’s resolved `dir` when that option is omitted), while nested `dir` on the live
 * {@link UIElement} tree is resolved at text, focus, selection, and hit-test time with
 * {@link import('./direction.js').resolveElementDirection}. ROADMAP.md “Deferred / research” tracks an
 * optional future pass that would thread per-node direction through Textura layout props.
 *
 * Does not mutate the source element or its `props` (strip list is applied to a shallow copy).
 *
 * Runtime fields on boxes (`handlers`, `semantic`, `key`) are not part of `element.props` and
 * are unchanged on the live tree — they are not copied into the layout snapshot.
 */
export function toLayoutTree(element: UIElement): LayoutNode {
  const layoutProps = stripStyleProps(element.props as Record<string, unknown>)

  if (element.kind === 'text' || element.kind === 'image' || element.kind === 'scene3d') {
    return layoutProps as LayoutNode
  }

  return {
    ...layoutProps,
    children: element.children.map(toLayoutTree),
  } as LayoutNode
}

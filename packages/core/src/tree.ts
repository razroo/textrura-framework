import type { LayoutNode } from 'textura'
import type { UIElement } from './types.js'

/** Style/visual props that must be stripped before passing to Yoga layout. */
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
  return layoutProps
}

/** Convert a UIElement tree into a textura LayoutNode tree for layout computation. */
export function toLayoutTree(element: UIElement): LayoutNode {
  const layoutProps = stripStyleProps(element.props as Record<string, unknown>)

  if (element.kind === 'text' || element.kind === 'image') {
    return layoutProps as LayoutNode
  }

  return {
    ...layoutProps,
    children: element.children.map(toLayoutTree),
  } as LayoutNode
}

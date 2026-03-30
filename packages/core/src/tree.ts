import type { LayoutNode } from 'textura'
import type { UIElement } from './types.js'

/** Convert a UIElement tree into a textura LayoutNode tree for layout computation. */
export function toLayoutTree(element: UIElement): LayoutNode {
  if (element.kind === 'text') {
    const { backgroundColor: _bg, color: _c, borderColor: _bc, borderRadius: _br, opacity: _o, ...layoutProps } = element.props
    return layoutProps
  }

  const { backgroundColor: _bg, color: _c, borderColor: _bc, borderRadius: _br, opacity: _o, ...layoutProps } = element.props
  return {
    ...layoutProps,
    children: element.children.map(toLayoutTree),
  }
}

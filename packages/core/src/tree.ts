import type { LayoutNode } from 'textura'
import type { UIElement } from './types.js'

/** Style/visual props that must be stripped before passing to Yoga layout. */
function stripStyleProps(props: Record<string, unknown>): Record<string, unknown> {
  const {
    backgroundColor: _bg, color: _c, borderColor: _bc, borderRadius: _br, borderWidth: _bw,
    opacity: _o, cursor: _cur, zIndex: _z, overflow: _ov, scrollX: _sx, scrollY: _sy,
    boxShadow: _bs, gradient: _g, selectable: _sel,
    // Image-only props
    src: _src, alt: _alt, objectFit: _of,
    ...layoutProps
  } = props
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

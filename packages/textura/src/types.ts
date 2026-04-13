// --- Input types: declarative UI tree description ---

/** CSS-like flexbox properties shared by all container nodes. */
export interface FlexProps {
  /** Default: 'column' */
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse'
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse'
  justifyContent?:
    | 'flex-start'
    | 'center'
    | 'flex-end'
    | 'space-between'
    | 'space-around'
    | 'space-evenly'
  alignItems?:
    | 'flex-start'
    | 'center'
    | 'flex-end'
    | 'stretch'
    | 'baseline'
  alignSelf?:
    | 'auto'
    | 'flex-start'
    | 'center'
    | 'flex-end'
    | 'stretch'
    | 'baseline'
  alignContent?:
    | 'flex-start'
    | 'center'
    | 'flex-end'
    | 'stretch'
    | 'space-between'
    | 'space-around'
    | 'space-evenly'

  flexGrow?: number
  flexShrink?: number
  flexBasis?: number | 'auto'

  width?: number | 'auto'
  height?: number | 'auto'
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number

  padding?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingHorizontal?: number
  paddingVertical?: number
  /** Logical inline-start padding: resolves to left in LTR, right in RTL. */
  paddingInlineStart?: number
  /** Logical inline-end padding: resolves to right in LTR, left in RTL. */
  paddingInlineEnd?: number
  /** Logical block-start padding (alias for paddingTop in horizontal writing modes). */
  paddingBlockStart?: number
  /** Logical block-end padding (alias for paddingBottom in horizontal writing modes). */
  paddingBlockEnd?: number

  margin?: number | 'auto'
  marginTop?: number | 'auto'
  marginRight?: number | 'auto'
  marginBottom?: number | 'auto'
  marginLeft?: number | 'auto'
  marginHorizontal?: number | 'auto'
  marginVertical?: number | 'auto'
  /** Logical inline-start margin: resolves to left in LTR, right in RTL. */
  marginInlineStart?: number | 'auto'
  /** Logical inline-end margin: resolves to right in LTR, left in RTL. */
  marginInlineEnd?: number | 'auto'
  /** Logical block-start margin (alias for marginTop in horizontal writing modes). */
  marginBlockStart?: number | 'auto'
  /** Logical block-end margin (alias for marginBottom in horizontal writing modes). */
  marginBlockEnd?: number | 'auto'

  border?: number
  borderTop?: number
  borderRight?: number
  borderBottom?: number
  borderLeft?: number
  /** Logical inline-start border: resolves to left in LTR, right in RTL. */
  borderInlineStart?: number
  /** Logical inline-end border: resolves to right in LTR, left in RTL. */
  borderInlineEnd?: number
  /** Logical block-start border (alias for borderTop in horizontal writing modes). */
  borderBlockStart?: number
  /** Logical block-end border (alias for borderBottom in horizontal writing modes). */
  borderBlockEnd?: number

  gap?: number
  rowGap?: number
  columnGap?: number

  position?: 'relative' | 'absolute'
  top?: number
  right?: number
  bottom?: number
  left?: number
  /** Logical inline-start position: resolves to left in LTR, right in RTL. */
  insetInlineStart?: number
  /** Logical inline-end position: resolves to right in LTR, left in RTL. */
  insetInlineEnd?: number
  /** Logical block-start position (alias for top in horizontal writing modes). */
  insetBlockStart?: number
  /** Logical block-end position (alias for bottom in horizontal writing modes). */
  insetBlockEnd?: number

  aspectRatio?: number
  overflow?: 'visible' | 'hidden' | 'scroll'
  display?: 'flex' | 'none'

  /**
   * Per-node layout direction for Yoga (`setDirection`).
   *
   * - `'ltr'` / `'rtl'` set an explicit direction on this node.
   * - `'auto'`, **`null`**, and any other string still reach the engine at runtime; they are treated like Yoga
   *   **Inherit** (parent, then the root owner direction from `computeLayout` options). Geometra may forward
   *   JSON `null` or unknown serialized `dir` strings on nested nodes for this path while resolving interaction
   *   direction separately in core.
   *
   * Type-level: `(string & {})` allows arbitrary strings from transport/fixtures without erasing the named
   * literals above (same pattern as permissive JSON props elsewhere).
   */
  dir?: 'ltr' | 'rtl' | 'auto' | null | (string & {})
}

/** A text leaf node. Has text content, font, and lineHeight for measurement. */
export interface TextNode extends FlexProps {
  text: string
  /** Canvas font shorthand, e.g. '16px Inter' */
  font: string
  /** Line height in pixels */
  lineHeight: number
  /** Pretext whiteSpace mode */
  whiteSpace?: 'normal' | 'pre-wrap' | 'nowrap'
}

/** A container (box) node that can have children. */
export interface BoxNode extends FlexProps {
  children?: LayoutNode[]
}

/** A node in the declarative layout tree. */
export type LayoutNode = TextNode | BoxNode

/** Type guard: is this node a text leaf? */
export function isTextNode(node: LayoutNode): node is TextNode {
  return 'text' in node && typeof (node as TextNode).text === 'string'
}

// --- Output types: computed layout geometry ---

/** Computed layout for a single node in the tree. */
export interface ComputedLayout {
  x: number
  y: number
  width: number
  height: number
  children: ComputedLayout[]
  /** Present only on text nodes: the measured line count. */
  lineCount?: number
  /** Present only on text nodes: the original text content. */
  text?: string
}

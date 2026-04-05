import type { Node, Config } from 'yoga-layout'
import {
  loadYoga,
  FlexDirection,
  Align,
  Justify,
  Wrap,
  Edge,
  Gutter,
  MeasureMode,
  PositionType,
  Overflow,
  Display,
  Direction,
} from 'yoga-layout/load'
import type { Yoga } from 'yoga-layout/load'
import { prepare, prepareWithSegments, layout, walkLineRanges, clearCache } from '@chenglou/pretext'

import {
  type LayoutNode,
  type ComputedLayout,
  type FlexProps,
  isTextNode,
} from './types.js'

let yoga: Yoga | null = null
let config: Config | null = null

function getConfig(): Config {
  if (config === null) throw new Error('textura: call init() first')
  return config
}

/** Initialize the Yoga WASM runtime. Must be called once before computeLayout. */
export async function init(): Promise<void> {
  if (yoga !== null) return
  yoga = await loadYoga()
  config = yoga.Config.create()
  config.setUseWebDefaults(true)
}

/** Release Yoga config. Mostly useful for tests. */
export function destroy(): void {
  if (config !== null) {
    config.free()
    config = null
  }
  yoga = null
}

/** Clear Pretext's internal measurement caches. */
export { clearCache }

// --- Flex property mapping ---

const FLEX_DIRECTION_MAP = {
  row: FlexDirection.Row,
  column: FlexDirection.Column,
  'row-reverse': FlexDirection.RowReverse,
  'column-reverse': FlexDirection.ColumnReverse,
} as const

const JUSTIFY_MAP = {
  'flex-start': Justify.FlexStart,
  center: Justify.Center,
  'flex-end': Justify.FlexEnd,
  'space-between': Justify.SpaceBetween,
  'space-around': Justify.SpaceAround,
  'space-evenly': Justify.SpaceEvenly,
} as const

const ALIGN_MAP = {
  auto: Align.Auto,
  'flex-start': Align.FlexStart,
  center: Align.Center,
  'flex-end': Align.FlexEnd,
  stretch: Align.Stretch,
  baseline: Align.Baseline,
  'space-between': Align.SpaceBetween,
  'space-around': Align.SpaceAround,
  'space-evenly': Align.SpaceEvenly,
} as const

const WRAP_MAP = {
  nowrap: Wrap.NoWrap,
  wrap: Wrap.Wrap,
  'wrap-reverse': Wrap.WrapReverse,
} as const

const OVERFLOW_MAP = {
  visible: Overflow.Visible,
  hidden: Overflow.Hidden,
  scroll: Overflow.Scroll,
} as const

/** True when `key` is an own property of `map` (not `Object.prototype` keys like `toString`). */
function isOwnEnumKey<T extends Record<string, unknown>>(map: T, key: unknown): key is keyof T {
  return typeof key === 'string' && Object.hasOwn(map, key)
}

function applyFlexProps(node: Node, props: FlexProps): void {
  const flexDirection = props.flexDirection
  if (flexDirection !== undefined && isOwnEnumKey(FLEX_DIRECTION_MAP, flexDirection)) {
    node.setFlexDirection(FLEX_DIRECTION_MAP[flexDirection])
  }
  const flexWrap = props.flexWrap
  if (flexWrap !== undefined && isOwnEnumKey(WRAP_MAP, flexWrap)) {
    node.setFlexWrap(WRAP_MAP[flexWrap])
  }
  const justifyContent = props.justifyContent
  if (justifyContent !== undefined && isOwnEnumKey(JUSTIFY_MAP, justifyContent)) {
    node.setJustifyContent(JUSTIFY_MAP[justifyContent])
  }
  const alignItems = props.alignItems
  if (alignItems !== undefined && isOwnEnumKey(ALIGN_MAP, alignItems)) {
    node.setAlignItems(ALIGN_MAP[alignItems])
  }
  const alignSelf = props.alignSelf
  if (alignSelf !== undefined && isOwnEnumKey(ALIGN_MAP, alignSelf)) {
    node.setAlignSelf(ALIGN_MAP[alignSelf])
  }
  const alignContent = props.alignContent
  if (alignContent !== undefined && isOwnEnumKey(ALIGN_MAP, alignContent)) {
    node.setAlignContent(ALIGN_MAP[alignContent])
  }

  if (props.flexGrow !== undefined) node.setFlexGrow(props.flexGrow)
  if (props.flexShrink !== undefined) node.setFlexShrink(props.flexShrink)
  if (props.flexBasis !== undefined) node.setFlexBasis(props.flexBasis)

  // Dimensions
  if (props.width !== undefined) node.setWidth(props.width)
  if (props.height !== undefined) node.setHeight(props.height)
  if (props.minWidth !== undefined) node.setMinWidth(props.minWidth)
  if (props.maxWidth !== undefined) node.setMaxWidth(props.maxWidth)
  if (props.minHeight !== undefined) node.setMinHeight(props.minHeight)
  if (props.maxHeight !== undefined) node.setMaxHeight(props.maxHeight)

  // Padding
  if (props.padding !== undefined) node.setPadding(Edge.All, props.padding)
  if (props.paddingTop !== undefined) node.setPadding(Edge.Top, props.paddingTop)
  if (props.paddingRight !== undefined)
    node.setPadding(Edge.Right, props.paddingRight)
  if (props.paddingBottom !== undefined)
    node.setPadding(Edge.Bottom, props.paddingBottom)
  if (props.paddingLeft !== undefined)
    node.setPadding(Edge.Left, props.paddingLeft)
  if (props.paddingHorizontal !== undefined)
    node.setPadding(Edge.Horizontal, props.paddingHorizontal)
  if (props.paddingVertical !== undefined)
    node.setPadding(Edge.Vertical, props.paddingVertical)

  // Margin
  if (props.margin !== undefined) node.setMargin(Edge.All, props.margin)
  if (props.marginTop !== undefined) node.setMargin(Edge.Top, props.marginTop)
  if (props.marginRight !== undefined)
    node.setMargin(Edge.Right, props.marginRight)
  if (props.marginBottom !== undefined)
    node.setMargin(Edge.Bottom, props.marginBottom)
  if (props.marginLeft !== undefined) node.setMargin(Edge.Left, props.marginLeft)
  if (props.marginHorizontal !== undefined)
    node.setMargin(Edge.Horizontal, props.marginHorizontal)
  if (props.marginVertical !== undefined)
    node.setMargin(Edge.Vertical, props.marginVertical)

  // Border
  if (props.border !== undefined) node.setBorder(Edge.All, props.border)
  if (props.borderTop !== undefined) node.setBorder(Edge.Top, props.borderTop)
  if (props.borderRight !== undefined)
    node.setBorder(Edge.Right, props.borderRight)
  if (props.borderBottom !== undefined)
    node.setBorder(Edge.Bottom, props.borderBottom)
  if (props.borderLeft !== undefined) node.setBorder(Edge.Left, props.borderLeft)

  // Gap
  if (props.gap !== undefined) node.setGap(Gutter.All, props.gap)
  if (props.rowGap !== undefined) node.setGap(Gutter.Row, props.rowGap)
  if (props.columnGap !== undefined) node.setGap(Gutter.Column, props.columnGap)

  // Position
  if (props.position !== undefined)
    node.setPositionType(
      props.position === 'absolute' ? PositionType.Absolute : PositionType.Relative,
    )
  if (props.top !== undefined) node.setPosition(Edge.Top, props.top)
  if (props.right !== undefined) node.setPosition(Edge.Right, props.right)
  if (props.bottom !== undefined) node.setPosition(Edge.Bottom, props.bottom)
  if (props.left !== undefined) node.setPosition(Edge.Left, props.left)

  // Other
  if (props.aspectRatio !== undefined) node.setAspectRatio(props.aspectRatio)
  const overflow = props.overflow
  if (overflow !== undefined && isOwnEnumKey(OVERFLOW_MAP, overflow)) {
    node.setOverflow(OVERFLOW_MAP[overflow])
  }
  if (props.display !== undefined)
    node.setDisplay(props.display === 'none' ? Display.None : Display.Flex)

  if (props.dir !== undefined) {
    if (props.dir === 'rtl') node.setDirection(Direction.RTL)
    else if (props.dir === 'ltr') node.setDirection(Direction.LTR)
    else node.setDirection(Direction.Inherit)
  }
}

// --- Parallel metadata tree ---
// Yoga's getChild() returns new JS wrappers, so WeakMap keyed by Node
// won't match across insertChild/getChild. We keep a parallel tree instead.

interface MetaNode {
  text?: string
  lineCount?: number
  children: MetaNode[]
}

interface BuildResult {
  yogaNode: Node
  meta: MetaNode
}

function buildNode(desc: LayoutNode): BuildResult {
  if (yoga === null) throw new Error('textura: call init() first')

  const node = yoga.Node.create(getConfig())
  applyFlexProps(node, desc)

  const meta: MetaNode = { children: [] }

  if (isTextNode(desc)) {
    const whiteSpace = desc.whiteSpace
    // Default to nowrap — most UI text (labels, values, titles) should not
    // word-wrap.  Developers opt-in to wrapping via whiteSpace: 'normal'.
    const shouldWrap = whiteSpace === 'normal' || whiteSpace === 'pre-wrap'
    const font = desc.font
    const text = desc.text
    const lineHeight = desc.lineHeight

    meta.text = text
    // lineCount will be filled after measure
    let lastLineCount = 0

    node.setMeasureFunc(
      (
        width: number,
        widthMode: MeasureMode,
        _height: number,
        _heightMode: MeasureMode,
      ) => {
        const opts = shouldWrap ? { whiteSpace: whiteSpace! } : undefined

        let maxWidth: number
        if (!shouldWrap) {
          maxWidth = 1e7
        } else if (widthMode === MeasureMode.Exactly || widthMode === MeasureMode.AtMost) {
          maxWidth = width
        } else {
          maxWidth = 1e7
        }

        if (widthMode === MeasureMode.Exactly && shouldWrap) {
          const prepared = prepare(text, font, opts)
          const result = layout(prepared, maxWidth, lineHeight)
          lastLineCount = result.lineCount
          meta.lineCount = lastLineCount
          return { width, height: result.height }
        }

        const prepared = prepareWithSegments(text, font, opts)
        let contentWidth = 0
        const lineCount = walkLineRanges(prepared, maxWidth, (line) => {
          if (line.width > contentWidth) contentWidth = line.width
        })
        lastLineCount = lineCount
        meta.lineCount = lineCount
        const height = lineCount * lineHeight

        // Buffer text width to account for font rendering differences
        // between server (node-canvas) and browser canvas.  Server may
        // lack the requested font (e.g. Inter) and fall back to a
        // narrower system font, causing measured width to be too small.
        // Without this, text gets clipped by parent overflow:hidden.
        const bufferedWidth = Math.ceil(contentWidth * 1.15) + 2

        const reportedWidth =
          !shouldWrap
            ? bufferedWidth
            : widthMode === MeasureMode.AtMost
              ? Math.min(bufferedWidth, width)
              : bufferedWidth

        return { width: reportedWidth, height }
      },
    )
  } else {
    const children = desc.children
    if (children) {
      for (let i = 0; i < children.length; i++) {
        const child = buildNode(children[i]!)
        node.insertChild(child.yogaNode, i)
        meta.children.push(child.meta)
      }
    }
  }

  return { yogaNode: node, meta }
}

// --- Layout readback ---

function readLayout(node: Node, meta: MetaNode): ComputedLayout {
  const computed: ComputedLayout = {
    x: node.getComputedLeft(),
    y: node.getComputedTop(),
    width: node.getComputedWidth(),
    height: node.getComputedHeight(),
    children: [],
  }

  if (meta.text !== undefined) {
    computed.text = meta.text
    computed.lineCount = meta.lineCount ?? 0
  }

  const childCount = node.getChildCount()
  for (let i = 0; i < childCount; i++) {
    computed.children.push(readLayout(node.getChild(i), meta.children[i]!))
  }

  return computed
}

// --- Public API ---

export interface ComputeOptions {
  /**
   * Available width for the root container. Default: unconstrained.
   *
   * Runtime: only finite primitive numbers are forwarded to Yoga; `NaN`, `±Infinity`, negatives, and non-numbers
   * (e.g. corrupted JSON) are ignored per-axis, same as omitting `width`. IEEE `-0` is normalized to `+0`.
   */
  width?: number
  /**
   * Available height for the root container. Default: unconstrained.
   *
   * Same constraint guard as {@link ComputeOptions.width}.
   */
  height?: number
  /**
   * Yoga **owner** direction passed to `calculateLayout` (document / root context). It seeds inheritance
   * for nodes that use `dir: 'auto'` or Yoga’s default inherit behavior.
   *
   * Nodes may also set {@link FlexProps.dir} for per-subtree layout direction (mirrors flex rows, start/end).
   * Geometra’s `createApp` maps `AppOptions.layoutDirection` or the root element’s resolved `dir` here while
   * omitting `dir` on the layout-tree root so this option stays authoritative for the host root.
   *
   * Default: `'ltr'`.
   *
   * Runtime: only the exact string `'rtl'` selects RTL; any other value (including `'RTL'`, whitespace,
   * or corrupted deserialization) falls back to LTR — same as omitting `direction`.
   */
  direction?: 'ltr' | 'rtl'
}

function sanitizeOwnerConstraint(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const v = Object.is(value, -0) ? 0 : value
  return v >= 0 ? v : undefined
}

/**
 * Compute the full layout geometry for a declarative UI tree.
 *
 * Builds a Yoga node tree, wires Pretext text measurement into leaf nodes,
 * runs Yoga's flexbox algorithm, and returns the computed positions and sizes.
 *
 * Combine {@link ComputeOptions.direction} with optional per-node {@link FlexProps.dir} on each
 * {@link LayoutNode} for mixed-direction flex subtrees.
 *
 * @throws {Error} If {@link init} has not completed (`textura: call init() first`).
 */
export function computeLayout(
  tree: LayoutNode,
  options?: ComputeOptions,
): ComputedLayout {
  if (yoga === null) throw new Error('textura: call init() first')

  const { yogaNode: root, meta } = buildNode(tree)

  const w = sanitizeOwnerConstraint(options?.width)
  const h = sanitizeOwnerConstraint(options?.height)
  const dir =
    options?.direction === 'rtl' ? Direction.RTL : Direction.LTR

  root.calculateLayout(w, h, dir)
  const result = readLayout(root, meta)
  root.freeRecursive()

  return result
}

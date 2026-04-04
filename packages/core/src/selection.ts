import type { ComputedLayout } from 'textura'
import type { UIElement, TextElement } from './types.js'
import { resolveElementDirection, type ResolvedDirection } from './direction.js'
import { finiteNumberOrZero, layoutBoundsAreFinite } from './layout-bounds.js'

/** Info about a rendered text node's position and content. */
export interface TextNodeInfo {
  element: TextElement
  /** Resolved runtime direction for this node. */
  direction: ResolvedDirection
  /** Absolute x position. */
  x: number
  /** Absolute y position. */
  y: number
  width: number
  height: number
  /** Rendered lines with character-level offsets. */
  lines: TextLineInfo[]
  /** Index in the flat list of all text nodes (document order). */
  index: number
}

export interface TextLineInfo {
  text: string
  x: number
  y: number
  /** Cumulative x offset of each character start, relative to line x. */
  charOffsets: number[]
  /** Width of each character. */
  charWidths: number[]
}

/** A selection range across text nodes. */
export interface SelectionRange {
  /** Index of the anchor text node. */
  anchorNode: number
  /** Character offset within the anchor node's full text. */
  anchorOffset: number
  /** Index of the focus text node. */
  focusNode: number
  /** Character offset within the focus node's full text. */
  focusOffset: number
}

/**
 * Collect all selectable text nodes from the element tree with their absolute positions.
 * Root `offsetX` / `offsetY` share the same coordinate space as pointer hits; non-finite or non-number
 * values are treated as `0` (same rule as {@link import('./hit-test.js').dispatchHit} /
 * {@link import('./hit-test.js').hitPathAtPoint} for rooted surfaces).
 *
 * Nodes whose {@link ComputedLayout} bounds fail {@link layoutBoundsAreFinite} are skipped, and box
 * subtrees under a corrupt parent are not walked — same rule as hit-testing and focus order so bad
 * geometry cannot poison absolute coordinates or flood selection with unusable entries.
 *
 * For each box, child origins subtract {@link import('./types.js').StyleProps.scrollX} /
 * `scrollY` (non-finite values → `0`), matching {@link import('./hit-test.js').dispatchHit} and
 * canvas paint so text metrics and pointer hit-testing share one coordinate space inside scroll containers.
 */
export function collectTextNodes(
  element: UIElement,
  layout: ComputedLayout,
  offsetX: number,
  offsetY: number,
  results: TextNodeInfo[],
  parentDirection: ResolvedDirection = 'ltr',
): void {
  collectTextNodesWalk(
    element,
    layout,
    finiteNumberOrZero(offsetX),
    finiteNumberOrZero(offsetY),
    results,
    parentDirection,
  )
}

function collectTextNodesWalk(
  element: UIElement,
  layout: ComputedLayout,
  offsetX: number,
  offsetY: number,
  results: TextNodeInfo[],
  parentDirection: ResolvedDirection,
): void {
  if (!layoutBoundsAreFinite(layout)) return

  const x = offsetX + layout.x
  const y = offsetY + layout.y
  const direction = resolveElementDirection(element, parentDirection)

  if (element.kind === 'text') {
    if (element.props.selectable !== false) {
      results.push({
        element,
        direction,
        x,
        y,
        width: layout.width,
        height: layout.height,
        lines: [], // Populated by the renderer (needs ctx.measureText)
        index: results.length,
      })
    }
    return
  }

  if (element.kind !== 'box') return

  const childOffsetX = x - finiteNumberOrZero(element.props.scrollX)
  const childOffsetY = y - finiteNumberOrZero(element.props.scrollY)

  for (let i = 0; i < element.children.length; i++) {
    const childLayout = layout.children[i]
    if (childLayout) {
      collectTextNodesWalk(element.children[i]!, childLayout, childOffsetX, childOffsetY, results, direction)
    }
  }
}

/** Clamp a selection offset to `[0, textLength]`; non-finite / non-number → `0` (no `slice` negative-index semantics). */
function clampCharIndex(offset: unknown, textLength: number): number {
  if (typeof offset !== 'number' || !Number.isFinite(offset)) return 0
  const t = Math.trunc(offset)
  if (t < 0) return 0
  if (t > textLength) return textLength
  return t
}

/**
 * Get the selected text from a selection range and text node info list.
 *
 * Node indices are clamped to existing `textNodes` so corrupt or deserialized ranges cannot walk
 * millions of empty indices. When `focusNode` lies past the last node, the range end is treated as
 * that last node so `focusOffset` still applies. When the normalized range lies entirely outside
 * `[0, textNodes.length - 1]`, returns an empty string.
 *
 * Per-node character offsets are clamped to `[0, text.length]` and truncated toward zero so corrupt
 * ranges cannot use `String.prototype.slice` negative indices or fractional positions.
 */
export function getSelectedText(
  range: SelectionRange,
  textNodes: TextNodeInfo[],
): string {
  if (textNodes.length === 0) return ''

  // Normalize: ensure start <= end
  let startNode = range.anchorNode
  let startOffset = range.anchorOffset
  let endNode = range.focusNode
  let endOffset = range.focusOffset

  if (startNode > endNode || (startNode === endNode && startOffset > endOffset)) {
    ;[startNode, endNode] = [endNode, startNode]
    ;[startOffset, endOffset] = [endOffset, startOffset]
  }

  const maxIdx = textNodes.length - 1
  if (endNode < 0 || startNode > maxIdx) return ''

  const lo = Math.max(0, startNode)
  const hi = Math.min(endNode, maxIdx)
  if (lo > hi) return ''

  const startClipped = startNode < 0
  const endClipped = endNode > maxIdx

  const parts: string[] = []
  for (let i = lo; i <= hi; i++) {
    const node = textNodes[i]
    if (!node) continue
    const fullText = node.element.props.text
    const len = fullText.length
    const atStart = i === startNode || (startClipped && i === lo)
    const atEnd = i === endNode || (endClipped && i === hi)
    if (atStart && atEnd) {
      parts.push(fullText.slice(clampCharIndex(startOffset, len), clampCharIndex(endOffset, len)))
    } else if (atStart) {
      parts.push(fullText.slice(clampCharIndex(startOffset, len)))
    } else if (atEnd) {
      parts.push(fullText.slice(0, clampCharIndex(endOffset, len)))
    } else {
      parts.push(fullText)
    }
  }

  return parts.join('\n')
}

function textNodeBoundsAreFinite(node: TextNodeInfo): boolean {
  return layoutBoundsAreFinite({
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    children: [],
  })
}

/** Find which text node and character offset is at a given (x, y) point. Coordinates must be finite numbers — otherwise `null` (e.g. NaN, ±Infinity, BigInt, or non-numbers). Nodes with non-finite or negative-size bounds are skipped (aligned with {@link import('./layout-bounds.js').layoutBoundsAreFinite}). */
export function hitTestText(
  textNodes: TextNodeInfo[],
  px: number,
  py: number,
): { nodeIndex: number; charOffset: number } | null {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null

  for (const node of textNodes) {
    if (!textNodeBoundsAreFinite(node)) continue
    // Check if point is within the text node's bounding box
    if (px < node.x || px > node.x + node.width || py < node.y || py > node.y + node.height) {
      continue
    }

    // Find the line
    let globalCharOffset = 0
    for (const line of node.lines) {
      const lineBottom = line.y + (node.element.props.lineHeight)
      if (py >= line.y && py < lineBottom) {
        // Find the character within the line
        const localX = px - line.x
        const lineVisualWidth = line.charOffsets.length > 0
          ? (line.charOffsets[line.charOffsets.length - 1] ?? 0) + (line.charWidths[line.charWidths.length - 1] ?? 0)
          : 0
        if (node.direction === 'rtl') {
          // In RTL mode, map visual x from the right edge back to logical indices.
          const visualFromRight = lineVisualWidth - localX
          for (let c = 0; c < line.charOffsets.length; c++) {
            const charStart = line.charOffsets[c]!
            const charEnd = charStart + line.charWidths[c]!
            if (visualFromRight < (charStart + charEnd) / 2) {
              return { nodeIndex: node.index, charOffset: globalCharOffset + c }
            }
          }
        } else {
          for (let c = 0; c < line.charOffsets.length; c++) {
            const charStart = line.charOffsets[c]!
            const charEnd = charStart + line.charWidths[c]!
            if (localX < (charStart + charEnd) / 2) {
              return { nodeIndex: node.index, charOffset: globalCharOffset + c }
            }
          }
        }
        // Past the end of the line — snap to end
        return { nodeIndex: node.index, charOffset: globalCharOffset + line.text.length }
      }
      globalCharOffset += line.text.length
    }

    // Point is within node bounds but between lines — snap to nearest
    return { nodeIndex: node.index, charOffset: 0 }
  }

  return null
}

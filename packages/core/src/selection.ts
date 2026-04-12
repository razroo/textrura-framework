import type { ComputedLayout } from 'textura'
import type { UIElement, TextElement } from './types.js'
import { resolveElementDirection, type ResolvedDirection } from './direction.js'
import {
  finiteNumberOrZero,
  layoutBoundsAreFinite,
  pointInInclusiveLayoutRect,
  scrollSafeChildOffsets,
} from './layout-bounds.js'

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
 * Boxes with a missing or non-array {@link import('./types.js').BoxElement.children} field are treated as
 * leaves (no throw), matching {@link import('./focus.js').collectFocusOrder} and hit-testing.
 *
 * For each box, child origins subtract {@link import('./types.js').StyleProps.scrollX} /
 * `scrollY` (non-finite values → `0`), matching {@link import('./hit-test.js').dispatchHit} and
 * canvas paint so text metrics and pointer hit-testing share one coordinate space inside scroll containers.
 * When `abs - scroll` overflows to non-finite values, child subtrees are skipped (same
 * {@link import('./layout-bounds.js').scrollSafeChildOffsets} rule as hit-testing) so corrupt extremes
 * cannot emit text nodes with non-finite coordinates.
 *
 * Sibling order is **element child index** (tree source order), not {@link import('./types.js').StyleProps.zIndex}
 * paint order — pointer routing uses z-index for topmost hits; selection indexing stays stable for a11y and ranges.
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

  const kids = element.children
  if (!Array.isArray(kids)) return

  const childOrigin = scrollSafeChildOffsets(x, y, element.props.scrollX, element.props.scrollY)
  if (!childOrigin) return

  for (let i = 0; i < kids.length; i++) {
    const childLayout = layout.children[i]
    if (childLayout) {
      collectTextNodesWalk(
        kids[i]!,
        childLayout,
        childOrigin.ox,
        childOrigin.oy,
        results,
        direction,
      )
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
 * Node indices must be numbers; `NaN`, non-numbers, and `BigInt` yield an empty string. Finite indices
 * are truncated toward zero. `±Infinity` is preserved so an end index past the last node still clamps
 * like a huge finite past-end index. Indices are then clamped to
 * existing `textNodes` so corrupt or deserialized
 * ranges cannot walk millions of empty indices. When `focusNode` lies past the last node, the range end is treated as
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

  if (
    typeof startNode !== 'number' ||
    typeof endNode !== 'number' ||
    Number.isNaN(startNode) ||
    Number.isNaN(endNode)
  ) {
    return ''
  }

  startNode = Number.isFinite(startNode) ? Math.trunc(startNode) : startNode
  endNode = Number.isFinite(endNode) ? Math.trunc(endNode) : endNode

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

/**
 * Find which text node and character offset is at a given (x, y) point. Coordinates must be finite numbers —
 * otherwise `null` (e.g. NaN, ±Infinity, BigInt, or non-numbers). Nodes with non-finite or negative-size bounds
 * are skipped (aligned with {@link import('./layout-bounds.js').layoutBoundsAreFinite}).
 *
 * Returns `null` when `textNodes` is empty or no node’s bounds contain the point.
 *
 * `charOffset` matches **JavaScript string indices** (UTF-16 code units) when each line’s `charOffsets` /
 * `charWidths` entry corresponds to one code unit — the usual shape from canvas `measureText` and Pretext.
 * Missing entries and non-finite values are coerced with the same `finiteNumberOrZero` helper as scroll props
 * so corrupt metrics cannot yield `NaN` midpoint comparisons.
 * Supplementary characters then occupy two adjacent indices, aligned with `String` slicing and text-input caret math.
 *
 * Vertical line bands are half-open between stacked lines so a y exactly on an interior boundary belongs to the
 * lower line; the **last** line’s bottom edge is inclusive so it matches {@link import('./hit-test.js').dispatchHit}
 * inclusive rect edges on the text node box.
 *
 * Node bounds use {@link pointInInclusiveLayoutRect} (same as pointer hit-testing) so `x + width` / `y + height`
 * overflow to non-finite edges cannot admit stray coordinates — naive `px <= x + width` would mis-classify when
 * the sum is `±Infinity`.
 */
export function hitTestText(
  textNodes: TextNodeInfo[],
  px: number,
  py: number,
): { nodeIndex: number; charOffset: number } | null {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null

  for (const node of textNodes) {
    if (!textNodeBoundsAreFinite(node)) continue
    if (!pointInInclusiveLayoutRect(px, py, node.x, node.y, node.width, node.height)) {
      continue
    }

    // Find the line. Use half-open vertical bands between lines so shared boundaries
    // (next line's y === previous line bottom) map to the lower line only. The last line
    // uses an inclusive bottom so the node's bottom edge (same rule as box hit-test rects)
    // still resolves to this line instead of falling through to the "between lines" snap.
    let globalCharOffset = 0
    for (let li = 0; li < node.lines.length; li++) {
      const line = node.lines[li]!
      const lineBottom = line.y + node.element.props.lineHeight
      const lastLine = li === node.lines.length - 1
      const inBand = lastLine
        ? py >= line.y && py <= lineBottom
        : py >= line.y && py < lineBottom
      if (inBand) {
        // Find the character within the line
        const localX = px - line.x
        const lineVisualWidth =
          line.charOffsets.length > 0
            ? finiteNumberOrZero(line.charOffsets[line.charOffsets.length - 1]) +
              finiteNumberOrZero(line.charWidths[line.charWidths.length - 1])
            : 0
        if (node.direction === 'rtl') {
          // In RTL mode, map visual x from the right edge back to logical indices.
          const visualFromRight = lineVisualWidth - localX
          for (let c = 0; c < line.charOffsets.length; c++) {
            const charStart = finiteNumberOrZero(line.charOffsets[c])
            const charEnd = charStart + finiteNumberOrZero(line.charWidths[c])
            if (visualFromRight < (charStart + charEnd) / 2) {
              return { nodeIndex: node.index, charOffset: globalCharOffset + c }
            }
          }
        } else {
          for (let c = 0; c < line.charOffsets.length; c++) {
            const charStart = finiteNumberOrZero(line.charOffsets[c])
            const charEnd = charStart + finiteNumberOrZero(line.charWidths[c])
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

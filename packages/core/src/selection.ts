import type { ComputedLayout } from 'textura'
import type { UIElement, TextElement } from './types.js'
import { resolveElementDirection, type ResolvedDirection } from './direction.js'

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

/** Collect all selectable text nodes from the element tree with their absolute positions. */
export function collectTextNodes(
  element: UIElement,
  layout: ComputedLayout,
  offsetX: number,
  offsetY: number,
  results: TextNodeInfo[],
  parentDirection: ResolvedDirection = 'ltr',
): void {
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

  for (let i = 0; i < element.children.length; i++) {
    const childLayout = layout.children[i]
    if (childLayout) {
      collectTextNodes(element.children[i]!, childLayout, x, y, results, direction)
    }
  }
}

/** Get the selected text from a selection range and text node info list. */
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

  const parts: string[] = []
  for (let i = startNode; i <= endNode; i++) {
    const node = textNodes[i]
    if (!node) continue
    const fullText = node.element.props.text
    if (i === startNode && i === endNode) {
      parts.push(fullText.slice(startOffset, endOffset))
    } else if (i === startNode) {
      parts.push(fullText.slice(startOffset))
    } else if (i === endNode) {
      parts.push(fullText.slice(0, endOffset))
    } else {
      parts.push(fullText)
    }
  }

  return parts.join('\n')
}

/** Find which text node and character offset is at a given (x, y) point. */
export function hitTestText(
  textNodes: TextNodeInfo[],
  px: number,
  py: number,
): { nodeIndex: number; charOffset: number } | null {
  for (const node of textNodes) {
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
        for (let c = 0; c < line.charOffsets.length; c++) {
          const charStart = line.charOffsets[c]!
          const charEnd = charStart + line.charWidths[c]!
          if (localX < (charStart + charEnd) / 2) {
            return { nodeIndex: node.index, charOffset: globalCharOffset + c }
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

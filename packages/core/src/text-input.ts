import type { SelectionRange } from './selection.js'
import type { TextNodeInfo } from './selection.js'

export interface TextInputState {
  /** Editable text split into logical nodes/runs. */
  nodes: string[]
  /** Active selection/caret in node-local offsets. */
  selection: SelectionRange
}

export interface TextInputEditResult {
  nodes: string[]
  selection: SelectionRange
}

export interface CaretGeometry {
  x: number
  y: number
  height: number
  nodeIndex: number
  offset: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function normalizeSelection(selection: SelectionRange): SelectionRange {
  const {
    anchorNode,
    anchorOffset,
    focusNode,
    focusOffset,
  } = selection
  if (
    anchorNode < focusNode ||
    (anchorNode === focusNode && anchorOffset <= focusOffset)
  ) {
    return selection
  }
  return {
    anchorNode: focusNode,
    anchorOffset: focusOffset,
    focusNode: anchorNode,
    focusOffset: anchorOffset,
  }
}

function clampSelection(nodes: string[], selection: SelectionRange): SelectionRange {
  if (nodes.length === 0) {
    return { anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 0 }
  }
  const maxNode = nodes.length - 1
  const aNode = clamp(selection.anchorNode, 0, maxNode)
  const fNode = clamp(selection.focusNode, 0, maxNode)
  const aOffset = clamp(selection.anchorOffset, 0, nodes[aNode]!.length)
  const fOffset = clamp(selection.focusOffset, 0, nodes[fNode]!.length)
  return { anchorNode: aNode, anchorOffset: aOffset, focusNode: fNode, focusOffset: fOffset }
}

/** True when selection is a collapsed caret. */
export function isCollapsedSelection(selection: SelectionRange): boolean {
  return (
    selection.anchorNode === selection.focusNode &&
    selection.anchorOffset === selection.focusOffset
  )
}

/** Extract selected text from editable nodes. */
export function getInputSelectionText(nodes: string[], selection: SelectionRange): string {
  if (nodes.length === 0) return ''
  const s = normalizeSelection(clampSelection(nodes, selection))
  const parts: string[] = []
  for (let i = s.anchorNode; i <= s.focusNode; i++) {
    const text = nodes[i]!
    if (i === s.anchorNode && i === s.focusNode) {
      parts.push(text.slice(s.anchorOffset, s.focusOffset))
    } else if (i === s.anchorNode) {
      parts.push(text.slice(s.anchorOffset))
    } else if (i === s.focusNode) {
      parts.push(text.slice(0, s.focusOffset))
    } else {
      parts.push(text)
    }
  }
  return parts.join('\n')
}

/**
 * Replace current selection with inserted text.
 * For multi-line insertion, newlines create additional nodes.
 */
export function replaceInputSelection(
  nodes: string[],
  selection: SelectionRange,
  insertedText: string,
): TextInputEditResult {
  const safeNodes = nodes.length > 0 ? [...nodes] : ['']
  const s = normalizeSelection(clampSelection(safeNodes, selection))
  const startText = safeNodes[s.anchorNode]!
  const endText = safeNodes[s.focusNode]!

  const before = startText.slice(0, s.anchorOffset)
  const after = endText.slice(s.focusOffset)
  const insertedParts = insertedText.split('\n')

  const replacement: string[] =
    insertedParts.length === 1
      ? [`${before}${insertedParts[0]!}${after}`]
      : [
          `${before}${insertedParts[0]!}`,
          ...insertedParts.slice(1, insertedParts.length - 1),
          `${insertedParts[insertedParts.length - 1]!}${after}`,
        ]

  safeNodes.splice(s.anchorNode, s.focusNode - s.anchorNode + 1, ...replacement)

  const caretNode = s.anchorNode + replacement.length - 1
  const caretOffset = replacement[replacement.length - 1]!.length - after.length
  return {
    nodes: safeNodes,
    selection: {
      anchorNode: caretNode,
      anchorOffset: caretOffset,
      focusNode: caretNode,
      focusOffset: caretOffset,
    },
  }
}

/** Insert text at current selection/caret. */
export function insertInputText(
  state: TextInputState,
  text: string,
): TextInputEditResult {
  return replaceInputSelection(state.nodes, state.selection, text)
}

/** Backspace behavior across node boundaries and active selections. */
export function backspaceInput(state: TextInputState): TextInputEditResult {
  const nodes = state.nodes.length > 0 ? state.nodes : ['']
  const selection = clampSelection(nodes, state.selection)
  if (!isCollapsedSelection(selection)) {
    return replaceInputSelection(nodes, selection, '')
  }

  if (selection.anchorOffset > 0) {
    return replaceInputSelection(
      nodes,
      {
        anchorNode: selection.anchorNode,
        anchorOffset: selection.anchorOffset - 1,
        focusNode: selection.focusNode,
        focusOffset: selection.focusOffset,
      },
      '',
    )
  }

  if (selection.anchorNode === 0) return { nodes: [...nodes], selection }

  const prevNode = selection.anchorNode - 1
  const merged = [...nodes]
  const prevText = merged[prevNode]!
  const currText = merged[selection.anchorNode]!
  merged.splice(prevNode, 2, `${prevText}${currText}`)
  const caretOffset = prevText.length
  return {
    nodes: merged,
    selection: {
      anchorNode: prevNode,
      anchorOffset: caretOffset,
      focusNode: prevNode,
      focusOffset: caretOffset,
    },
  }
}

/** Delete-forward behavior across node boundaries and active selections. */
export function deleteInput(state: TextInputState): TextInputEditResult {
  const nodes = state.nodes.length > 0 ? state.nodes : ['']
  const selection = clampSelection(nodes, state.selection)
  if (!isCollapsedSelection(selection)) {
    return replaceInputSelection(nodes, selection, '')
  }

  const node = nodes[selection.anchorNode]!
  if (selection.anchorOffset < node.length) {
    return replaceInputSelection(
      nodes,
      {
        anchorNode: selection.anchorNode,
        anchorOffset: selection.anchorOffset,
        focusNode: selection.focusNode,
        focusOffset: selection.focusOffset + 1,
      },
      '',
    )
  }

  if (selection.anchorNode >= nodes.length - 1) return { nodes: [...nodes], selection }

  const merged = [...nodes]
  const currText = merged[selection.anchorNode]!
  const nextText = merged[selection.anchorNode + 1]!
  merged.splice(selection.anchorNode, 2, `${currText}${nextText}`)
  return {
    nodes: merged,
    selection: {
      anchorNode: selection.anchorNode,
      anchorOffset: node.length,
      focusNode: selection.anchorNode,
      focusOffset: node.length,
    },
  }
}

/** Move caret by one character; optionally extend existing selection. */
export function moveInputCaret(
  state: TextInputState,
  direction: 'left' | 'right',
  extendSelection = false,
): TextInputEditResult {
  const nodes = state.nodes.length > 0 ? state.nodes : ['']
  const selection = clampSelection(nodes, state.selection)
  const collapsed = isCollapsedSelection(selection)

  let nodeIndex = extendSelection ? selection.focusNode : selection.anchorNode
  let offset = extendSelection ? selection.focusOffset : selection.anchorOffset

  if (!collapsed && !extendSelection) {
    const s = normalizeSelection(selection)
    if (direction === 'left') {
      nodeIndex = s.anchorNode
      offset = s.anchorOffset
    } else {
      nodeIndex = s.focusNode
      offset = s.focusOffset
    }
  } else if (direction === 'left') {
    if (offset > 0) {
      offset--
    } else if (nodeIndex > 0) {
      nodeIndex--
      offset = nodes[nodeIndex]!.length
    }
  } else {
    const text = nodes[nodeIndex]!
    if (offset < text.length) {
      offset++
    } else if (nodeIndex < nodes.length - 1) {
      nodeIndex++
      offset = 0
    }
  }

  const nextSelection = extendSelection
    ? {
        anchorNode: selection.anchorNode,
        anchorOffset: selection.anchorOffset,
        focusNode: nodeIndex,
        focusOffset: offset,
      }
    : {
        anchorNode: nodeIndex,
        anchorOffset: offset,
        focusNode: nodeIndex,
        focusOffset: offset,
      }

  return { nodes: [...nodes], selection: nextSelection }
}

/**
 * Compute caret geometry from measured text lines for a collapsed selection.
 * Returns null when selection is expanded or text metrics are unavailable.
 */
export function getInputCaretGeometry(
  textNodes: TextNodeInfo[],
  selection: SelectionRange,
): CaretGeometry | null {
  if (!isCollapsedSelection(selection)) return null
  const node = textNodes[selection.focusNode]
  if (!node || node.lines.length === 0) return null

  const maxOffset = node.element.props.text.length
  const targetOffset = clamp(selection.focusOffset, 0, maxOffset)
  let traversed = 0

  for (const line of node.lines) {
    const lineEnd = traversed + line.text.length
    const isLastLine = line === node.lines[node.lines.length - 1]
    if (targetOffset <= lineEnd || isLastLine) {
      const local = Math.max(0, Math.min(targetOffset - traversed, line.text.length))
      let x = line.x
      if (local > 0 && line.charOffsets.length > 0) {
        if (local < line.charOffsets.length) {
          x += line.charOffsets[local] ?? 0
        } else {
          const lastIndex = line.charOffsets.length - 1
          x += (line.charOffsets[lastIndex] ?? 0) + (line.charWidths[lastIndex] ?? 0)
        }
      }
      return {
        x,
        y: line.y,
        height: node.element.props.lineHeight,
        nodeIndex: node.index,
        offset: targetOffset,
      }
    }
    traversed = lineEnd
  }

  return null
}


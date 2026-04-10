import type { TextNodeInfo, SelectionRange } from './selection.js'

/** Search all text nodes for a query string (case-insensitive). Returns matching SelectionRanges. */
export function findInTextNodes(nodes: TextNodeInfo[], query: string): SelectionRange[] {
  if (!query || nodes.length === 0) return []
  const lowerQuery = query.toLowerCase()
  const results: SelectionRange[] = []

  for (const node of nodes) {
    const fullText = node.element.props.text.toLowerCase()
    let searchFrom = 0
    while (searchFrom < fullText.length) {
      const idx = fullText.indexOf(lowerQuery, searchFrom)
      if (idx === -1) break
      results.push({
        anchorNode: node.index,
        anchorOffset: idx,
        focusNode: node.index,
        focusOffset: idx + query.length,
      })
      searchFrom = idx + 1
    }
  }

  return results
}

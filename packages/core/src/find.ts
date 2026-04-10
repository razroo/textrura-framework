import type { TextNodeInfo, SelectionRange } from './selection.js'

/**
 * Search all text nodes for a query string (case-insensitive; {@link String.prototype.toLowerCase} on
 * both the query and each node’s `text`).
 *
 * Returns {@link SelectionRange} entries with **UTF-16 code unit** offsets into the original
 * `element.props.text`, consistent with {@link import('./selection.js').hitTestText} and canvas selection.
 *
 * @remarks
 * The implementation finds substring positions in the lowercased copy of each node’s text, then reports
 * `anchorOffset` / `focusOffset` using `query.length`. When case-folding does not preserve code-unit
 * alignment between the original string and its lowercased form (uncommon but possible for some Unicode
 * sequences), highlighted ranges can diverge from ideal grapheme boundaries; ASCII and typical Latin text
 * behave as expected.
 */
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

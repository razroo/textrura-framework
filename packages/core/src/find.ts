import type { TextNodeInfo, SelectionRange } from './selection.js'

/**
 * Search all text nodes for a query string (case-insensitive; {@link String.prototype.toLowerCase} on
 * both the query and each candidate slice of the node’s `text`).
 *
 * Returns {@link SelectionRange} entries with **UTF-16 code unit** offsets into the original
 * `element.props.text`, consistent with {@link import('./selection.js').hitTestText} and canvas selection.
 *
 * @remarks
 * Matching slides a window of `query.length` code units in the **original** string and compares
 * `slice(i, i + query.length).toLowerCase()` to `query.toLowerCase()`. That keeps `anchorOffset` /
 * `focusOffset` inside the original text even when a full-string `toLowerCase()` would change total length
 * (e.g. Turkish capital `İ`). Queries whose lowercased form cannot align with any same-length window in the
 * original (including length mismatch at the end) yield no matches for that node.
 *
 * Non-string `query` values return no matches so corrupt host data cannot throw via `toLowerCase`.
 *
 * @param nodes — Text nodes in document order (typically from {@link import('./selection.js').collectTextNodes}).
 *   Entries whose `element.props.text` is not a string are skipped so mistyped or partially deserialized trees
 *   cannot throw in `slice` / `length` paths.
 * @param query — Search string; must be a non-empty string for any matches.
 */
export function findInTextNodes(nodes: TextNodeInfo[], query: string): SelectionRange[] {
  if (typeof query !== 'string' || !query || nodes.length === 0) return []
  const lowerQuery = query.toLowerCase()
  const qLen = query.length
  const results: SelectionRange[] = []

  for (const node of nodes) {
    const original = node.element.props.text
    if (typeof original !== 'string') continue
    const n = original.length
    if (qLen > n) continue
    for (let i = 0; i <= n - qLen; i++) {
      if (original.slice(i, i + qLen).toLowerCase() === lowerQuery) {
        results.push({
          anchorNode: node.index,
          anchorOffset: i,
          focusNode: node.index,
          focusOffset: i + qLen,
        })
      }
    }
  }

  return results
}

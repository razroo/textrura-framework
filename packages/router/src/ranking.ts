type RankedSegment = {
  kind: 'static' | 'param' | 'optional-static' | 'optional-param' | 'splat'
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

function parseRankedSegments(pattern: string): RankedSegment[] {
  const trimmed = trimSlashes(pattern)
  if (trimmed === '') return []

  return trimmed.split('/').map((part) => {
    if (part.startsWith('*')) return { kind: 'splat' as const }
    if (part.endsWith('?')) {
      const raw = part.slice(0, -1)
      if (raw.startsWith(':')) return { kind: 'optional-param' as const }
      return { kind: 'optional-static' as const }
    }
    if (part.startsWith(':')) return { kind: 'param' as const }
    return { kind: 'static' as const }
  })
}

function scoreSegment(segment: RankedSegment): number {
  switch (segment.kind) {
    case 'static':
      return 500
    case 'param':
      return 400
    case 'optional-static':
      return 300
    case 'optional-param':
      return 200
    case 'splat':
      return 0
  }
}

/**
 * Sum specificity scores for each path segment in `pattern` (after the same leading/trailing slash trim
 * as {@link matchPath} / {@link buildPath}). Static segments weigh highest, then params, optional
 * segments, then splats (any segment whose first character is `*`, including named splats like `*rest`).
 * Empty segments produced by doubled slashes (e.g. `/a//b`) count as extra
 * static segments so ranking depth stays aligned with {@link matchPath} segment lists.
 */
export function scorePathPattern(pattern: string): number {
  const segments = parseRankedSegments(pattern)
  return segments.reduce((total, segment) => total + scoreSegment(segment), 0)
}

/**
 * Comparator for sorting patterns from most specific to least: higher {@link scorePathPattern} wins;
 * on a tie, the deeper pattern (more segments) wins. Return value follows `Array.prototype.sort` —
 * negative when `a` should sort before `b` (i.e. `a` is more specific).
 */
export function comparePatternSpecificity(a: string, b: string): number {
  const scoreA = scorePathPattern(a)
  const scoreB = scorePathPattern(b)
  if (scoreA !== scoreB) return scoreB - scoreA

  const depthA = parseRankedSegments(a).length
  const depthB = parseRankedSegments(b).length
  if (depthA !== depthB) return depthB - depthA

  return 0
}

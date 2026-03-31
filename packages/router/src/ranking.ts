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

export function scorePathPattern(pattern: string): number {
  const segments = parseRankedSegments(pattern)
  return segments.reduce((total, segment) => total + scoreSegment(segment), 0)
}

export function comparePatternSpecificity(a: string, b: string): number {
  const scoreA = scorePathPattern(a)
  const scoreB = scorePathPattern(b)
  if (scoreA !== scoreB) return scoreB - scoreA

  const depthA = parseRankedSegments(a).length
  const depthB = parseRankedSegments(b).length
  if (depthA !== depthB) return depthB - depthA

  return 0
}

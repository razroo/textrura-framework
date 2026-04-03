/** Parameters captured when a pathname matches a route pattern (see {@link matchPath}). */
export type RouteMatch = {
  params: Record<string, string>
}

type Segment =
  | { kind: 'static'; value: string; optional: boolean }
  | { kind: 'param'; name: string; optional: boolean }
  | { kind: 'splat'; name: string }

function normalizePath(path: string, stripSearchHash: boolean): string {
  if (path === '') return '/'
  const pathnameOnly = stripSearchHash ? (path.split(/[?#]/, 1)[0] ?? '') : path
  const withLeading = pathnameOnly.startsWith('/') ? pathnameOnly : `/${pathnameOnly}`
  if (withLeading.length > 1 && withLeading.endsWith('/')) {
    return withLeading.replace(/\/+$/, '')
  }
  return withLeading
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

function parseSegments(pattern: string): Segment[] {
  const normalized = normalizePath(pattern, false)
  const trimmed = trimSlashes(normalized)
  if (trimmed === '') return []

  const parts = trimmed.split('/')
  return parts.map((part) => {
    if (part.startsWith('*')) {
      return { kind: 'splat', name: part.slice(1) || '*' } as const
    }

    const optional = part.endsWith('?')
    const raw = optional ? part.slice(0, -1) : part
    if (raw.startsWith(':')) {
      return { kind: 'param', name: raw.slice(1), optional } as const
    }
    return { kind: 'static', value: raw, optional } as const
  })
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function matchRecursive(
  segments: Segment[],
  pathnameSegments: string[],
  segmentIndex: number,
  pathIndex: number,
  params: Record<string, string>,
): Record<string, string> | null {
  if (segmentIndex >= segments.length) {
    return pathIndex === pathnameSegments.length ? params : null
  }

  const segment = segments[segmentIndex]
  if (!segment) return null

  switch (segment.kind) {
    case 'splat': {
      const rest = pathnameSegments.slice(pathIndex).map(decodeSegment).join('/')
      return { ...params, [segment.name]: rest }
    }
    case 'static': {
      const current = pathnameSegments[pathIndex]
      if (current == null) {
        if (segment.optional) {
          return matchRecursive(segments, pathnameSegments, segmentIndex + 1, pathIndex, params)
        }
        return null
      }
      if (current === segment.value) {
        return matchRecursive(segments, pathnameSegments, segmentIndex + 1, pathIndex + 1, params)
      }
      if (segment.optional) {
        return matchRecursive(segments, pathnameSegments, segmentIndex + 1, pathIndex, params)
      }
      return null
    }
    case 'param': {
      const current = pathnameSegments[pathIndex]
      if (current == null) {
        if (segment.optional) {
          return matchRecursive(segments, pathnameSegments, segmentIndex + 1, pathIndex, params)
        }
        return null
      }
      const withValue = matchRecursive(
        segments,
        pathnameSegments,
        segmentIndex + 1,
        pathIndex + 1,
        { ...params, [segment.name]: decodeSegment(current) },
      )
      if (withValue) return withValue

      if (segment.optional) {
        return matchRecursive(segments, pathnameSegments, segmentIndex + 1, pathIndex, params)
      }
      return null
    }
  }
}

/**
 * Match a route pattern against a URL pathname.
 *
 * - Segments are split on `/`. A leading slash on `pattern` or `pathname` is optional; trailing
 *   slashes on the pathname are normalized away before matching.
 * - Static segments must match exactly.
 * - `:name` captures one path segment; `:name?` is optional (segment may be absent).
 * - `*` or `*rest` is a splat: it greedily captures the rest of the path, including internal slashes.
 * - `?` query and `#` hash are stripped from `pathname` before matching.
 * - Each captured segment is passed through `decodeURIComponent`; invalid `%` sequences are left as-is.
 *
 * @returns `{ params }` on success, or `null` when the pathname does not match.
 */
export function matchPath(pattern: string, pathname: string): RouteMatch | null {
  const segments = parseSegments(pattern)
  const normalizedPath = normalizePath(pathname, true)
  const trimmedPath = trimSlashes(normalizedPath)
  const pathSegments = trimmedPath === '' ? [] : trimmedPath.split('/')

  const params = matchRecursive(segments, pathSegments, 0, 0, {})
  if (!params) return null
  return { params }
}

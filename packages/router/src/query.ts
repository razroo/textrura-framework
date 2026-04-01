export type QueryValue = string | number | boolean | null | undefined
export type QueryInput = Record<string, QueryValue | QueryValue[]>
/** Result of {@link parseQuery}: each key maps to one value or, when repeated in the input, an array of values (order preserved). */
export type ParsedQuery = Record<string, string | string[]>

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

function encode(value: string): string {
  return encodeURIComponent(value)
}

/**
 * Parse a URL query string (optional leading `?`). Keys and values are percent-decoded;
 * `+` in values is treated as space. Duplicate keys collapse to `string[]` in encounter order.
 * If decoding a segment throws, that segment is left as the raw string (see malformed `%` escapes).
 */
export function parseQuery(search: string): ParsedQuery {
  const input = search.startsWith('?') ? search.slice(1) : search
  if (input === '') return {}

  const result: ParsedQuery = {}
  for (const pair of input.split('&')) {
    if (pair === '') continue
    const [rawKey, ...rest] = pair.split('=')
    const key = decode(rawKey ?? '')
    const value = decode(rest.join('='))

    const current = result[key]
    if (current == null) {
      result[key] = value
    } else if (Array.isArray(current)) {
      current.push(value)
    } else {
      result[key] = [current, value]
    }
  }
  return result
}

/**
 * Serialize a shallow query object to `?a=1&b=2`. Keys are sorted lexicographically for stable output.
 * Skips `null` and `undefined`; array values become repeated keys. Booleans become `"true"` / `"false"`.
 * Returns `""` when there are no pairs to emit.
 */
export function stringifyQuery(query: QueryInput): string {
  const keys = Object.keys(query).sort((a, b) => a.localeCompare(b))
  const pairs: string[] = []

  for (const key of keys) {
    const raw = query[key]
    if (raw == null) continue

    const values = Array.isArray(raw) ? raw : [raw]
    for (const value of values) {
      if (value == null) continue
      pairs.push(`${encode(key)}=${encode(String(value))}`)
    }
  }

  if (pairs.length === 0) return ''
  return `?${pairs.join('&')}`
}

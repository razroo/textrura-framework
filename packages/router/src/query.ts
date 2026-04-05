export type QueryValue = string | number | boolean | null | undefined
export type QueryInput = Record<string, QueryValue | QueryValue[]>
/**
 * Result of {@link parseQuery}: each key maps to one value or, when repeated in the input,
 * an array of values (order preserved). Instances use a null prototype so query keys such as
 * `__proto__` are stored as ordinary string keys and cannot mutate `Object.prototype`.
 */
export type ParsedQuery = Record<string, string | string[]>

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

function encode(value: string): string {
  // Lone surrogates make encodeURIComponent throw URIError; normalize first (ES2024).
  return encodeURIComponent(value.toWellFormed())
}

/**
 * Parse a URL query string (optional leading `?`). Keys and values are percent-decoded;
 * `+` in values is treated as space. Duplicate keys collapse to `string[]` in encounter order.
 * If decoding a segment throws, that segment is left as the raw string (see malformed `%` escapes).
 * The returned object has a null prototype (see {@link ParsedQuery}).
 *
 * Any raw `#` and following characters are ignored (URL fragment delimiter), so accidental
 * `?a=1#hash` input still parses like `location.search`. Encoded `#` inside values (`%23`) is unchanged.
 *
 * Non-string input (e.g. `null` / `undefined` from loose callers or bad deserialization) returns an empty
 * {@link ParsedQuery} without throwing — `startsWith` would otherwise throw on non-strings.
 */
export function parseQuery(search: string): ParsedQuery {
  if (typeof search !== 'string') {
    return Object.create(null) as ParsedQuery
  }
  let input = search.startsWith('?') ? search.slice(1) : search
  const hashIdx = input.indexOf('#')
  if (hashIdx >= 0) {
    input = input.slice(0, hashIdx)
  }
  if (input === '') return Object.create(null) as ParsedQuery

  const result = Object.create(null) as ParsedQuery
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
 * Skips non-finite numbers (`NaN`, `±Infinity`) and `bigint` values so accidental numeric garbage does not produce query pairs
 * (parity with {@link import('./path.js').buildPath} optional param omission).
 * At runtime only **primitive** `string`, `number`, and `boolean` values are emitted — objects (including boxed
 * primitives, `Date`, plain records, and arrays mistaken for scalar entries) are skipped so corrupt deserialization
 * cannot yield `...=[object Object]` pairs.
 * Keys and string values are normalized with `String.prototype.toWellFormed` before percent-encoding so
 * ill-formed lone UTF-16 surrogates cannot throw from `encodeURIComponent`.
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
      if (typeof value === 'bigint') continue
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) continue
        pairs.push(`${encode(key)}=${encode(String(value))}`)
      } else if (typeof value === 'boolean') {
        pairs.push(`${encode(key)}=${encode(String(value))}`)
      } else if (typeof value === 'string') {
        pairs.push(`${encode(key)}=${encode(value)}`)
      }
    }
  }

  if (pairs.length === 0) return ''
  return `?${pairs.join('&')}`
}

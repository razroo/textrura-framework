export type QueryValue = string | number | boolean | null | undefined
export type QueryInput = Record<string, QueryValue | QueryValue[]>
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

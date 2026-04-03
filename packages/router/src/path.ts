type SegmentParamKeys<Path extends string> =
  Path extends `${infer Head}/${infer Tail}`
    ? SegmentParamKeys<Head> | SegmentParamKeys<Tail>
    : Path extends `:${infer Param}?`
      ? Param
      : Path extends `:${infer Param}`
        ? Param
        : Path extends `*${infer Param}`
          ? (Param extends '' ? '*' : Param)
          : never

type SegmentRequiredParamKeys<Path extends string> =
  Path extends `${infer Head}/${infer Tail}`
    ? SegmentRequiredParamKeys<Head> | SegmentRequiredParamKeys<Tail>
    : Path extends `:${infer Param}`
      ? (Param extends `${string}?` ? never : Param)
      : Path extends `*${infer Param}`
        ? (Param extends '' ? '*' : Param)
        : never

type SegmentOptionalParamKeys<Path extends string> = Exclude<SegmentParamKeys<Path>, SegmentRequiredParamKeys<Path>>

/**
 * Path parameters inferred from a pattern string (static segments, `:param`, optional `:param?`,
 * and splat `*name` or anonymous `*`). Use with {@link buildPath}.
 */
export type PathParams<Path extends string> = {
  [K in SegmentRequiredParamKeys<Path>]: string | number
} & {
  [K in SegmentOptionalParamKeys<Path>]?: string | number
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

function stringifyParam(value: string | number): string {
  // Lone surrogates make encodeURIComponent throw URIError; normalize first (parity with query.ts).
  const s = typeof value === 'string' ? value.toWellFormed() : String(value)
  return encodeURIComponent(s)
}

/** Splat remainders preserve internal slashes; still normalize ill-formed UTF-16 (parity with {@link stringifyParam}). */
function wellFormedSplatRemainder(value: string | number): string {
  const raw = typeof value === 'string' ? value.toWellFormed() : String(value)
  return trimSlashes(raw)
}

/** True when a param value should participate in the path (non-finite numbers omitted; mirrors `stringifyQuery` in `query.ts`). */
function paramValuePresent(value: string | number | null | undefined): boolean {
  if (value == null || value === '') return false
  if (typeof value === 'bigint') return false
  if (typeof value === 'number' && !Number.isFinite(value)) return false
  return true
}

/**
 * Build a pathname from a route pattern and {@link PathParams}. Static segments are copied as-is;
 * dynamic `:id` and optional `:id?` are filled from `params`; splat `*rest` (or a lone `*`, key `'*'`)
 * inserts the remainder with internal slashes preserved (slashes are not percent-encoded; string values are still
 * passed through `String.prototype.toWellFormed` so lone surrogates match `:param` / query parity). For optional segments, `null`, `undefined`,
 * empty string, a non-finite number (`NaN`, `±Infinity`), or a `BigInt` omits the segment (same as leaving the key unset).
 * Required dynamic and splat params throw when missing, empty, non-finite numeric, or `BigInt`. `:param` values are
 * percent-encoded after `String.prototype.toWellFormed` (parity with `stringifyQuery` in `query.ts`).
 * Leading and trailing slashes on `pattern` are trimmed before building.
 */
export function buildPath<Path extends string>(pattern: Path, params: PathParams<Path>): string {
  const trimmed = trimSlashes(pattern)
  if (trimmed === '') return '/'

  const parts = trimmed.split('/')
  const out: string[] = []

  for (const part of parts) {
    if (part.startsWith('*')) {
      const key = part.slice(1) || '*'
      const value = params[key as keyof PathParams<Path>]
      if (!paramValuePresent(value)) {
        throw new Error(`Missing required splat param: ${key}`)
      }
      out.push(wellFormedSplatRemainder(value))
      continue
    }

    if (part.startsWith(':')) {
      const optional = part.endsWith('?')
      const key = optional ? part.slice(1, -1) : part.slice(1)
      const value = params[key as keyof PathParams<Path>]
      if (!paramValuePresent(value)) {
        if (optional) continue
        throw new Error(`Missing required path param: ${key}`)
      }
      out.push(stringifyParam(value))
      continue
    }

    out.push(part.endsWith('?') ? part.slice(0, -1) : part)
  }

  return `/${out.join('/')}`
}

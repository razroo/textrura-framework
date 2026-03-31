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

export type PathParams<Path extends string> = {
  [K in SegmentRequiredParamKeys<Path>]: string | number
} & {
  [K in SegmentOptionalParamKeys<Path>]?: string | number
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

function stringifyParam(value: string | number): string {
  return encodeURIComponent(String(value))
}

export function buildPath<Path extends string>(pattern: Path, params: PathParams<Path>): string {
  const trimmed = trimSlashes(pattern)
  if (trimmed === '') return '/'

  const parts = trimmed.split('/')
  const out: string[] = []

  for (const part of parts) {
    if (part.startsWith('*')) {
      const key = part.slice(1) || '*'
      const value = params[key as keyof PathParams<Path>]
      if (value == null || value === '') {
        throw new Error(`Missing required splat param: ${key}`)
      }
      out.push(trimSlashes(String(value)))
      continue
    }

    if (part.startsWith(':')) {
      const optional = part.endsWith('?')
      const key = optional ? part.slice(1, -1) : part.slice(1)
      const value = params[key as keyof PathParams<Path>]
      if (value == null || value === '') {
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

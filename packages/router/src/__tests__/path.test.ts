import { describe, expect, it } from 'vitest'
import { buildPath, type PathParams } from '../path.js'

describe('path generation', () => {
  it('builds path with required params', () => {
    expect(buildPath('/users/:id', { id: 42 })).toBe('/users/42')
  })

  it('omits optional params when absent', () => {
    expect(buildPath('/users/:id?', {})).toBe('/users')
  })

  it('omits optional params when value is empty string (same as unset)', () => {
    expect(buildPath('/users/:id?', { id: '' })).toBe('/users')
  })

  it('throws when a required param is empty string', () => {
    expect(() => buildPath('/users/:id', { id: '' } as PathParams<'/users/:id'>)).toThrow(
      'Missing required path param: id',
    )
  })

  it('throws when splat param is null at runtime', () => {
    expect(() =>
      buildPath('/docs/*rest', { rest: null as unknown as string } as PathParams<'/docs/*rest'>),
    ).toThrow('Missing required splat param: rest')
  })

  it('throws when anonymous splat (* or /*) is missing the * param', () => {
    expect(() => buildPath('*', {} as PathParams<'*'>)).toThrow('Missing required splat param: *')
    expect(() => buildPath('/*', {} as PathParams<'/*'>)).toThrow('Missing required splat param: *')
  })

  it('includes optional params when provided', () => {
    expect(buildPath('/users/:id?', { id: 7 })).toBe('/users/7')
  })

  it('builds paths with optional static segment markers (matches matcher optional static)', () => {
    expect(buildPath('/project/archive?/:id', { id: 1 })).toBe('/project/archive/1')
  })

  it('normalizes a sole slash to root', () => {
    expect(buildPath('/', {})).toBe('/')
  })

  it('treats an empty pattern string as root', () => {
    expect(buildPath('' as const, {} as PathParams<''>)).toBe('/')
  })

  it('normalizes patterns that are only slashes to root', () => {
    expect(buildPath('//', {})).toBe('/')
    expect(buildPath('///', {})).toBe('/')
  })

  it('treats explicit undefined like an omitted optional path param', () => {
    expect(buildPath('/users/:id?', { id: undefined })).toBe('/users')
    expect(buildPath('/a/:seg?/c', { seg: undefined })).toBe('/a/c')
  })

  it('omits optional path params when the value is a non-finite number (parity with query stringify)', () => {
    expect(buildPath('/users/:id?', { id: Number.NaN })).toBe('/users')
    expect(buildPath('/users/:id?', { id: Number.POSITIVE_INFINITY })).toBe('/users')
    expect(buildPath('/a/:seg?/c', { seg: Number.NEGATIVE_INFINITY })).toBe('/a/c')
  })

  it('includes whitespace-only optional path params (only null, undefined, and empty string omit; see paramValuePresent)', () => {
    expect(buildPath('/users/:id?', { id: '   ' })).toBe('/users/%20%20%20')
    expect(buildPath('/a/:seg?/c', { seg: '\t\n' })).toBe('/a/%09%0A/c')
    expect(buildPath('/users/:id?', { id: '\uFEFF' })).toBe('/users/%EF%BB%BF')
  })

  it('includes whitespace-only required path params', () => {
    expect(buildPath('/users/:id', { id: ' ' })).toBe('/users/%20')
  })

  it('throws for required path params when the value is a non-finite number', () => {
    expect(() =>
      buildPath('/users/:id', { id: Number.NaN } as PathParams<'/users/:id'>),
    ).toThrow('Missing required path param: id')
    expect(() =>
      buildPath('/n/:x', { x: Number.POSITIVE_INFINITY } as PathParams<'/n/:x'>),
    ).toThrow('Missing required path param: x')
  })

  it('throws for splat params when the value is a non-finite number', () => {
    expect(() =>
      buildPath('/docs/*rest', { rest: Number.NaN } as PathParams<'/docs/*rest'>),
    ).toThrow('Missing required splat param: rest')
    expect(() =>
      buildPath('/*', { '*': Number.NEGATIVE_INFINITY } as PathParams<'/*'>),
    ).toThrow('Missing required splat param: *')
  })

  it('omits optional path params when the value is a bigint (corrupt runtime / bad serialization)', () => {
    expect(buildPath('/users/:id?', { id: 99n as unknown as number })).toBe('/users')
    expect(buildPath('/a/:seg?/c', { seg: 1n as unknown as number })).toBe('/a/c')
  })

  it('throws for required path params when the value is a bigint', () => {
    expect(() =>
      buildPath('/users/:id', { id: 42n as unknown as number } as PathParams<'/users/:id'>),
    ).toThrow('Missing required path param: id')
  })

  it('throws for splat params when the value is a bigint', () => {
    expect(() =>
      buildPath('/docs/*rest', { rest: 1n as unknown as string } as PathParams<'/docs/*rest'>),
    ).toThrow('Missing required splat param: rest')
    expect(() => buildPath('/*', { '*': 0n as unknown as string } as PathParams<'/*'>)).toThrow(
      'Missing required splat param: *',
    )
  })

  it('omits optional path params when the value is boolean, boxed number, or object (scalar guard; parity with query stringify)', () => {
    expect(buildPath('/users/:id?', { id: true as unknown as string })).toBe('/users')
    expect(buildPath('/users/:id?', { id: false as unknown as string })).toBe('/users')
    expect(buildPath('/a/:seg?/c', { seg: {} as unknown as string })).toBe('/a/c')
    expect(buildPath('/u/:x?', { x: Object(7) as unknown as number })).toBe('/u')
  })

  it('throws for required path params when the value is boolean, boxed number, or plain object', () => {
    expect(() =>
      buildPath('/users/:id', { id: true as unknown as string } as PathParams<'/users/:id'>),
    ).toThrow('Missing required path param: id')
    expect(() =>
      buildPath('/n/:x', { x: Object(3) as unknown as number } as PathParams<'/n/:x'>),
    ).toThrow('Missing required path param: x')
    expect(() =>
      buildPath('/o/:y', { y: { v: 1 } as unknown as string } as PathParams<'/o/:y'>),
    ).toThrow('Missing required path param: y')
  })

  it('throws for splat params when the value is boolean, boxed number, or object', () => {
    expect(() =>
      buildPath('/docs/*rest', { rest: false as unknown as string } as PathParams<'/docs/*rest'>),
    ).toThrow('Missing required splat param: rest')
    expect(() =>
      buildPath('/*', { '*': Object('hi') as unknown as string } as PathParams<'/*'>),
    ).toThrow('Missing required splat param: *')
    expect(() =>
      buildPath('/p/*s', { s: { a: 1 } as unknown as string } as PathParams<'/p/*s'>),
    ).toThrow('Missing required splat param: s')
  })

  it('builds path with multiple dynamic segments', () => {
    expect(buildPath('/users/:userId/posts/:postId', { userId: 'a', postId: 2 })).toBe(
      '/users/a/posts/2',
    )
  })

  it('throws when splat param is empty string', () => {
    expect(() => buildPath('/docs/*rest', { rest: '' })).toThrow('Missing required splat param: rest')
  })

  it('supports splat params', () => {
    expect(buildPath('/docs/*rest', { rest: 'guides/routing/intro' })).toBe('/docs/guides/routing/intro')
  })

  it('supports anonymous splat (param key *)', () => {
    expect(buildPath('/*', { '*': 'guides/routing/intro' })).toBe('/guides/routing/intro')
  })

  it('encodes param values', () => {
    expect(buildPath('/search/:query', { query: 'alice bob' })).toBe('/search/alice%20bob')
  })

  it('throws when required params are missing', () => {
    expect(() => buildPath('/users/:id', {} as PathParams<'/users/:id'>)).toThrow(
      'Missing required path param: id',
    )
  })

  it('throws when a required path param is null or undefined at runtime', () => {
    expect(() =>
      buildPath('/users/:id', { id: null as unknown as string } as PathParams<'/users/:id'>),
    ).toThrow('Missing required path param: id')
    expect(() =>
      buildPath('/users/:id', { id: undefined as unknown as string } as PathParams<'/users/:id'>),
    ).toThrow('Missing required path param: id')
  })

  it('includes numeric zero as a path segment (not treated as empty)', () => {
    expect(buildPath('/items/:id', { id: 0 })).toBe('/items/0')
  })

  it('includes numeric zero as a splat remainder (not treated as missing via falsy checks)', () => {
    expect(buildPath('/docs/*rest', { rest: 0 })).toBe('/docs/0')
    expect(buildPath('/*', { '*': 0 })).toBe('/0')
  })

  it('encodes reserved URI characters in param values', () => {
    expect(buildPath('/search/:q', { q: 'a/b?c' })).toBe('/search/a%2Fb%3Fc')
  })

  it('encodes non-ASCII path params with encodeURIComponent', () => {
    expect(buildPath('/wiki/:title', { title: '日本語' })).toBe('/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E')
  })

  it('normalizes ill-formed UTF-16 in path params without throwing (parity with query stringify)', () => {
    const loneHigh = '\uD800'
    const loneLow = '\uDC00'
    expect(() => buildPath('/p/:x', { x: loneHigh } as PathParams<'/p/:x'>)).not.toThrow()
    expect(() => buildPath('/p/:x', { x: loneLow } as PathParams<'/p/:x'>)).not.toThrow()
    expect(buildPath('/p/:x', { x: loneHigh } as PathParams<'/p/:x'>)).toBe('/p/%EF%BF%BD')
    expect(buildPath('/p/:x', { x: loneLow } as PathParams<'/p/:x'>)).toBe('/p/%EF%BF%BD')
  })

  it('normalizes ill-formed UTF-16 in splat remainders without throwing (toWellFormed parity with dynamic segments)', () => {
    const loneHigh = '\uD800'
    const loneLow = '\uDC00'
    const replacement = '\uFFFD'
    expect(() => buildPath('/docs/*rest', { rest: loneHigh } as PathParams<'/docs/*rest'>)).not.toThrow()
    expect(() => buildPath('/docs/*rest', { rest: loneLow } as PathParams<'/docs/*rest'>)).not.toThrow()
    expect(buildPath('/docs/*rest', { rest: loneHigh } as PathParams<'/docs/*rest'>)).toBe(`/docs/${replacement}`)
    expect(buildPath('/docs/*rest', { rest: loneLow } as PathParams<'/docs/*rest'>)).toBe(`/docs/${replacement}`)
    expect(buildPath('/*', { '*': loneHigh } as PathParams<'/*'>)).toBe(`/${replacement}`)
    expect(buildPath('/a/*rest/c', { rest: `x/${loneLow}/y` } as PathParams<'/a/*rest/c'>)).toBe(
      `/a/x/${replacement}/y/c`,
    )
  })

  it('normalizes redundant slashes in the pattern before building', () => {
    expect(buildPath('//users/:id/', { id: 7 })).toBe('/users/7')
  })

  it('trims leading and trailing slashes on splat values (single segment)', () => {
    expect(buildPath('/docs/*rest', { rest: '/guides/routing/' })).toBe('/docs/guides/routing')
  })

  it('splat value that trims to empty string becomes an empty final segment (slashes-only remainder)', () => {
    expect(buildPath('/docs/*rest', { rest: '/' })).toBe('/docs/')
    expect(buildPath('/docs/*rest', { rest: '///' })).toBe('/docs/')
  })

  it('omits an optional param in the middle of the path without extra slashes', () => {
    expect(buildPath('/a/:seg?/c', {})).toBe('/a/c')
    expect(buildPath('/a/:seg?/c', { seg: 'b' })).toBe('/a/b/c')
  })

  it('builds path for lone colon segment (empty param key; parity with matchPath)', () => {
    expect(buildPath('/:/x', { '': 'a' } as PathParams<'/:/x'>)).toBe('/a/x')
    expect(buildPath('/:/x', { '': 'alice bob' } as PathParams<'/:/x'>)).toBe('/alice%20bob/x')
  })

  it('always emits optional static segments in buildPath (optionality applies to matching, not omission here)', () => {
    expect(buildPath('/v1?', {} as PathParams<'/v1?'>)).toBe('/v1')
    expect(buildPath('/foo/api?/bar', {} as PathParams<'/foo/api?/bar'>)).toBe('/foo/api/bar')
  })
})

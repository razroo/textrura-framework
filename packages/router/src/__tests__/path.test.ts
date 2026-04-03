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
})

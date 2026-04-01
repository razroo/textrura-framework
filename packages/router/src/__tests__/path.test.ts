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

  it('includes optional params when provided', () => {
    expect(buildPath('/users/:id?', { id: 7 })).toBe('/users/7')
  })

  it('builds paths with optional static segment markers (matches matcher optional static)', () => {
    expect(buildPath('/project/archive?/:id', { id: 1 })).toBe('/project/archive/1')
  })

  it('normalizes a sole slash to root', () => {
    expect(buildPath('/', {})).toBe('/')
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

  it('includes numeric zero as a path segment (not treated as empty)', () => {
    expect(buildPath('/items/:id', { id: 0 })).toBe('/items/0')
  })

  it('encodes reserved URI characters in param values', () => {
    expect(buildPath('/search/:q', { q: 'a/b?c' })).toBe('/search/a%2Fb%3Fc')
  })

  it('normalizes redundant slashes in the pattern before building', () => {
    expect(buildPath('//users/:id/', { id: 7 })).toBe('/users/7')
  })
})

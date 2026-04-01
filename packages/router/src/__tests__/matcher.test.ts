import { describe, expect, it } from 'vitest'
import { matchPath } from '../matcher.js'

describe('route matcher', () => {
  it('matches static paths', () => {
    expect(matchPath('/settings/profile', '/settings/profile')).toEqual({ params: {} })
    expect(matchPath('/settings/profile', '/settings')).toBeNull()
  })

  it('matches dynamic params', () => {
    expect(matchPath('/users/:id', '/users/42')).toEqual({ params: { id: '42' } })
  })

  it('matches optional params when present and absent', () => {
    expect(matchPath('/users/:id?', '/users/42')).toEqual({ params: { id: '42' } })
    expect(matchPath('/users/:id?', '/users')).toEqual({ params: {} })
  })

  it('matches optional static segments', () => {
    expect(matchPath('/project/archive?/:id', '/project/archive/1')).toEqual({ params: { id: '1' } })
    expect(matchPath('/project/archive?/:id', '/project/1')).toEqual({ params: { id: '1' } })
  })

  it('matches splat segment and captures rest', () => {
    expect(matchPath('/docs/*', '/docs/guides/routing/intro')).toEqual({
      params: { '*': 'guides/routing/intro' },
    })
    expect(matchPath('/docs/*rest', '/docs/guides/routing')).toEqual({
      params: { rest: 'guides/routing' },
    })
  })

  it('normalizes trailing slashes and decodes params', () => {
    expect(matchPath('/users/:name', '/users/alice%20bob/')).toEqual({ params: { name: 'alice bob' } })
  })

  it('strips search and hash from pathname before matching', () => {
    expect(matchPath('/users/:id', '/users/42?tab=settings')).toEqual({ params: { id: '42' } })
    expect(matchPath('/users/:id', '/users/42#section')).toEqual({ params: { id: '42' } })
    expect(matchPath('/users/:id', '/users/42?x=1#y')).toEqual({ params: { id: '42' } })
  })

  it('matches root pattern against root pathname', () => {
    expect(matchPath('/', '/')).toEqual({ params: {} })
    expect(matchPath('/', '/?ref=1')).toEqual({ params: {} })
  })

  it('normalizes pathname without a leading slash', () => {
    expect(matchPath('/items/:sku', 'items/abc')).toEqual({ params: { sku: 'abc' } })
  })

  it('leaves param segments unchanged when decodeURIComponent fails', () => {
    expect(matchPath('/raw/:token', '/raw/%')).toEqual({ params: { token: '%' } })
  })

  it('does not collapse empty pathname segments: single-slash pattern misses double-slash URL', () => {
    expect(matchPath('/foo/bar', '/foo//bar')).toBeNull()
    expect(matchPath('/users/:id', '/users//42')).toBeNull()
  })

  it('matches when pattern and pathname both include empty segments between slashes', () => {
    expect(matchPath('/foo//bar', '/foo//bar')).toEqual({ params: {} })
    expect(matchPath('/a//b/c', '/a//b/c')).toEqual({ params: {} })
  })

  it('splat captures slashes including doubled segments in the rest', () => {
    expect(matchPath('/docs/*', '/docs/guides//section')).toEqual({
      params: { '*': 'guides//section' },
    })
  })
})

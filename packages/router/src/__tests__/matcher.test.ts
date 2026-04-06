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

  it('matches optional static segment when present or skipped (including alone or before more path)', () => {
    expect(matchPath('/v1?', '/v1')).toEqual({ params: {} })
    expect(matchPath('/v1?', '/')).toEqual({ params: {} })
    expect(matchPath('/v1?', '')).toEqual({ params: {} })
    expect(matchPath('v1?', 'v1')).toEqual({ params: {} })
    expect(matchPath('/v1?', '/v1/extra')).toBeNull()
    expect(matchPath('/foo/api?/bar', '/foo/bar')).toEqual({ params: {} })
    expect(matchPath('/foo/api?/bar', '/foo/api/bar')).toEqual({ params: {} })
    expect(matchPath('/foo/api?/bar', '/foo/baz/bar')).toBeNull()
  })

  it('matches splat segment and captures rest', () => {
    expect(matchPath('/docs/*', '/docs/guides/routing/intro')).toEqual({
      params: { '*': 'guides/routing/intro' },
    })
    expect(matchPath('/docs/*rest', '/docs/guides/routing')).toEqual({
      params: { rest: 'guides/routing' },
    })
  })

  it('treats a bare splat pattern as matching from root', () => {
    expect(matchPath('*', '/guides/routing/intro')).toEqual({
      params: { '*': 'guides/routing/intro' },
    })
    expect(matchPath('/*', '/guides/routing')).toEqual({ params: { '*': 'guides/routing' } })
  })

  it('captures empty remainder when splat matches only the root pathname', () => {
    expect(matchPath('/*', '/')).toEqual({ params: { '*': '' } })
    expect(matchPath('*', '/')).toEqual({ params: { '*': '' } })
  })

  it('normalizes trailing slashes and decodes params', () => {
    expect(matchPath('/users/:name', '/users/alice%20bob/')).toEqual({ params: { name: 'alice bob' } })
  })

  it('normalizes trailing slash on pathname so there is no empty final segment (/users/ ≡ /users)', () => {
    expect(matchPath('/users/:id', '/users/42/')).toEqual({ params: { id: '42' } })
    expect(matchPath('/users/:id', '/users/')).toBeNull()
    expect(matchPath('/a/b', '/a/b/')).toEqual({ params: {} })
  })

  it('strips search and hash from pathname before matching', () => {
    expect(matchPath('/users/:id', '/users/42?tab=settings')).toEqual({ params: { id: '42' } })
    expect(matchPath('/users/:id', '/users/42#section')).toEqual({ params: { id: '42' } })
    expect(matchPath('/users/:id', '/users/42?x=1#y')).toEqual({ params: { id: '42' } })
  })

  it('treats search-only, hash-only, and leading-delimiter path strings as root after stripping', () => {
    expect(matchPath('/', '?')).toEqual({ params: {} })
    expect(matchPath('/', '?q=1')).toEqual({ params: {} })
    expect(matchPath('/', '#')).toEqual({ params: {} })
    expect(matchPath('/', '#section')).toEqual({ params: {} })
    expect(matchPath('/', '?#frag')).toEqual({ params: {} })
    expect(matchPath('/home', '?')).toBeNull()
    expect(matchPath('/home', '#x')).toBeNull()
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

  it('decodes splat remainder per segment and leaves invalid percent sequences as-is', () => {
    expect(matchPath('/docs/*', '/docs/guides%2Fintro')).toEqual({
      params: { '*': 'guides/intro' },
    })
    expect(matchPath('/docs/*', '/docs/foo%')).toEqual({ params: { '*': 'foo%' } })
    expect(matchPath('/docs/*rest', '/docs/a%20b/c')).toEqual({
      params: { rest: 'a b/c' },
    })
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

  it('treats empty pathname as root (same as /) after normalization', () => {
    expect(matchPath('/', '')).toEqual({ params: {} })
    expect(matchPath('/', '/')).toEqual({ params: {} })
    expect(matchPath('/home', '')).toBeNull()
  })

  it('empty pattern string matches only root pathnames', () => {
    expect(matchPath('', '/')).toEqual({ params: {} })
    expect(matchPath('', '')).toEqual({ params: {} })
    expect(matchPath('', '/?ref=1')).toEqual({ params: {} })
    expect(matchPath('', '#section')).toEqual({ params: {} })
    expect(matchPath('', '?q=only')).toEqual({ params: {} })
    expect(matchPath('', '/foo')).toBeNull()
    expect(matchPath('', 'nested')).toBeNull()
  })

  it('slash-only patterns normalize to zero segments (root-only match, same as empty pattern)', () => {
    for (const pattern of ['/', '//', '///']) {
      expect(matchPath(pattern, '/')).toEqual({ params: {} })
      expect(matchPath(pattern, '')).toEqual({ params: {} })
      expect(matchPath(pattern, '/?ref=1')).toEqual({ params: {} })
      expect(matchPath(pattern, '#section')).toEqual({ params: {} })
      expect(matchPath(pattern, '?q=only')).toEqual({ params: {} })
      expect(matchPath(pattern, '/foo')).toBeNull()
      expect(matchPath(pattern, 'nested')).toBeNull()
    }
  })

  it('when the same param name appears twice, the later capture wins', () => {
    expect(matchPath('/users/:id/posts/:id', '/users/1/posts/2')).toEqual({
      params: { id: '2' },
    })
  })

  it('lone colon segment uses empty string as param name', () => {
    expect(matchPath('/:/x', '/a/x')).toEqual({ params: { '': 'a' } })
    expect(matchPath('/:/x', '/a/y')).toBeNull()
  })

  it('optional lone colon param (:?) captures one segment or is skipped when absent', () => {
    expect(matchPath('/:?', '/a')).toEqual({ params: { '': 'a' } })
    expect(matchPath('/:?', '/')).toEqual({ params: {} })
    expect(matchPath('/:?', '')).toEqual({ params: {} })
    expect(matchPath('/:?/tail', '/a/tail')).toEqual({ params: { '': 'a' } })
    expect(matchPath('/:?/tail', '/tail')).toEqual({ params: {} })
    expect(matchPath('/:?/tail', '/a')).toBeNull()
  })

  it('splat consumes the entire remainder; pattern segments after the splat are ignored', () => {
    expect(matchPath('/docs/*/:id', '/docs/foo/bar')).toEqual({
      params: { '*': 'foo/bar' },
    })
    expect(matchPath('/docs/*/tail', '/docs/a/b/c')).toEqual({
      params: { '*': 'a/b/c' },
    })
  })
})

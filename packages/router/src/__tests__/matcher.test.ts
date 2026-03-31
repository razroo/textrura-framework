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
})

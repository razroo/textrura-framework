import { describe, expect, it } from 'vitest'
import { buildPath, type PathParams } from '../path.js'

describe('path generation', () => {
  it('builds path with required params', () => {
    expect(buildPath('/users/:id', { id: 42 })).toBe('/users/42')
  })

  it('omits optional params when absent', () => {
    expect(buildPath('/users/:id?', {})).toBe('/users')
  })

  it('supports splat params', () => {
    expect(buildPath('/docs/*rest', { rest: 'guides/routing/intro' })).toBe('/docs/guides/routing/intro')
  })

  it('encodes param values', () => {
    expect(buildPath('/search/:query', { query: 'alice bob' })).toBe('/search/alice%20bob')
  })

  it('throws when required params are missing', () => {
    expect(() => buildPath('/users/:id', {} as PathParams<'/users/:id'>)).toThrow(
      'Missing required path param: id',
    )
  })
})

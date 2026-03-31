import { describe, expect, it } from 'vitest'
import { parseQuery, stringifyQuery } from '../query.js'

describe('query helpers', () => {
  it('parses single query values', () => {
    expect(parseQuery('?page=2&sort=asc')).toEqual({ page: '2', sort: 'asc' })
  })

  it('parses repeated keys into arrays', () => {
    expect(parseQuery('?tag=ui&tag=router&tag=canvas')).toEqual({
      tag: ['ui', 'router', 'canvas'],
    })
  })

  it('stringifies with stable key ordering', () => {
    expect(stringifyQuery({ z: 1, a: 'first', m: true })).toBe('?a=first&m=true&z=1')
  })

  it('stringifies arrays as repeated keys and skips nullish values', () => {
    expect(stringifyQuery({ tag: ['ui', 'router'], empty: null, missing: undefined })).toBe(
      '?tag=ui&tag=router',
    )
  })

  it('round-trips encoded values', () => {
    const query = stringifyQuery({ q: 'alice bob', topic: 'routing/intro' })
    expect(query).toBe('?q=alice%20bob&topic=routing%2Fintro')
    expect(parseQuery(query)).toEqual({ q: 'alice bob', topic: 'routing/intro' })
  })
})

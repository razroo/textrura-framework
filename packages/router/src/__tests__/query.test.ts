import { describe, expect, it } from 'vitest'
import { parseQuery, stringifyQuery } from '../query.js'

describe('query helpers', () => {
  it('parses empty search string', () => {
    expect(parseQuery('')).toEqual({})
  })

  it('parses lone question mark as empty', () => {
    expect(parseQuery('?')).toEqual({})
  })

  it('parses key without equals as empty value', () => {
    expect(parseQuery('enable')).toEqual({ enable: '' })
    expect(parseQuery('?flag&on=1')).toEqual({ flag: '', on: '1' })
  })

  it('treats plus as space when decoding values', () => {
    expect(parseQuery('q=alice+bob')).toEqual({ q: 'alice bob' })
  })

  it('keeps raw segment when percent-decoding throws', () => {
    expect(parseQuery('a=%ZZ&b=ok')).toEqual({ a: '%ZZ', b: 'ok' })
  })

  it('stringifies empty object as empty string', () => {
    expect(stringifyQuery({})).toBe('')
  })

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

  it('preserves equals signs inside a value (only first = splits key from value)', () => {
    expect(parseQuery('expr=a=b')).toEqual({ expr: 'a=b' })
    expect(parseQuery('?a=b=c&d=1')).toEqual({ a: 'b=c', d: '1' })
  })

  it('merges repeated keys when an earlier value is empty', () => {
    expect(parseQuery('x=&x=1')).toEqual({ x: ['', '1'] })
  })

  it('stringifies boolean false and true', () => {
    expect(stringifyQuery({ ok: true, no: false })).toBe('?no=false&ok=true')
  })

  it('round-trips booleans through parse and stringify', () => {
    const q = stringifyQuery({ flag: true })
    expect(parseQuery(q)).toEqual({ flag: 'true' })
  })
})

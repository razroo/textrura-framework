import { describe, expect, it } from 'vitest'
import { parseQuery, stringifyQuery } from '../query.js'

describe('query helpers', () => {
  it('parses empty search string', () => {
    const q = parseQuery('')
    expect(q).toEqual({})
    expect(Object.getPrototypeOf(q)).toBeNull()
  })

  it('parses lone question mark as empty', () => {
    const q = parseQuery('?')
    expect(q).toEqual({})
    expect(Object.getPrototypeOf(q)).toBeNull()
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

  it('keeps raw key when percent-decoding the key throws', () => {
    expect(parseQuery('%ZZ=1&ok=2')).toEqual({ '%ZZ': '1', ok: '2' })
  })

  it('ignores empty segments from leading, trailing, or repeated ampersands', () => {
    expect(parseQuery('&a=1&')).toEqual({ a: '1' })
    expect(parseQuery('a=1&&b=2')).toEqual({ a: '1', b: '2' })
    expect(parseQuery('?&&')).toEqual({})
    expect(Object.getPrototypeOf(parseQuery('?&&'))).toBeNull()
  })

  it('stores __proto__ as a normal key on a null-prototype result (no prototype pollution)', () => {
    const q = parseQuery('__proto__=x')
    // Object literal `{ __proto__: 'x' }` is special-cased in JS; assert own properties explicitly.
    expect(Object.keys(q)).toEqual(['__proto__'])
    expect(q['__proto__']).toBe('x')
    expect(Object.getPrototypeOf(q)).toBeNull()
    expect(Object.hasOwn(q, '__proto__')).toBe(true)
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

  it('stringifies empty string values and round-trips them', () => {
    expect(stringifyQuery({ x: '' })).toBe('?x=')
    expect(parseQuery('?x=')).toEqual({ x: '' })
  })

  it('stringifies numeric zero and round-trips as string', () => {
    expect(stringifyQuery({ n: 0 })).toBe('?n=0')
    expect(parseQuery('?n=0')).toEqual({ n: '0' })
  })

  it('omits keys whose array value is empty (no pairs emitted for that key)', () => {
    expect(stringifyQuery({ tag: [], other: 'x' })).toBe('?other=x')
  })

  it('stringifies arrays skipping nullish entries while preserving order of remaining values', () => {
    expect(stringifyQuery({ mix: [null, 'a', undefined, 'b'] })).toBe('?mix=a&mix=b')
  })
})

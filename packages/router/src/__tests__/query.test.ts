import { describe, expect, it } from 'vitest'
import { parseQuery, stringifyQuery, type QueryInput } from '../query.js'

describe('query helpers', () => {
  it('returns empty null-prototype result for non-string input without throwing', () => {
    expect(parseQuery(null as never)).toEqual({})
    expect(Object.getPrototypeOf(parseQuery(null as never))).toBeNull()
    expect(parseQuery(undefined as never)).toEqual({})
    expect(parseQuery(0 as never)).toEqual({})
    expect(parseQuery(false as never)).toEqual({})
    const sym = Symbol('q') as never
    expect(() => parseQuery(sym)).not.toThrow()
    expect(parseQuery(sym)).toEqual({})
  })

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

  it('ignores a URL fragment after the first raw # (query vs hash boundary)', () => {
    expect(parseQuery('?a=1#ignored')).toEqual({ a: '1' })
    expect(parseQuery('a=2&b=3#hash')).toEqual({ a: '2', b: '3' })
    expect(parseQuery('?#')).toEqual({})
    expect(parseQuery('#solo')).toEqual({})
  })

  it('does not strip # that is percent-encoded inside a value', () => {
    expect(parseQuery('q=a%23b')).toEqual({ q: 'a#b' })
  })

  it('parses key without equals as empty value', () => {
    expect(parseQuery('enable')).toEqual({ enable: '' })
    expect(parseQuery('?flag&on=1')).toEqual({ flag: '', on: '1' })
  })

  it('parses empty key before equals as a normal property on null-prototype result', () => {
    expect(parseQuery('=solo')).toEqual({ '': 'solo' })
    expect(Object.getPrototypeOf(parseQuery('=solo'))).toBeNull()
    expect(parseQuery('a=1&=2&=3')).toEqual({ a: '1', '': ['2', '3'] })
  })

  it('stringifies empty string keys (sorted before other keys) and round-trips', () => {
    expect(stringifyQuery({ '': 'x', a: '1' })).toBe('?=x&a=1')
    expect(parseQuery('?=x&a=1')).toEqual({ '': 'x', a: '1' })
  })

  it('treats plus as space when decoding values', () => {
    expect(parseQuery('q=alice+bob')).toEqual({ q: 'alice bob' })
  })

  it('treats plus as space when decoding keys', () => {
    expect(parseQuery('my+key=1')).toEqual({ 'my key': '1' })
    expect(parseQuery('?a+b=c')).toEqual({ 'a b': 'c' })
  })

  it('treats literal plus as space before URI decoding; %2B survives as a plus sign', () => {
    expect(parseQuery('q=a+b')).toEqual({ q: 'a b' })
    expect(parseQuery('q=a%2Bb')).toEqual({ q: 'a+b' })
    expect(parseQuery('k%2Bey=v')).toEqual({ 'k+ey': 'v' })
  })

  it('stores constructor as an own string key on a null-prototype result', () => {
    const q = parseQuery('constructor=proto')
    expect(Object.getPrototypeOf(q)).toBeNull()
    expect(Object.hasOwn(q, 'constructor')).toBe(true)
    expect(q['constructor']).toBe('proto')
    expect(q.constructor).toBe('proto')
    expect(Object.keys(q)).toEqual(['constructor'])
  })

  it('keeps raw segment when percent-decoding throws', () => {
    expect(parseQuery('a=%ZZ&b=ok')).toEqual({ a: '%ZZ', b: 'ok' })
  })

  it('keeps raw value when decoding throws on a lone trailing percent', () => {
    expect(parseQuery('a=%')).toEqual({ a: '%' })
    expect(parseQuery('x=foo%')).toEqual({ x: 'foo%' })
  })

  it('keeps raw key when percent-decoding the key throws', () => {
    expect(parseQuery('%ZZ=1&ok=2')).toEqual({ '%ZZ': '1', ok: '2' })
  })

  it('keeps raw key when decoding throws on a lone trailing percent in the key', () => {
    expect(parseQuery('%=1')).toEqual({ '%': '1' })
    expect(parseQuery('foo%=bar')).toEqual({ 'foo%': 'bar' })
  })

  it('keeps raw value when decoding throws on incomplete UTF-8 percent sequence', () => {
    // Two UTF-8 continuation bytes missing after leading byte U+0098 (e.g. truncated copy-paste).
    expect(parseQuery('a=%E2%98')).toEqual({ a: '%E2%98' })
    expect(parseQuery('x=%F0%9F')).toEqual({ x: '%F0%9F' })
  })

  it('keeps raw key when decoding throws on incomplete UTF-8 in the key', () => {
    expect(parseQuery('%E2%98=1')).toEqual({ '%E2%98': '1' })
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

  it('stringifies only own enumerable keys (ignores inherited properties on the prototype chain)', () => {
    const proto = { inherited: 'ignored' }
    const query = Object.assign(Object.create(proto), { visible: 'yes' }) as QueryInput
    expect(stringifyQuery(query)).toBe('?visible=yes')
  })

  it('ignores symbol keys (Object.keys does not enumerate them)', () => {
    const sym = Symbol('meta')
    const raw: Record<PropertyKey, unknown> = { route: '/home' }
    raw[sym] = 'hidden'
    expect(stringifyQuery(raw as QueryInput)).toBe('?route=%2Fhome')
  })

  it('returns empty string when the only enumerable keys are symbols', () => {
    const sym = Symbol('only')
    const raw: Record<PropertyKey, unknown> = {}
    raw[sym] = 'x'
    expect(stringifyQuery(raw as QueryInput)).toBe('')
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

  it('merges a bare key segment after an earlier value for the same key', () => {
    expect(parseQuery('a=1&a')).toEqual({ a: ['1', ''] })
  })

  it('merges a bare key before a later explicit value for the same key', () => {
    expect(parseQuery('a&a=2')).toEqual({ a: ['', '2'] })
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

  it('omits non-finite numbers (NaN, ±Infinity, and double overflow to Infinity)', () => {
    const jsonExponentOverflow = Number.parseFloat('1e400')
    expect(stringifyQuery({ n: Number.NaN })).toBe('')
    expect(stringifyQuery({ a: 1, n: Number.NaN })).toBe('?a=1')
    expect(stringifyQuery({ x: Number.POSITIVE_INFINITY })).toBe('')
    expect(stringifyQuery({ x: Number.NEGATIVE_INFINITY, y: 2 })).toBe('?y=2')
    expect(jsonExponentOverflow).toBe(Infinity)
    expect(stringifyQuery({ overflow: jsonExponentOverflow })).toBe('')
    expect(stringifyQuery({ a: 1, overflow: jsonExponentOverflow })).toBe('?a=1')
    expect(Number.MAX_VALUE * 2).toBe(Infinity)
    expect(stringifyQuery({ huge: Number.MAX_VALUE * 2 })).toBe('')
  })

  it('stringifies bigint values without throwing (runtime input; not part of QueryValue typing)', () => {
    const solo = { n: BigInt(42) } as unknown as QueryInput
    expect(stringifyQuery(solo)).toBe('?n=42')
    const mixed = { a: 1, b: BigInt(2) } as unknown as QueryInput
    expect(stringifyQuery(mixed)).toBe('?a=1&b=2')
    const inArray = { tag: [BigInt(0), 'x'] } as unknown as QueryInput
    expect(stringifyQuery(inArray)).toBe('?tag=0&tag=x')
  })

  it('omits non-finite entries inside arrays while preserving finite values', () => {
    expect(stringifyQuery({ mix: [Number.NaN, 'a', Number.POSITIVE_INFINITY, 3] })).toBe('?mix=a&mix=3')
    expect(stringifyQuery({ mix: ['a', Number.parseFloat('1e400'), 3] })).toBe('?mix=a&mix=3')
  })

  it('stringifies ill-formed UTF-16 (lone surrogates) without throwing, via toWellFormed normalization', () => {
    const loneHigh = '\uD800'
    const loneLow = '\uDC00'
    expect(() => stringifyQuery({ [loneHigh]: '1' })).not.toThrow()
    expect(() => stringifyQuery({ k: loneLow })).not.toThrow()
    expect(stringifyQuery({ [loneHigh]: 'a' })).toBe('?%EF%BF%BD=a')
    expect(stringifyQuery({ x: loneLow })).toBe('?x=%EF%BF%BD')
  })

  it('omits keys whose array value is empty (no pairs emitted for that key)', () => {
    expect(stringifyQuery({ tag: [], other: 'x' })).toBe('?other=x')
  })

  it('stringifies arrays skipping nullish entries while preserving order of remaining values', () => {
    expect(stringifyQuery({ mix: [null, 'a', undefined, 'b'] })).toBe('?mix=a&mix=b')
  })

  it('round-trips keys that require percent-encoding', () => {
    const input = {
      'a&b': '1',
      'q=c': '2',
      'spa ce': '3',
      'café': '4',
    }
    const serialized = stringifyQuery(input)
    expect(parseQuery(serialized)).toEqual(input)
  })

  it('round-trips through null-prototype query objects without prototype pollution', () => {
    const input = Object.assign(Object.create(null), {
      ['__proto__']: 'safe',
      ['constructor']: 'also-safe',
    }) as Record<string, string>
    const serialized = stringifyQuery(input)
    const parsed = parseQuery(serialized)
    expect(Object.getPrototypeOf(parsed)).toBeNull()
    expect(parsed['__proto__']).toBe('safe')
    expect(parsed.constructor).toBe('also-safe')
  })

  it('stringifies __proto__ from null-prototype input and round-trips without prototype pollution', () => {
    const input = Object.assign(Object.create(null), {
      ['__proto__']: 'payload',
      z: '2',
    }) as QueryInput
    const serialized = stringifyQuery(input)
    expect(serialized).toMatch(/\b__proto__=/)
    const parsed = parseQuery(serialized)
    expect(Object.getPrototypeOf(parsed)).toBeNull()
    expect(Object.hasOwn(parsed, '__proto__')).toBe(true)
    expect(parsed['__proto__']).toBe('payload')
    expect(parsed.z).toBe('2')
  })

  it('decodes UTF-8 percent-encoded values including non-BMP code points', () => {
    expect(parseQuery('emoji=%F0%9F%9A%80')).toEqual({ emoji: '🚀' })
    expect(parseQuery('check=%E2%9C%93')).toEqual({ check: '✓' })
    expect(parseQuery('%F0%9F%98%80=1')).toEqual({ '😀': '1' })
  })

  it('round-trips emoji and mixed-script keys and values through stringify and parse', () => {
    const input = { '🚀': 'lift-off', q: '🙂', café: 'naïve' }
    expect(parseQuery(stringifyQuery(input))).toEqual(input)
  })
})

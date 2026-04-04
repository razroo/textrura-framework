import type { ComputedLayout } from 'textura'
import { describe, it, expect } from 'vitest'
import { finiteNumberOrZero, layoutBoundsAreFinite } from '../layout-bounds.js'

const emptyChildren = [] as const

describe('layoutBoundsAreFinite', () => {
  it('accepts a normal finite rect with non-negative size', () => {
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 100, height: 50, children: [] })).toBe(true)
    expect(layoutBoundsAreFinite({ x: -10, y: 3.5, width: 0, height: 0, children: [] })).toBe(true)
  })

  it('ignores extra enumerable keys on the layout object (only x, y, width, height are validated)', () => {
    const withExtra = {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      children: [],
      extra: 'ignored',
      depth: NaN,
    } as unknown as ComputedLayout
    expect(layoutBoundsAreFinite(withExtra)).toBe(true)
  })

  it('accepts extreme finite coordinates and subnormal positive width/height (still Number.isFinite)', () => {
    const children = [] as const
    expect(
      layoutBoundsAreFinite({
        x: Number.MAX_SAFE_INTEGER,
        y: Number.MIN_SAFE_INTEGER,
        width: Number.MAX_VALUE,
        height: Number.MIN_VALUE,
        children,
      }),
    ).toBe(true)
  })

  it('accepts IEEE negative zero width/height (still satisfies >= 0 in JS)', () => {
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: -0, height: -0, children: [] })).toBe(true)
  })

  it('accepts IEEE negative zero for x and y (finite origin; serializers may emit -0)', () => {
    expect(layoutBoundsAreFinite({ x: -0, y: -0, width: 10, height: 10, children: [] })).toBe(true)
  })

  it('accepts subnormal positive width and height (Number.isFinite; must not require width > 0)', () => {
    expect(
      layoutBoundsAreFinite({
        x: 0,
        y: 0,
        width: Number.MIN_VALUE,
        height: Number.MIN_VALUE,
        children: [],
      }),
    ).toBe(true)
  })

  it('rejects negative width or height', () => {
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: -1, height: 10, children: [] })).toBe(false)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 10, height: -0.001, children: [] })).toBe(false)
  })

  it('rejects negative subnormal width or height (still < 0 despite tiny magnitude)', () => {
    const negSub = -Number.MIN_VALUE
    expect(negSub).toBeLessThan(0)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: negSub, height: 10, children: [] })).toBe(false)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 10, height: negSub, children: [] })).toBe(false)
  })

  it('accepts positive subnormal width and height (finite, non-negative; distinct from negative subnormals)', () => {
    expect(
      layoutBoundsAreFinite({
        x: 0,
        y: 0,
        width: Number.MIN_VALUE,
        height: Number.MIN_VALUE,
        children: [],
      }),
    ).toBe(true)
  })

  it('accepts finite extreme magnitudes including Number.MAX_VALUE (not limited to safe integers)', () => {
    expect(
      layoutBoundsAreFinite({
        x: 0,
        y: 0,
        width: Number.MAX_VALUE,
        height: Number.MAX_SAFE_INTEGER,
        children: [],
      }),
    ).toBe(true)
  })

  it('rejects NaN on any axis or dimension', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    expect(layoutBoundsAreFinite({ ...base, x: NaN })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, y: NaN })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, width: NaN })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, height: NaN })).toBe(false)
  })

  it('rejects non-finite infinities', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    expect(layoutBoundsAreFinite({ ...base, x: Infinity })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, y: -Infinity })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, width: Infinity })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, height: -Infinity })).toBe(false)
  })

  it('rejects bounds that overflow double range to ±Infinity (JSON exponent edge cases)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    const posOverflow = Number.parseFloat('1e400')
    const negOverflow = Number.parseFloat('-1e400')
    expect(posOverflow).toBe(Infinity)
    expect(layoutBoundsAreFinite({ ...base, width: posOverflow })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, height: posOverflow })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, x: posOverflow })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, y: negOverflow })).toBe(false)
    expect(Number.MAX_VALUE * 2).toBe(Infinity)
    expect(layoutBoundsAreFinite({ ...base, width: Number.MAX_VALUE * 2 })).toBe(false)
  })

  it('rejects non-number values (corrupt runtime / bad deserialization)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    expect(layoutBoundsAreFinite({ ...base, x: undefined as unknown as number })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, y: null as unknown as number })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, width: '10' as unknown as number })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, height: true as unknown as number })).toBe(false)
  })

  it('rejects BigInt on any axis without throwing (typeof gate; BigInt is not a number)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    const b = 1n as unknown as number
    expect(layoutBoundsAreFinite({ ...base, x: b })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, y: b })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, width: b })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, height: b })).toBe(false)
  })

  it('rejects Symbol and function values on any axis without throwing', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    const sym = Symbol('bounds') as unknown as number
    expect(layoutBoundsAreFinite({ ...base, x: sym })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, height: sym })).toBe(false)
    const fn = (() => 0) as unknown as number
    expect(layoutBoundsAreFinite({ ...base, y: fn })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, width: fn })).toBe(false)
  })

  it('rejects sparse or empty layout objects (undefined bounds from corrupt trees)', () => {
    expect(layoutBoundsAreFinite({} as unknown as ComputedLayout)).toBe(false)
    expect(
      layoutBoundsAreFinite({ x: 0, y: 0, width: 1, children: emptyChildren } as unknown as ComputedLayout),
    ).toBe(false)
    expect(
      layoutBoundsAreFinite({ x: 0, y: 0, height: 1, children: emptyChildren } as unknown as ComputedLayout),
    ).toBe(false)
  })

  it('rejects boxed Number primitives (typeof object, not plain numbers)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: emptyChildren }
    expect(layoutBoundsAreFinite({ ...base, x: Object(0) as unknown as number })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, width: Object(10) as unknown as number })).toBe(false)
  })

  it('rejects array and ordinary object values on bounds (corrupt deserialization)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    expect(layoutBoundsAreFinite({ ...base, x: [0] as unknown as number })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, y: { v: 1 } as unknown as number })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, width: [] as unknown as number })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, height: {} as unknown as number })).toBe(false)
  })

  it('rejects Map, Set, and Promise values on bounds without throwing (typeof object; no ToNumber)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    const m = new Map() as unknown as number
    const s = new Set() as unknown as number
    const p = Promise.resolve(1) as unknown as number
    expect(() => layoutBoundsAreFinite({ ...base, x: m })).not.toThrow()
    expect(layoutBoundsAreFinite({ ...base, x: m })).toBe(false)
    expect(() => layoutBoundsAreFinite({ ...base, y: s })).not.toThrow()
    expect(layoutBoundsAreFinite({ ...base, y: s })).toBe(false)
    expect(() => layoutBoundsAreFinite({ ...base, width: p })).not.toThrow()
    expect(layoutBoundsAreFinite({ ...base, width: p })).toBe(false)
    expect(() => layoutBoundsAreFinite({ ...base, height: m })).not.toThrow()
    expect(layoutBoundsAreFinite({ ...base, height: m })).toBe(false)
  })

  it('rejects Date and RegExp values on bounds without throwing (typeof object, not plain numbers)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    const d = new Date(0) as unknown as number
    const r = /./ as unknown as number
    expect(() => layoutBoundsAreFinite({ ...base, x: d })).not.toThrow()
    expect(layoutBoundsAreFinite({ ...base, x: d })).toBe(false)
    expect(() => layoutBoundsAreFinite({ ...base, y: r })).not.toThrow()
    expect(layoutBoundsAreFinite({ ...base, y: r })).toBe(false)
    expect(() => layoutBoundsAreFinite({ ...base, width: d })).not.toThrow()
    expect(layoutBoundsAreFinite({ ...base, width: d })).toBe(false)
    expect(() => layoutBoundsAreFinite({ ...base, height: r })).not.toThrow()
    expect(layoutBoundsAreFinite({ ...base, height: r })).toBe(false)
  })

  it('rejects objects with valueOf returning a finite number (typeof must be number)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    const coercible = { valueOf: () => 42 } as unknown as number
    expect(layoutBoundsAreFinite({ ...base, x: coercible })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, width: coercible })).toBe(false)
  })

  it('rejects objects with Symbol.toPrimitive returning a number (typeof object; no numeric coercion)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    const exotic = { [Symbol.toPrimitive]: () => 7 } as unknown as number
    expect(() => layoutBoundsAreFinite({ ...base, y: exotic })).not.toThrow()
    expect(layoutBoundsAreFinite({ ...base, y: exotic })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, height: exotic })).toBe(false)
  })

  it('validates only the root node (does not recurse into children)', () => {
    const corruptChild = {
      x: NaN,
      y: 0,
      width: 1,
      height: 1,
      children: [],
    } as unknown as ComputedLayout
    expect(layoutBoundsAreFinite(corruptChild)).toBe(false)

    const root = {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      children: [corruptChild],
    } as unknown as ComputedLayout
    expect(layoutBoundsAreFinite(root)).toBe(true)
  })

  it('rejects null-prototype layout objects (no own x/y/width/height) without throwing', () => {
    const bare = Object.create(null) as unknown as ComputedLayout
    expect(() => layoutBoundsAreFinite(bare)).not.toThrow()
    expect(layoutBoundsAreFinite(bare)).toBe(false)
  })

  it('rejects Array and array-like objects mistaken for layout (no x/y/width/height fields)', () => {
    expect(layoutBoundsAreFinite([] as unknown as ComputedLayout)).toBe(false)
    expect(layoutBoundsAreFinite([0, 0, 10, 10] as unknown as ComputedLayout)).toBe(false)
    expect(layoutBoundsAreFinite(new Uint32Array(4) as unknown as ComputedLayout)).toBe(false)
  })
})

describe('finiteNumberOrZero', () => {
  it('returns finite numbers unchanged', () => {
    expect(finiteNumberOrZero(0)).toBe(0)
    expect(finiteNumberOrZero(-3.5)).toBe(-3.5)
    expect(finiteNumberOrZero(Number.MAX_VALUE)).toBe(Number.MAX_VALUE)
  })

  it('preserves IEEE negative zero (finite; scroll/sign math must not collapse -0 to +0)', () => {
    expect(1 / finiteNumberOrZero(-0)).toBe(-Infinity)
    expect(Object.is(finiteNumberOrZero(-0), -0)).toBe(true)
  })

  it('maps NaN, ±Infinity, and non-numbers to 0 without throwing', () => {
    expect(finiteNumberOrZero(Number.NaN)).toBe(0)
    expect(finiteNumberOrZero(Number.POSITIVE_INFINITY)).toBe(0)
    expect(finiteNumberOrZero(Number.NEGATIVE_INFINITY)).toBe(0)
    expect(finiteNumberOrZero(undefined)).toBe(0)
    expect(finiteNumberOrZero(null)).toBe(0)
    expect(finiteNumberOrZero('1' as unknown as number)).toBe(0)
    expect(() => finiteNumberOrZero(1n as unknown as number)).not.toThrow()
    expect(finiteNumberOrZero(1n as unknown as number)).toBe(0)
  })

  it('maps double overflow (e.g. MAX_VALUE * 2) to 0 so scroll math cannot become non-finite', () => {
    expect(Number.MAX_VALUE * 2).toBe(Infinity)
    expect(finiteNumberOrZero(Number.MAX_VALUE * 2)).toBe(0)
  })

  it('maps Symbol, boxed numbers, and other objects to 0 without throwing (typeof must be number)', () => {
    const sym = Symbol('scroll') as unknown as number
    expect(() => finiteNumberOrZero(sym)).not.toThrow()
    expect(finiteNumberOrZero(sym)).toBe(0)

    // Boxed `-0` is `typeof object`, so it does not preserve IEEE −0 (unlike primitive `-0` above).
    const boxedNegZero = Object(-0) as unknown as number
    expect(finiteNumberOrZero(boxedNegZero)).toBe(0)
    expect(Object.is(finiteNumberOrZero(boxedNegZero), -0)).toBe(false)
    expect(1 / finiteNumberOrZero(boxedNegZero)).toBe(Infinity)

    expect(finiteNumberOrZero(Object(0) as unknown as number)).toBe(0)
    expect(finiteNumberOrZero(Object(3.5) as unknown as number)).toBe(0)
    expect(finiteNumberOrZero(Object(NaN) as unknown as number)).toBe(0)
    expect(finiteNumberOrZero(Object(Number.POSITIVE_INFINITY) as unknown as number)).toBe(0)
    expect(finiteNumberOrZero(Object(Number.NEGATIVE_INFINITY) as unknown as number)).toBe(0)

    const d = new Date(0) as unknown as number
    expect(() => finiteNumberOrZero(d)).not.toThrow()
    expect(finiteNumberOrZero(d)).toBe(0)

    const coercible = { valueOf: () => 7 } as unknown as number
    expect(finiteNumberOrZero(coercible)).toBe(0)

    const m = new Map() as unknown as number
    const st = new Set() as unknown as number
    const pr = Promise.resolve(0) as unknown as number
    expect(() => finiteNumberOrZero(m)).not.toThrow()
    expect(finiteNumberOrZero(m)).toBe(0)
    expect(finiteNumberOrZero(st)).toBe(0)
    expect(finiteNumberOrZero(pr)).toBe(0)
  })

  it('maps objects with Symbol.toPrimitive to 0 (typeof must be number; no ToNumber coercion)', () => {
    const exotic = { [Symbol.toPrimitive]: () => 99 } as unknown as number
    expect(finiteNumberOrZero(exotic)).toBe(0)
  })
})

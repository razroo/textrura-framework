import type { ComputedLayout } from 'textura'
import { describe, it, expect } from 'vitest'
import { layoutBoundsAreFinite } from '../layout-bounds.js'

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

  it('rejects negative width or height', () => {
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: -1, height: 10, children: [] })).toBe(false)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 10, height: -0.001, children: [] })).toBe(false)
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

  it('rejects non-number values (corrupt runtime / bad deserialization)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    expect(layoutBoundsAreFinite({ ...base, x: undefined as unknown as number })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, y: null as unknown as number })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, width: '10' as unknown as number })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, height: true as unknown as number })).toBe(false)
  })

  it('rejects BigInt on any axis without throwing (Number.isFinite would throw)', () => {
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

  it('rejects objects with valueOf returning a finite number (typeof must be number)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    const coercible = { valueOf: () => 42 } as unknown as number
    expect(layoutBoundsAreFinite({ ...base, x: coercible })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, width: coercible })).toBe(false)
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
})

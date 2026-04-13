import type { ComputedLayout } from 'textura'
import { describe, it, expect } from 'vitest'
import {
  finiteNumberOrZero,
  finiteRootExtent,
  isFinitePlainNumber,
  layoutBoundsAreFinite,
  pointInInclusiveLayoutRect,
  scrollSafeChildOffsets,
} from '../layout-bounds.js'

const emptyChildren = [] as const

describe('isFinitePlainNumber', () => {
  it('accepts finite primitive numbers (including IEEE −0)', () => {
    expect(isFinitePlainNumber(0)).toBe(true)
    const neg0: unknown = -0
    expect(isFinitePlainNumber(neg0)).toBe(true)
    if (isFinitePlainNumber(neg0)) {
      expect(Object.is(neg0, -0)).toBe(true)
    }
    expect(isFinitePlainNumber(Number.MAX_VALUE)).toBe(true)
    expect(isFinitePlainNumber(Number.MIN_VALUE)).toBe(true)
  })

  it('rejects NaN, ±Infinity, and non-numbers (typeof + Number.isFinite parity with layout bounds)', () => {
    expect(isFinitePlainNumber(Number.NaN)).toBe(false)
    expect(isFinitePlainNumber(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isFinitePlainNumber(Number.NEGATIVE_INFINITY)).toBe(false)
    expect(isFinitePlainNumber(undefined)).toBe(false)
    expect(isFinitePlainNumber(null)).toBe(false)
    expect(isFinitePlainNumber('1' as unknown as number)).toBe(false)
    expect(isFinitePlainNumber(1n as unknown as number)).toBe(false)
    expect(isFinitePlainNumber(Object(3) as unknown as number)).toBe(false)
  })
})

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

  it('rejects missing, null, or non-array children (corrupt geometry / bad deserialization)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10 } as Record<string, unknown>
    expect(layoutBoundsAreFinite({ ...base } as unknown as ComputedLayout)).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, children: null } as unknown as ComputedLayout)).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, children: {} } as unknown as ComputedLayout)).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, children: '[]' } as unknown as ComputedLayout)).toBe(false)
    expect(
      layoutBoundsAreFinite({ ...base, children: new Uint32Array() } as unknown as ComputedLayout),
    ).toBe(false)
  })

  it('accepts frozen or sealed empty children arrays (immutable snapshots; Array.isArray still true)', () => {
    const frozen = Object.freeze([] as const)
    expect(Object.isFrozen(frozen)).toBe(true)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 10, height: 10, children: frozen })).toBe(true)

    const sealed = Object.seal([] as [])
    expect(Object.isSealed(sealed)).toBe(true)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 10, height: 10, children: sealed })).toBe(true)
  })

  it('accepts Proxy-wrapped and subclassed arrays as children (Array.isArray true; exotic snapshots)', () => {
    const proxied = new Proxy([] as ComputedLayout[], {}) as ComputedLayout['children']
    expect(Array.isArray(proxied)).toBe(true)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 1, height: 1, children: proxied })).toBe(true)

    class LayoutChildArray extends Array<ComputedLayout> {}
    const subclassed = new LayoutChildArray() as unknown as ComputedLayout['children']
    expect(subclassed instanceof Array).toBe(true)
    expect(Array.isArray(subclassed)).toBe(true)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 1, height: 1, children: subclassed })).toBe(true)
  })

  it('rejects children that inherit Array.prototype but are not Arrays (Array.isArray guard)', () => {
    const children = Object.create(Array.prototype) as unknown as ComputedLayout['children']
    expect(Array.isArray(children)).toBe(false)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 10, height: 10, children })).toBe(false)
  })

  it('rejects Arguments objects as children (array-like length/indices; Array.isArray is false)', () => {
    // Need a real `Arguments` instance; rest parameters produce an Array, which would not exercise this guard.
    const children = (function () {
      // eslint-disable-next-line prefer-rest-params -- intentional `arguments` object for Array.isArray regression
      return arguments
    })({ x: 0, y: 0, width: 1, height: 1, children: [] }) as unknown as ComputedLayout['children']
    expect(Array.isArray(children)).toBe(false)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 10, height: 10, children })).toBe(false)
  })

  it('accepts holey/sparse children arrays (Array.isArray only; parallel walks skip missing indices)', () => {
    const holey = new Array(2) as unknown as ComputedLayout['children']
    expect(holey.length).toBe(2)
    expect(0 in holey).toBe(false)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 1, height: 1, children: holey })).toBe(true)
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

  it('rejects boxed Number(-0) on width/height (typeof object; distinct from primitive IEEE −0 which is valid)', () => {
    const base = { x: 0, y: 0, width: 10, height: 10, children: [] as [] }
    expect(layoutBoundsAreFinite({ ...base, width: Object(-0) as unknown as number })).toBe(false)
    expect(layoutBoundsAreFinite({ ...base, height: Object(-0) as unknown as number })).toBe(false)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: -0, height: 10, children: [] })).toBe(true)
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 10, height: -0, children: [] })).toBe(true)
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

  it('accepts finite bounds inherited from a prototype (destructuring semantics; not own-field-only)', () => {
    const proto = {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      children: [],
    } as unknown as ComputedLayout
    const layout = Object.create(proto) as unknown as ComputedLayout
    expect(Object.hasOwn(layout, 'x')).toBe(false)
    expect(layoutBoundsAreFinite(layout)).toBe(true)
  })

  it('accepts children inherited from prototype when x/y/width/height are own ([[Get]] for children)', () => {
    const proto = { children: [] as const }
    const layout = Object.assign(Object.create(proto), {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    }) as unknown as ComputedLayout
    expect(Object.hasOwn(layout, 'children')).toBe(false)
    expect(layoutBoundsAreFinite(layout)).toBe(true)
  })

  it('rejects non-array children inherited from prototype when own children is absent', () => {
    const proto = { children: '{}' }
    const layout = Object.assign(Object.create(proto), {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    }) as unknown as ComputedLayout
    expect(Object.hasOwn(layout, 'children')).toBe(false)
    expect(layoutBoundsAreFinite(layout)).toBe(false)
  })

  it('accepts finite bounds on non-enumerable prototype data properties ([[Get]] ignores enumerability)', () => {
    const proto = Object.create(null) as Record<string, unknown>
    for (const [key, value] of [
      ['x', 1],
      ['y', 2],
      ['width', 30],
      ['height', 40],
      ['children', []],
    ] as const) {
      Object.defineProperty(proto, key, { value, enumerable: false, writable: true, configurable: true })
    }
    const layout = Object.create(proto) as unknown as ComputedLayout
    expect(Object.getPrototypeOf(layout)).toBe(proto)
    expect(layoutBoundsAreFinite(layout)).toBe(true)
  })

  it('accepts bounds on non-enumerable own data properties (object destructuring uses Get, not enumerability)', () => {
    const children: [] = []
    const layout = { children } as Record<string, unknown>
    for (const [key, value] of [
      ['x', 0],
      ['y', 2],
      ['width', 40],
      ['height', 50],
    ] as const) {
      Object.defineProperty(layout, key, { value, enumerable: false, writable: true, configurable: true })
    }
    expect(layoutBoundsAreFinite(layout as unknown as ComputedLayout)).toBe(true)
  })

  it('accepts bounds supplied via accessor descriptors (destructuring invokes getters)', () => {
    const layout = {
      children: [] as [],
      get x() {
        return 0
      },
      get y() {
        return 1
      },
      get width() {
        return 20
      },
      get height() {
        return 30
      },
    } as unknown as ComputedLayout
    expect(layoutBoundsAreFinite(layout)).toBe(true)
  })

  it('rejects when an accessor returns a non-finite dimension', () => {
    const layout = {
      children: [] as [],
      get x() {
        return 0
      },
      get y() {
        return 0
      },
      get width() {
        return Number.NaN
      },
      get height() {
        return 10
      },
    } as unknown as ComputedLayout
    expect(layoutBoundsAreFinite(layout)).toBe(false)
  })

  it('rejects when own properties shadow valid prototype bounds with corrupt values', () => {
    const proto = {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      children: [],
    } as unknown as ComputedLayout
    const nanWidth = Object.assign(Object.create(proto), { width: Number.NaN }) as unknown as ComputedLayout
    expect(Object.getPrototypeOf(nanWidth)).toBe(proto)
    expect(layoutBoundsAreFinite(nanWidth)).toBe(false)

    const undefinedY = Object.assign(Object.create(proto), {
      y: undefined as unknown as number,
    }) as unknown as ComputedLayout
    expect(layoutBoundsAreFinite(undefinedY)).toBe(false)

    const negHeight = Object.assign(Object.create(proto), { height: -1 }) as unknown as ComputedLayout
    expect(layoutBoundsAreFinite(negHeight)).toBe(false)
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

describe('pointInInclusiveLayoutRect', () => {
  it('matches inclusive edges for ordinary rects', () => {
    expect(pointInInclusiveLayoutRect(0, 0, 0, 0, 100, 50)).toBe(true)
    expect(pointInInclusiveLayoutRect(100, 50, 0, 0, 100, 50)).toBe(true)
    expect(pointInInclusiveLayoutRect(-1, 0, 0, 0, 100, 50)).toBe(false)
    expect(pointInInclusiveLayoutRect(101, 0, 0, 0, 100, 50)).toBe(false)
  })

  it('rejects the next IEEE float past an inclusive max edge (ULP outside [0,1] on a unit rect)', () => {
    const w = 1
    const h = 1
    const pastOne = 1 + 2 ** -52
    expect(pastOne).toBeGreaterThan(1)
    expect(pointInInclusiveLayoutRect(pastOne, 0.5, 0, 0, w, h)).toBe(false)
    expect(pointInInclusiveLayoutRect(0.5, pastOne, 0, 0, w, h)).toBe(false)
    expect(pointInInclusiveLayoutRect(1, 1, 0, 0, w, h)).toBe(true)
  })

  it('binary float addition: absX+width need not equal the shortest decimal; inclusive max still accepts 0.3', () => {
    const absX = 0.1
    const width = 0.2
    expect(absX + width).not.toBe(0.3)
    const right = absX + width
    // Representable 0.3 lies inside [absX, right] even though it is not exactly absX+width in real arithmetic.
    expect(pointInInclusiveLayoutRect(0.3, 4, absX, 0, width, 10)).toBe(true)
    expect(pointInInclusiveLayoutRect(right, 4, absX, 0, width, 10)).toBe(true)
  })

  it('treats IEEE -0 pointer coordinates like +0 on inclusive min edges (subtle float sign)', () => {
    expect(Object.is(-0, 0)).toBe(false)
    expect(pointInInclusiveLayoutRect(-0, 0, 0, 0, 100, 50)).toBe(true)
    expect(pointInInclusiveLayoutRect(0, -0, 0, 0, 100, 50)).toBe(true)
    expect(pointInInclusiveLayoutRect(-0, -0, 0, 0, 100, 50)).toBe(true)
    expect(pointInInclusiveLayoutRect(-0, -0, -0, -0, 10, 10)).toBe(true)
  })

  it('distinguishes negative subnormal pointer coords from the inclusive min edge at abs origin 0', () => {
    const negSub = -Number.MIN_VALUE
    expect(negSub).toBeLessThan(0)
    expect(pointInInclusiveLayoutRect(negSub, 0, 0, 0, 10, 10)).toBe(false)
    expect(pointInInclusiveLayoutRect(0, negSub, 0, 0, 10, 10)).toBe(false)
    expect(pointInInclusiveLayoutRect(Number.MIN_VALUE, Number.MIN_VALUE, 0, 0, 10, 10)).toBe(true)
  })

  it('supports negative absolute origins (Yoga can emit negative x/y for positioned subtrees)', () => {
    // Rect [-10, -5] x [-20, -15] inclusive
    expect(pointInInclusiveLayoutRect(-10, -20, -10, -20, 5, 5)).toBe(true)
    expect(pointInInclusiveLayoutRect(-5, -15, -10, -20, 5, 5)).toBe(true)
    expect(pointInInclusiveLayoutRect(-11, -20, -10, -20, 5, 5)).toBe(false)
    expect(pointInInclusiveLayoutRect(-5, -14, -10, -20, 5, 5)).toBe(false)
  })

  it('zero-size rect hits only the origin corner', () => {
    expect(pointInInclusiveLayoutRect(3, 3, 3, 3, 0, 0)).toBe(true)
    expect(pointInInclusiveLayoutRect(3.001, 3, 3, 3, 0, 0)).toBe(false)
  })

  it('zero-size rect at negative absolute origin hits only that corner (positioned subtrees)', () => {
    expect(pointInInclusiveLayoutRect(-10, -20, -10, -20, 0, 0)).toBe(true)
    expect(pointInInclusiveLayoutRect(-11, -20, -10, -20, 0, 0)).toBe(false)
    expect(pointInInclusiveLayoutRect(-10, -19, -10, -20, 0, 0)).toBe(false)
  })

  it('zero width with positive height is a vertical segment (inclusive x = absX only; y spans absY..absY+height)', () => {
    expect(pointInInclusiveLayoutRect(5, 7, 5, 0, 0, 20)).toBe(true)
    expect(pointInInclusiveLayoutRect(5, 0, 5, 0, 0, 20)).toBe(true)
    expect(pointInInclusiveLayoutRect(5, 20, 5, 0, 0, 20)).toBe(true)
    expect(pointInInclusiveLayoutRect(5.001, 7, 5, 0, 0, 20)).toBe(false)
    expect(pointInInclusiveLayoutRect(4.999, 7, 5, 0, 0, 20)).toBe(false)
    expect(pointInInclusiveLayoutRect(5, 21, 5, 0, 0, 20)).toBe(false)
    expect(pointInInclusiveLayoutRect(5, -0.001, 5, 0, 0, 20)).toBe(false)
  })

  it('zero height with positive width is a horizontal segment (inclusive y = absY only; x spans absX..absX+width)', () => {
    expect(pointInInclusiveLayoutRect(7, 3, 0, 3, 20, 0)).toBe(true)
    expect(pointInInclusiveLayoutRect(0, 3, 0, 3, 20, 0)).toBe(true)
    expect(pointInInclusiveLayoutRect(20, 3, 0, 3, 20, 0)).toBe(true)
    expect(pointInInclusiveLayoutRect(7, 3.001, 0, 3, 20, 0)).toBe(false)
    expect(pointInInclusiveLayoutRect(7, 2.999, 0, 3, 20, 0)).toBe(false)
    expect(pointInInclusiveLayoutRect(21, 3, 0, 3, 20, 0)).toBe(false)
    expect(pointInInclusiveLayoutRect(-0.001, 3, 0, 3, 20, 0)).toBe(false)
  })

  it('treats subnormal width at extreme absX as a collapsed rect: absX+width rounds to absX; inclusive min corner still hits', () => {
    const absX = Number.MAX_VALUE
    const w = Number.MIN_VALUE
    expect(absX + w).toBe(absX)
    expect(pointInInclusiveLayoutRect(absX, 5, absX, 0, w, 10)).toBe(true)
    // Strictly left of absX (1e292 is large enough to decrease MAX_VALUE in IEEE-754 doubles).
    expect(pointInInclusiveLayoutRect(absX - 1e292, 5, absX, 0, w, 10)).toBe(false)
  })

  it('treats subnormal height at extreme absY as a collapsed rect: absY+height rounds to absY; inclusive min corner still hits', () => {
    const absY = Number.MAX_VALUE
    const h = Number.MIN_VALUE
    expect(absY + h).toBe(absY)
    expect(pointInInclusiveLayoutRect(5, absY, 0, absY, 10, h)).toBe(true)
    expect(pointInInclusiveLayoutRect(5, absY - 1e292, 0, absY, 10, h)).toBe(false)
  })

  it('returns false when abs origin + size overflows to Infinity (naive edge sum would accept all finite coords)', () => {
    const max = Number.MAX_VALUE
    expect(max + max).toBe(Infinity)
    // Point lies on the min edges but right = absX + width overflows.
    expect(pointInInclusiveLayoutRect(max, 0, max, 0, max, 10)).toBe(false)
    // Symmetric: bottom = absY + height overflows.
    expect(pointInInclusiveLayoutRect(0, max, 0, max, 10, max)).toBe(false)
    // Control: same large width/height with origin 0 keeps finite right/bottom.
    expect(pointInInclusiveLayoutRect(max, 0, 0, 0, max, 10)).toBe(true)
    expect(pointInInclusiveLayoutRect(0, max, 0, 0, 10, max)).toBe(true)
  })

  it('returns false when abs origin + width overflows though width is not MAX_VALUE (finite operands, infinite right)', () => {
    const max = Number.MAX_VALUE
    // MAX_VALUE + 1 rounds to MAX_VALUE; a large finite addend can still overflow the sum.
    expect(max + 1e307).toBe(Infinity)
    expect(pointInInclusiveLayoutRect(max, 0, max, 0, 1e307, 1)).toBe(false)
    expect(pointInInclusiveLayoutRect(0, max, 0, max, 1, 1e307)).toBe(false)
  })

  it('returns false when a large finite absX plus Number.MAX_VALUE width overflows the right edge (naive x <= right would accept any finite x)', () => {
    const absX = 1e300
    const width = Number.MAX_VALUE
    expect(absX + width).toBe(Infinity)
    // Strictly right of absX, inside the naive span, but right/bottom checks must reject non-finite edges.
    expect(pointInInclusiveLayoutRect(1e301, 0, absX, 0, width, 10)).toBe(false)
  })

  it('returns false when a large finite absY plus Number.MAX_VALUE height overflows the bottom edge', () => {
    const absY = 1e300
    const height = Number.MAX_VALUE
    expect(absY + height).toBe(Infinity)
    expect(pointInInclusiveLayoutRect(0, 1e301, 0, absY, 10, height)).toBe(false)
  })

  it('accepts the far inclusive corner at Number.MAX_VALUE when the rect starts at the origin (finite right/bottom; no abs+size overflow)', () => {
    const max = Number.MAX_VALUE
    expect(max + max).toBe(Infinity)
    // Distinct from the translated-max case: here absX+width and absY+height stay finite.
    expect(pointInInclusiveLayoutRect(max, max, 0, 0, max, max)).toBe(true)
    expect(pointInInclusiveLayoutRect(max, 0, 0, 0, max, 10)).toBe(true)
    expect(pointInInclusiveLayoutRect(0, max, 0, 0, 10, max)).toBe(true)
  })

  it('returns false when both right and bottom overflow (finite corner point; naive <= edge would accept)', () => {
    const max = Number.MAX_VALUE
    expect(max + max).toBe(Infinity)
    // Origin and size each MAX_VALUE so right/bottom are max+max → Infinity; point (max,max) lies on the
    // would-be min corner, not a finite inclusive far edge.
    expect(pointInInclusiveLayoutRect(max, max, max, max, max, max)).toBe(false)
  })

  it('returns false for non-finite pointer coords or negative width/height', () => {
    expect(pointInInclusiveLayoutRect(Number.NaN, 0, 0, 0, 1, 1)).toBe(false)
    expect(pointInInclusiveLayoutRect(0, Infinity, 0, 0, 1, 1)).toBe(false)
    expect(pointInInclusiveLayoutRect(0, 0, 0, 0, -1, 1)).toBe(false)
    expect(pointInInclusiveLayoutRect(0, 0, 0, 0, 1, -0.5)).toBe(false)
  })

  it('returns false when rect origin or size arguments are non-finite (corrupt abs layout)', () => {
    expect(pointInInclusiveLayoutRect(0, 0, Number.NaN, 0, 1, 1)).toBe(false)
    expect(pointInInclusiveLayoutRect(0, 0, 0, Number.POSITIVE_INFINITY, 1, 1)).toBe(false)
    expect(pointInInclusiveLayoutRect(0, 0, 0, 0, Number.NaN, 1)).toBe(false)
    expect(pointInInclusiveLayoutRect(0, 0, 0, 0, Number.POSITIVE_INFINITY, 1)).toBe(false)
    expect(pointInInclusiveLayoutRect(0, 0, 0, 0, 1, Number.POSITIVE_INFINITY)).toBe(false)
    expect(pointInInclusiveLayoutRect(0, 0, 0, 0, 1, Number.NEGATIVE_INFINITY)).toBe(false)
  })

  it('treats IEEE negative zero width and height like +0 (width < 0 is false for -0; matches layoutBoundsAreFinite)', () => {
    expect(Object.is(-0, 0)).toBe(false)
    // Collapsed to vertical segment x=0, y in [0, 10]
    expect(pointInInclusiveLayoutRect(0, 0, 0, 0, -0, 10)).toBe(true)
    expect(pointInInclusiveLayoutRect(0, 5, 0, 0, -0, 10)).toBe(true)
    expect(pointInInclusiveLayoutRect(1, 5, 0, 0, -0, 10)).toBe(false)
    // Collapsed to horizontal segment y=0, x in [0, 10]
    expect(pointInInclusiveLayoutRect(0, 0, 0, 0, 10, -0)).toBe(true)
    expect(pointInInclusiveLayoutRect(5, 0, 0, 0, 10, -0)).toBe(true)
    expect(pointInInclusiveLayoutRect(5, 1, 0, 0, 10, -0)).toBe(false)
  })

  it('returns false for boxed pointer coordinates (Number.isFinite is false; must not coerce)', () => {
    expect(Number.isFinite(Object(5) as unknown as number)).toBe(false)
    expect(pointInInclusiveLayoutRect(Object(5) as unknown as number, 0, 0, 0, 10, 10)).toBe(false)
    expect(pointInInclusiveLayoutRect(0, Object(5) as unknown as number, 0, 0, 10, 10)).toBe(false)
  })

  it('returns false for bigint pointer coords without throwing (non-Number; Number.isFinite is false)', () => {
    expect(() =>
      pointInInclusiveLayoutRect(0n as unknown as number, 0, 0, 0, 10, 10),
    ).not.toThrow()
    expect(pointInInclusiveLayoutRect(0n as unknown as number, 0, 0, 0, 10, 10)).toBe(false)
    expect(() =>
      pointInInclusiveLayoutRect(0, 0n as unknown as number, 0, 0, 10, 10),
    ).not.toThrow()
    expect(pointInInclusiveLayoutRect(0, 0n as unknown as number, 0, 0, 10, 10)).toBe(false)
  })

  it('returns false for symbol or boolean pointer coords without throwing (Number.isFinite requires a primitive number)', () => {
    const sym = Symbol('p') as unknown as number
    expect(() => pointInInclusiveLayoutRect(sym, 0, 0, 0, 10, 10)).not.toThrow()
    expect(pointInInclusiveLayoutRect(sym, 0, 0, 0, 10, 10)).toBe(false)
    expect(() => pointInInclusiveLayoutRect(0, sym, 0, 0, 10, 10)).not.toThrow()
    expect(pointInInclusiveLayoutRect(0, sym, 0, 0, 10, 10)).toBe(false)
    expect(() => pointInInclusiveLayoutRect(true as unknown as number, 0, 0, 0, 10, 10)).not.toThrow()
    expect(pointInInclusiveLayoutRect(true as unknown as number, 0, 0, 0, 10, 10)).toBe(false)
    expect(() => pointInInclusiveLayoutRect(0, false as unknown as number, 0, 0, 10, 10)).not.toThrow()
    expect(pointInInclusiveLayoutRect(0, false as unknown as number, 0, 0, 10, 10)).toBe(false)
  })

  it('returns false for bigint rect origin or size without throwing (corrupt abs layout / bad coercion)', () => {
    const b = 3n as unknown as number
    expect(() => pointInInclusiveLayoutRect(0, 0, b, 0, 10, 10)).not.toThrow()
    expect(pointInInclusiveLayoutRect(0, 0, b, 0, 10, 10)).toBe(false)
    expect(() => pointInInclusiveLayoutRect(0, 0, 0, b, 10, 10)).not.toThrow()
    expect(pointInInclusiveLayoutRect(0, 0, 0, b, 10, 10)).toBe(false)
    expect(() => pointInInclusiveLayoutRect(0, 0, 0, 0, b, 10)).not.toThrow()
    expect(pointInInclusiveLayoutRect(0, 0, 0, 0, b, 10)).toBe(false)
    expect(() => pointInInclusiveLayoutRect(0, 0, 0, 0, 10, b)).not.toThrow()
    expect(pointInInclusiveLayoutRect(0, 0, 0, 0, 10, b)).toBe(false)
  })

  it('returns false for string, null, undefined, or boxed rect args without coercion (JSON / host bug guard)', () => {
    const str = '10' as unknown as number
    const boxed = Object(10) as unknown as number
    for (const bad of [str, null as unknown as number, undefined as unknown as number, boxed] as const) {
      expect(() => pointInInclusiveLayoutRect(5, 5, bad, 0, 10, 10)).not.toThrow()
      expect(pointInInclusiveLayoutRect(5, 5, bad, 0, 10, 10)).toBe(false)
      expect(() => pointInInclusiveLayoutRect(5, 5, 0, bad, 10, 10)).not.toThrow()
      expect(pointInInclusiveLayoutRect(5, 5, 0, bad, 10, 10)).toBe(false)
      expect(() => pointInInclusiveLayoutRect(5, 5, 0, 0, bad, 10)).not.toThrow()
      expect(pointInInclusiveLayoutRect(5, 5, 0, 0, bad, 10)).toBe(false)
      expect(() => pointInInclusiveLayoutRect(5, 5, 0, 0, 10, bad)).not.toThrow()
      expect(pointInInclusiveLayoutRect(5, 5, 0, 0, 10, bad)).toBe(false)
    }
  })
})

describe('finiteRootExtent', () => {
  it('returns undefined for omitted or non-finite values (unconstrained root)', () => {
    expect(finiteRootExtent(undefined)).toBeUndefined()
    expect(finiteRootExtent(Number.NaN)).toBeUndefined()
    expect(finiteRootExtent(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(finiteRootExtent(Number.NEGATIVE_INFINITY)).toBeUndefined()
  })

  it('returns undefined for non-number runtime values without coercion', () => {
    expect(finiteRootExtent(null as unknown as number)).toBeUndefined()
    expect(finiteRootExtent('100' as unknown as number)).toBeUndefined()
    expect(finiteRootExtent('' as unknown as number)).toBeUndefined()
    expect(finiteRootExtent(1n as unknown as number)).toBeUndefined()
    expect(finiteRootExtent(Object(50) as unknown as number)).toBeUndefined()
    // Boxed numbers are typeof object; must not normalize IEEE −0 via primitive path.
    expect(finiteRootExtent(Object(-0) as unknown as number)).toBeUndefined()
    // Corrupt JSON / mistaken host options (booleans are not roots).
    expect(finiteRootExtent(true as unknown as number)).toBeUndefined()
    expect(finiteRootExtent(false as unknown as number)).toBeUndefined()
  })

  it('returns undefined for Symbol, function, and array values without throwing (typeof guard; parity with layout bounds)', () => {
    expect(() => finiteRootExtent(Symbol('root') as unknown as number)).not.toThrow()
    expect(finiteRootExtent(Symbol('root') as unknown as number)).toBeUndefined()
    expect(() => finiteRootExtent((() => 100) as unknown as number)).not.toThrow()
    expect(finiteRootExtent((() => 100) as unknown as number)).toBeUndefined()
    expect(() => finiteRootExtent([] as unknown as number)).not.toThrow()
    expect(finiteRootExtent([] as unknown as number)).toBeUndefined()
  })

  it('returns undefined for negative sizes', () => {
    expect(finiteRootExtent(-1)).toBeUndefined()
    expect(finiteRootExtent(-Number.MIN_VALUE)).toBeUndefined()
    expect(finiteRootExtent(-Number.EPSILON)).toBeUndefined()
    expect(finiteRootExtent(Number.MIN_SAFE_INTEGER)).toBeUndefined()
  })

  it('maps IEEE −0 to +0 and returns 0 (valid non-negative root)', () => {
    expect(Object.is(finiteRootExtent(-0)!, -0)).toBe(false)
    expect(finiteRootExtent(-0)).toBe(0)
  })

  it('returns finite non-negative extents including zero and large magnitudes', () => {
    expect(finiteRootExtent(0)).toBe(0)
    expect(finiteRootExtent(Number.MIN_VALUE)).toBe(Number.MIN_VALUE)
    expect(finiteRootExtent(Number.EPSILON)).toBe(Number.EPSILON)
    expect(finiteRootExtent(Number.MAX_VALUE)).toBe(Number.MAX_VALUE)
  })

  it('accepts the next representable double beyond MAX_SAFE_INTEGER (unsafe integers are still finite roots)', () => {
    const step = Number.MAX_SAFE_INTEGER + 1
    expect(Number.isSafeInteger(step)).toBe(false)
    expect(Number.isFinite(step)).toBe(true)
    expect(finiteRootExtent(step)).toBe(step)
  })

  it('returns undefined when the value overflows double range (JSON exponent edge cases)', () => {
    const posOverflow = Number.parseFloat('1e400')
    const negOverflow = Number.parseFloat('-1e400')
    expect(posOverflow).toBe(Infinity)
    expect(negOverflow).toBe(-Infinity)
    expect(finiteRootExtent(posOverflow)).toBeUndefined()
    expect(finiteRootExtent(negOverflow)).toBeUndefined()
    expect(Number.MAX_VALUE * 2).toBe(Infinity)
    expect(finiteRootExtent(Number.MAX_VALUE * 2)).toBeUndefined()
  })
})

describe('scrollSafeChildOffsets', () => {
  it('treats undefined scroll props like 0 (omitted JSON keys; parity with finiteNumberOrZero)', () => {
    expect(scrollSafeChildOffsets(10, 20, undefined, 4)).toEqual({ ox: 10, oy: 16 })
    expect(scrollSafeChildOffsets(10, 20, 3, undefined)).toEqual({ ox: 7, oy: 20 })
    expect(scrollSafeChildOffsets(10, 20, undefined, undefined)).toEqual({ ox: 10, oy: 20 })
  })

  it('treats boolean scroll props like 0 (finiteNumberOrZero; corrupt JSON cannot slip booleans into subtraction)', () => {
    expect(scrollSafeChildOffsets(10, 20, true as unknown as number, false as unknown as number)).toEqual({
      ox: 10,
      oy: 20,
    })
  })

  it('returns abs minus finite scroll offsets', () => {
    expect(scrollSafeChildOffsets(10, 20, 3, 4)).toEqual({ ox: 7, oy: 16 })
    expect(scrollSafeChildOffsets(0, 0, 0, 0)).toEqual({ ox: 0, oy: 0 })
  })

  it('preserves fractional scroll offsets (sub-pixel smooth scroll / trackpad deltas stay in child space)', () => {
    expect(scrollSafeChildOffsets(100.25, 200.5, 10.125, 40.375)).toEqual({ ox: 90.125, oy: 160.125 })
  })

  it('preserves exact integer differences at safe-integer magnitude (large layouts; doubles stay exact)', () => {
    const max = Number.MAX_SAFE_INTEGER
    const min = Number.MIN_SAFE_INTEGER
    expect(scrollSafeChildOffsets(max, max, 1, 1)).toEqual({ ox: max - 1, oy: max - 1 })
    expect(scrollSafeChildOffsets(min, 0, -1, 0)).toEqual({ ox: min + 1, oy: 0 })
  })

  it('returns negative finite child origins when scroll exceeds abs (over-scroll; hit-test / selection space)', () => {
    expect(scrollSafeChildOffsets(100, 50, 120, 60)).toEqual({ ox: -20, oy: -10 })
    expect(scrollSafeChildOffsets(0, 0, 1, 1)).toEqual({ ox: -1, oy: -1 })
  })

  it('returns finite negative origins at MAX_VALUE scroll when abs is 0 (extreme overscroll; still representable)', () => {
    const max = Number.MAX_VALUE
    expect(Number.isFinite(-max)).toBe(true)
    expect(scrollSafeChildOffsets(0, 0, max, 0)).toEqual({ ox: -max, oy: 0 })
    expect(scrollSafeChildOffsets(0, 0, 0, max)).toEqual({ ox: 0, oy: -max })
    // Large scroll with modest abs: difference stays finite (distinct from abs±scroll overflow → null cases above).
    expect(scrollSafeChildOffsets(100, 200, max, max)).toEqual({ ox: 100 - max, oy: 200 - max })
  })

  it('coerces non-finite scroll props via finiteNumberOrZero', () => {
    expect(scrollSafeChildOffsets(10, 20, Number.NaN, Number.POSITIVE_INFINITY)).toEqual({ ox: 10, oy: 20 })
  })

  it('coerces scroll double-overflow (MAX_VALUE * 2 → Infinity) via finiteNumberOrZero (axis treated as 0 scroll)', () => {
    expect(Number.MAX_VALUE * 2).toBe(Infinity)
    // Infinity scroll coerces to 0 on that axis only; the other axis still subtracts.
    expect(scrollSafeChildOffsets(10, 20, Number.MAX_VALUE * 2, 3)).toEqual({ ox: 10, oy: 17 })
    expect(scrollSafeChildOffsets(10, 20, 3, Number.MAX_VALUE * 2)).toEqual({ ox: 7, oy: 20 })
    expect(scrollSafeChildOffsets(10, 20, Number.MAX_VALUE * 2, Number.MAX_VALUE * 2)).toEqual({ ox: 10, oy: 20 })
  })

  it('coerces boxed Number scroll props to 0 (typeof object; same rule as hit-test / selection walks)', () => {
    const boxed = Object(3) as unknown as number
    expect(finiteNumberOrZero(boxed)).toBe(0)
    expect(scrollSafeChildOffsets(10, 20, boxed, 4)).toEqual({ ox: 10, oy: 16 })
    expect(scrollSafeChildOffsets(10, 20, 3, Object(4) as unknown as number)).toEqual({ ox: 7, oy: 20 })
  })

  it('coerces BigInt scroll offsets to 0 without throwing (typeof guard; parity with finiteNumberOrZero / hit-test)', () => {
    expect(() => scrollSafeChildOffsets(10, 20, 1n as unknown as number, 4)).not.toThrow()
    expect(scrollSafeChildOffsets(10, 20, 1n as unknown as number, 4)).toEqual({ ox: 10, oy: 16 })
    expect(() => scrollSafeChildOffsets(10, 20, 3, 2n as unknown as number)).not.toThrow()
    expect(scrollSafeChildOffsets(10, 20, 3, 2n as unknown as number)).toEqual({ ox: 7, oy: 20 })
  })

  it('coerces boolean scroll offsets to 0 without throwing (finiteNumberOrZero; corrupt serialized scroll props)', () => {
    expect(() => scrollSafeChildOffsets(10, 20, true as unknown as number, 4)).not.toThrow()
    expect(scrollSafeChildOffsets(10, 20, true as unknown as number, 4)).toEqual({ ox: 10, oy: 16 })
    expect(() => scrollSafeChildOffsets(10, 20, 3, false as unknown as number)).not.toThrow()
    expect(scrollSafeChildOffsets(10, 20, 3, false as unknown as number)).toEqual({ ox: 7, oy: 20 })
  })

  it('coerces Symbol scroll offsets to 0 without throwing (typeof guard; parity with finiteNumberOrZero / hit-test walks)', () => {
    const sx = Symbol('sx') as unknown as number
    const sy = Symbol('sy') as unknown as number
    expect(() => scrollSafeChildOffsets(10, 20, sx, 4)).not.toThrow()
    expect(scrollSafeChildOffsets(10, 20, sx, 4)).toEqual({ ox: 10, oy: 16 })
    expect(() => scrollSafeChildOffsets(10, 20, 3, sy)).not.toThrow()
    expect(scrollSafeChildOffsets(10, 20, 3, sy)).toEqual({ ox: 7, oy: 20 })
  })

  it('coerces string scroll props to 0 without throwing (JSON number-as-string; same rule as finiteNumberOrZero)', () => {
    expect(() => scrollSafeChildOffsets(22, 30, '12' as unknown as number, 4)).not.toThrow()
    expect(scrollSafeChildOffsets(22, 30, '12' as unknown as number, 4)).toEqual({ ox: 22, oy: 26 })
    expect(() => scrollSafeChildOffsets(10, 20, 3, '4' as unknown as number)).not.toThrow()
    expect(scrollSafeChildOffsets(10, 20, 3, '4' as unknown as number)).toEqual({ ox: 7, oy: 20 })
  })

  it('coerces array and binary buffer scroll props to 0 without throwing (typeof object; corrupt JSON / host bugs)', () => {
    expect(() => scrollSafeChildOffsets(10, 20, [] as unknown as number, 4)).not.toThrow()
    expect(scrollSafeChildOffsets(10, 20, [] as unknown as number, 4)).toEqual({ ox: 10, oy: 16 })
    expect(() => scrollSafeChildOffsets(10, 20, 3, new Uint8Array(1) as unknown as number)).not.toThrow()
    expect(scrollSafeChildOffsets(10, 20, 3, new Uint8Array(1) as unknown as number)).toEqual({ ox: 7, oy: 20 })
    expect(() => scrollSafeChildOffsets(10, 20, new ArrayBuffer(0) as unknown as number, 0)).not.toThrow()
    expect(scrollSafeChildOffsets(10, 20, new ArrayBuffer(0) as unknown as number, 0)).toEqual({ ox: 10, oy: 20 })
  })

  it('coerces scroll props with valueOf or Symbol.toPrimitive to 0 (typeof object; finiteNumberOrZero parity; no ToNumber)', () => {
    const coercible = { valueOf: () => 99 } as unknown as number
    expect(() => scrollSafeChildOffsets(10, 20, coercible, 4)).not.toThrow()
    expect(scrollSafeChildOffsets(10, 20, coercible, 4)).toEqual({ ox: 10, oy: 16 })
    const exotic = { [Symbol.toPrimitive]: () => 7 } as unknown as number
    expect(() => scrollSafeChildOffsets(10, 20, 3, exotic)).not.toThrow()
    expect(scrollSafeChildOffsets(10, 20, 3, exotic)).toEqual({ ox: 7, oy: 20 })
  })

  it('treats IEEE −0 scroll props like +0 for subtraction (signed-zero scroll from serializers; distinct from abs −0 preservation)', () => {
    expect(scrollSafeChildOffsets(10, 20, -0, -0)).toEqual({ ox: 10, oy: 20 })
    const r = scrollSafeChildOffsets(-0, 10, -0, 0)
    expect(r).not.toBeNull()
    expect(Object.is(r!.ox, -0)).toBe(false)
    expect(r!.ox).toBe(0)
    expect(r!.oy).toBe(10)
  })

  it('maps IEEE −0 abs and matching −0 scroll to +0 child ox (JS −0 − (−0) is +0; must not thread −0 into descendant offsets)', () => {
    // Primitive −0 − (−0) is +0 in IEEE-754 / ECMAScript; pairing with preserved −0 oy below keeps the contract explicit.
    expect(Object.is(-0 - -0, -0)).toBe(false)
    expect(Object.is(-0 - -0, 0)).toBe(true)
    const r = scrollSafeChildOffsets(-0, -0, -0, -0)
    expect(r).not.toBeNull()
    expect(Object.is(r!.ox, -0)).toBe(false)
    expect(r!.ox).toBe(0)
    expect(Object.is(r!.oy, -0)).toBe(false)
    expect(r!.oy).toBe(0)
  })

  it('returns null when abs minus scroll overflows to non-finite (hit-test / selection parity)', () => {
    const max = Number.MAX_VALUE
    expect(max - -max).toBe(Infinity)
    expect(scrollSafeChildOffsets(max, 0, -max, 0)).toBeNull()
    expect(scrollSafeChildOffsets(0, max, 0, -max)).toBeNull()
    // Symmetric case: -max - max underflows to -Infinity (distinct from max - (-max) → +Infinity).
    expect(-max - max).toBe(-Infinity)
    expect(scrollSafeChildOffsets(-max, 0, max, 0)).toBeNull()
    expect(scrollSafeChildOffsets(0, -max, 0, max)).toBeNull()
  })

  it('returns null when only one axis overflows: finite ox while oy = absY - scrollY is non-finite', () => {
    const max = Number.MAX_VALUE
    expect(max - -max).toBe(Infinity)
    // Non-zero finite absX; Y axis alone overflows (scroll pulls past representable range).
    expect(scrollSafeChildOffsets(42, max, 0, -max)).toBeNull()
    expect(scrollSafeChildOffsets(-42, max, 0, -max)).toBeNull()
  })

  it('returns null when scroll subtraction underflows on only one axis (finite other axis; -Infinity poisons the pair)', () => {
    const max = Number.MAX_VALUE
    expect(-max - max).toBe(-Infinity)
    // ox underflows; oy stays finite.
    expect(scrollSafeChildOffsets(-max, 10, max, 0)).toBeNull()
    // oy underflows; ox stays finite.
    expect(scrollSafeChildOffsets(10, -max, 0, max)).toBeNull()
  })

  it('returns null when abs minus scroll overflows for 1e308-scale operands (finite inputs, infinite difference)', () => {
    const big = 1e308
    expect(big - -big).toBe(Infinity)
    expect(scrollSafeChildOffsets(big, 0, -big, 0)).toBeNull()
    expect(scrollSafeChildOffsets(0, big, 0, -big)).toBeNull()
    expect(-big - big).toBe(-Infinity)
    expect(scrollSafeChildOffsets(-big, 0, big, 0)).toBeNull()
    expect(scrollSafeChildOffsets(0, -big, 0, big)).toBeNull()
  })

  it('returns finite child origins when large abs and scroll cancel (no overflow; parity with null cases above)', () => {
    const max = Number.MAX_VALUE
    expect(max - max).toBe(0)
    expect(scrollSafeChildOffsets(max, 10, max, 0)).toEqual({ ox: 0, oy: 10 })
    expect(scrollSafeChildOffsets(10, max, 0, max)).toEqual({ ox: 10, oy: 0 })
    const big = 1e308
    expect(big - big).toBe(0)
    expect(scrollSafeChildOffsets(big, 5, big, 0)).toEqual({ ox: 0, oy: 5 })
    expect(scrollSafeChildOffsets(7, big, 0, big)).toEqual({ ox: 7, oy: 0 })
  })

  it('returns null when abs origin is non-finite (corrupt layout chain; must not walk children with NaN/∞ offsets)', () => {
    expect(scrollSafeChildOffsets(Number.NaN, 0, 0, 0)).toBeNull()
    expect(scrollSafeChildOffsets(0, Number.NaN, 0, 0)).toBeNull()
    expect(scrollSafeChildOffsets(Number.POSITIVE_INFINITY, 0, 0, 0)).toBeNull()
    expect(scrollSafeChildOffsets(0, Number.NEGATIVE_INFINITY, 0, 0)).toBeNull()
    // Scroll is coerced to 0; still non-finite abs poisons the difference.
    expect(scrollSafeChildOffsets(Number.NaN, 10, Number.NaN, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('returns null for bigint abs origins without throwing (bigint − number throws in JS)', () => {
    expect(() => scrollSafeChildOffsets(1n as unknown as number, 0, 0, 0)).not.toThrow()
    expect(scrollSafeChildOffsets(1n as unknown as number, 0, 0, 0)).toBeNull()
    expect(() => scrollSafeChildOffsets(0, 2n as unknown as number, 0, 0)).not.toThrow()
    expect(scrollSafeChildOffsets(0, 2n as unknown as number, 0, 0)).toBeNull()
  })

  it('returns null for string or boxed abs origins without numeric coercion (public API parity with layoutBoundsAreFinite)', () => {
    expect(scrollSafeChildOffsets('10' as unknown as number, 0, 0, 0)).toBeNull()
    expect(scrollSafeChildOffsets(0, '20' as unknown as number, 0, 0)).toBeNull()
    expect(scrollSafeChildOffsets(Object(5) as unknown as number, 0, 0, 0)).toBeNull()
    expect(scrollSafeChildOffsets(0, Object(6) as unknown as number, 0, 0)).toBeNull()
  })

  it('preserves IEEE −0 in child origins when abs uses −0 and scroll is 0 (hit-test / selection parity)', () => {
    const r = scrollSafeChildOffsets(-0, 10, 0, 0)
    expect(r).not.toBeNull()
    expect(Object.is(r!.ox, -0)).toBe(true)
    expect(r!.oy).toBe(10)
  })

  it('preserves IEEE −0 on oy when absY is −0 and scroll is 0 (symmetric with absX −0)', () => {
    const r = scrollSafeChildOffsets(10, -0, 0, 0)
    expect(r).not.toBeNull()
    expect(r!.ox).toBe(10)
    expect(Object.is(r!.oy, -0)).toBe(true)
  })

  it('preserves positive subnormal abs origins when scroll is 0 (tiny finite offsets stay representable)', () => {
    const tiny = Number.MIN_VALUE
    expect(scrollSafeChildOffsets(tiny, 5, 0, 0)).toEqual({ ox: tiny, oy: 5 })
    expect(scrollSafeChildOffsets(5, tiny, 0, 0)).toEqual({ ox: 5, oy: tiny })
  })

  it('preserves subnormal child offsets after subtracting matching scroll (finite difference, not null)', () => {
    const tiny = Number.MIN_VALUE
    // 2 * MIN_VALUE - MIN_VALUE === MIN_VALUE in IEEE-754
    const doubled = tiny + tiny
    expect(scrollSafeChildOffsets(doubled, 10, tiny, 0)).toEqual({ ox: tiny, oy: 10 })
    expect(scrollSafeChildOffsets(10, doubled, 0, tiny)).toEqual({ ox: 10, oy: tiny })
  })

  it('keeps machine-epsilon scroll deltas finite on ox/oy (distinct from MIN_VALUE subnormals)', () => {
    const e = Number.EPSILON
    expect(scrollSafeChildOffsets(e, 5, 2 * e, 0)).toEqual({ ox: -e, oy: 5 })
    expect(scrollSafeChildOffsets(7, e, 0, 2 * e)).toEqual({ ox: 7, oy: -e })
  })

  it('returns +0 child origin when abs and scroll are the same subnormal (tiny - tiny is +0, not −0)', () => {
    const tiny = Number.MIN_VALUE
    expect(tiny - tiny).toBe(0)
    expect(Object.is(tiny - tiny, -0)).toBe(false)
    expect(scrollSafeChildOffsets(tiny, tiny, tiny, tiny)).toEqual({ ox: 0, oy: 0 })
  })

  it('returns distinct subnormal child origins when abs is a multiple of the scroll on each axis (2t − t)', () => {
    const t = Number.MIN_VALUE
    expect(2 * t - t).toBe(t)
    expect(3 * t - t).toBe(2 * t)
    expect(scrollSafeChildOffsets(2 * t, 3 * t, t, t)).toEqual({ ox: t, oy: 2 * t })
  })

  it('subtracts subnormal scroll from near-zero abs without overflow (tiny overscroll yields finite negative subnormal oy)', () => {
    const tiny = Number.MIN_VALUE
    expect(tiny - 0).toBe(tiny)
    expect(0 - tiny).toBe(-tiny)
    expect(scrollSafeChildOffsets(tiny, 0, 0, tiny)).toEqual({ ox: tiny, oy: -tiny })
    expect(scrollSafeChildOffsets(0, tiny, tiny, 0)).toEqual({ ox: -tiny, oy: tiny })
  })

  it('negative subnormal scroll increases ox at MIN_VALUE-scale abs (finiteNumberOrZero keeps negSub; not coerced to 0 scroll)', () => {
    const t = Number.MIN_VALUE
    const negSub = -t
    expect(finiteNumberOrZero(negSub)).toBe(negSub)
    const r = scrollSafeChildOffsets(8 * t, 100, negSub, 0)!
    expect(r.ox).toBe(9 * t)
    expect(r.oy).toBe(100)
  })
})

describe('finiteNumberOrZero', () => {
  it('returns finite numbers unchanged', () => {
    expect(finiteNumberOrZero(0)).toBe(0)
    expect(finiteNumberOrZero(-3.5)).toBe(-3.5)
    expect(finiteNumberOrZero(Number.MAX_VALUE)).toBe(Number.MAX_VALUE)
  })

  it('preserves subnormal and epsilon magnitudes (scroll offsets must not collapse tiny finite values)', () => {
    expect(finiteNumberOrZero(Number.MIN_VALUE)).toBe(Number.MIN_VALUE)
    expect(finiteNumberOrZero(Number.EPSILON)).toBe(Number.EPSILON)
    const sub = 1e-320
    expect(Number.isFinite(sub)).toBe(true)
    expect(finiteNumberOrZero(sub)).toBe(sub)
  })

  it('preserves negative subnormal magnitudes (paired with positive MIN_VALUE; still finite scroll deltas)', () => {
    const negSub = -Number.MIN_VALUE
    expect(negSub).toBeLessThan(0)
    expect(finiteNumberOrZero(negSub)).toBe(negSub)
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

  it('maps boolean values to 0 (typeof guard; corrupt JSON / mistaken host props)', () => {
    expect(finiteNumberOrZero(true as unknown as number)).toBe(0)
    expect(finiteNumberOrZero(false as unknown as number)).toBe(0)
  })

  it('maps double overflow (e.g. MAX_VALUE * 2) to 0 so scroll math cannot become non-finite', () => {
    expect(Number.MAX_VALUE * 2).toBe(Infinity)
    expect(finiteNumberOrZero(Number.MAX_VALUE * 2)).toBe(0)
  })

  it('maps Symbol, boxed numbers, and other objects to 0 without throwing (typeof must be number)', () => {
    const sym = Symbol('scroll') as unknown as number
    expect(() => finiteNumberOrZero(sym)).not.toThrow()
    expect(finiteNumberOrZero(sym)).toBe(0)

    expect(finiteNumberOrZero([] as unknown as number)).toBe(0)
    expect(() => finiteNumberOrZero(new ArrayBuffer(8) as unknown as number)).not.toThrow()
    expect(finiteNumberOrZero(new ArrayBuffer(8) as unknown as number)).toBe(0)

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

describe('composed scroll + inclusive rect (hit-test coordinate space)', () => {
  it('interior point hits child rect built from scroll-adjusted origin plus relative layout', () => {
    const o = scrollSafeChildOffsets(50, 80, 10, 20)!
    expect(o).toEqual({ ox: 40, oy: 60 })
    const childX = 5
    const childY = 7
    const w = 32
    const h = 18
    const midX = o.ox + childX + w / 2
    const midY = o.oy + childY + h / 2
    expect(pointInInclusiveLayoutRect(midX, midY, o.ox + childX, o.oy + childY, w, h)).toBe(true)
  })

  it('negative scroll-adjusted origin: inclusive point test stays stable when scroll exceeds abs (overscroll)', () => {
    const o = scrollSafeChildOffsets(20, 20, 100, 100)!
    expect(o).toEqual({ ox: -80, oy: -80 })
    expect(pointInInclusiveLayoutRect(o.ox + 50, o.oy + 50, o.ox, o.oy, 200, 200)).toBe(true)
    expect(pointInInclusiveLayoutRect(o.ox - 0.001, o.oy, o.ox, o.oy, 200, 200)).toBe(false)
  })

  it('null scroll offsets (abs − scroll overflow): parent inclusive rect may still hold; callers must not walk children with fake origins', () => {
    const max = Number.MAX_VALUE
    expect(max - -max).toBe(Infinity)
    expect(scrollSafeChildOffsets(max, 0, -max, 0)).toBeNull()
    // Same absolute origin the hit-test layer uses before scroll subtraction; inclusive test stays well-defined.
    expect(pointInInclusiveLayoutRect(max, 0, max, 0, 50, 50)).toBe(true)
  })

  it('scroll-adjusted origin plus child abs rect: rejects hit when absX+width overflows (mirrors hit-test child bounds)', () => {
    const o = scrollSafeChildOffsets(10, 10, 0, 0)!
    expect(o).toEqual({ ox: 10, oy: 10 })
    const relX = 1e300
    const relY = 0
    const w = Number.MAX_VALUE
    const h = 10
    const absX = o.ox + relX
    const absY = o.oy + relY
    expect(absX + w).toBe(Infinity)
    expect(pointInInclusiveLayoutRect(absX, absY, absX, absY, w, h)).toBe(false)
  })

  it('nested scroll containers: sequential scrollSafeChildOffsets matches hit-test offset chaining', () => {
    // Outer box: abs origin (0,0) with horizontal scroll — same as collectHits(abs, scroll) before walking children.
    const outer = scrollSafeChildOffsets(0, 0, 50, 0)!
    expect(outer).toEqual({ ox: -50, oy: 0 })
    // Inner box laid out at (100, 0) relative to outer content; abs = parent child origin + layout.x/y.
    const innerAbsX = outer.ox + 100
    const innerAbsY = outer.oy + 0
    expect(innerAbsX).toBe(50)
    const inner = scrollSafeChildOffsets(innerAbsX, innerAbsY, 20, 0)!
    // Inner abs 50 in root space, minus inner scroll 20 → child origin 30 (matches collectHits recursion).
    expect(inner).toEqual({ ox: 30, oy: 0 })
  })

  it('nested scroll containers: vertical outer scroll plus inner vertical scroll chains oy (same recursion pattern as horizontal)', () => {
    const outer = scrollSafeChildOffsets(0, 0, 0, 40)!
    expect(outer).toEqual({ ox: 0, oy: -40 })
    const innerAbsX = outer.ox + 0
    const innerAbsY = outer.oy + 100
    expect(innerAbsY).toBe(60)
    const inner = scrollSafeChildOffsets(innerAbsX, innerAbsY, 0, 10)!
    expect(inner).toEqual({ ox: 0, oy: 50 })
  })

  it('nested scroll containers: outer scroll on both axes then inner scroll (2D chaining matches collectHits recursion)', () => {
    const outer = scrollSafeChildOffsets(0, 0, 30, 40)!
    expect(outer).toEqual({ ox: -30, oy: -40 })
    const innerRelX = 50
    const innerRelY = 60
    const innerAbsX = outer.ox + innerRelX
    const innerAbsY = outer.oy + innerRelY
    expect(innerAbsX).toBe(20)
    expect(innerAbsY).toBe(20)
    const inner = scrollSafeChildOffsets(innerAbsX, innerAbsY, 5, 10)!
    expect(inner).toEqual({ ox: 15, oy: 10 })
  })

  it('nested scroll containers: three levels with mixed per-axis scroll (outer X, middle Y, inner X)', () => {
    // Root (0,0): horizontal scroll only — same pattern as collectHits before walking content children.
    const outer = scrollSafeChildOffsets(0, 0, 50, 0)!
    expect(outer).toEqual({ ox: -50, oy: 0 })
    // Middle laid out at (100, 0) relative to outer content.
    const middleAbsX = outer.ox + 100
    const middleAbsY = outer.oy + 0
    expect(middleAbsX).toBe(50)
    // Middle box: vertical scroll only.
    const middle = scrollSafeChildOffsets(middleAbsX, middleAbsY, 0, 20)!
    expect(middle).toEqual({ ox: 50, oy: -20 })
    // Inner laid out at (0, 100) relative to middle content.
    const innerAbsX = middle.ox + 0
    const innerAbsY = middle.oy + 100
    expect(innerAbsX).toBe(50)
    expect(innerAbsY).toBe(80)
    // Innermost: horizontal scroll only (distinct axis from each ancestor).
    const inner = scrollSafeChildOffsets(innerAbsX, innerAbsY, 5, 0)!
    expect(inner).toEqual({ ox: 45, oy: 80 })
  })
})

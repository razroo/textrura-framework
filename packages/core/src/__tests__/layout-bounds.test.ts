import { describe, it, expect } from 'vitest'
import { layoutBoundsAreFinite } from '../layout-bounds.js'

describe('layoutBoundsAreFinite', () => {
  it('accepts a normal finite rect with non-negative size', () => {
    expect(layoutBoundsAreFinite({ x: 0, y: 0, width: 100, height: 50, children: [] })).toBe(true)
    expect(layoutBoundsAreFinite({ x: -10, y: 3.5, width: 0, height: 0, children: [] })).toBe(true)
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
})

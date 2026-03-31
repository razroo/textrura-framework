import { describe, it, expect } from 'vitest'
import { box } from '../elements.js'
import { resolveDirectionValue, resolveElementDirection } from '../direction.js'

describe('direction model', () => {
  it('defaults to parent direction when dir is undefined or auto', () => {
    expect(resolveDirectionValue(undefined, 'ltr')).toBe('ltr')
    expect(resolveDirectionValue(undefined, 'rtl')).toBe('rtl')
    expect(resolveDirectionValue('auto', 'ltr')).toBe('ltr')
    expect(resolveDirectionValue('auto', 'rtl')).toBe('rtl')
  })

  it('respects explicit ltr/rtl values', () => {
    expect(resolveDirectionValue('ltr', 'rtl')).toBe('ltr')
    expect(resolveDirectionValue('rtl', 'ltr')).toBe('rtl')
  })

  it('resolves element direction from props with parent fallback', () => {
    const inherited = box({ width: 100 })
    const explicitRtl = box({ width: 100, dir: 'rtl' })
    const explicitLtr = box({ width: 100, dir: 'ltr' })
    const auto = box({ width: 100, dir: 'auto' })

    expect(resolveElementDirection(inherited, 'rtl')).toBe('rtl')
    expect(resolveElementDirection(explicitRtl, 'ltr')).toBe('rtl')
    expect(resolveElementDirection(explicitLtr, 'rtl')).toBe('ltr')
    expect(resolveElementDirection(auto, 'rtl')).toBe('rtl')
  })
})

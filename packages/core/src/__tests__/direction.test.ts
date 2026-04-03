import { describe, it, expect } from 'vitest'
import { box, image, text } from '../elements.js'
import { resolveDirectionValue, resolveElementDirection } from '../direction.js'

describe('direction model', () => {
  it('defaults to parent direction when dir is undefined or auto', () => {
    expect(resolveDirectionValue(undefined, 'ltr')).toBe('ltr')
    expect(resolveDirectionValue(undefined, 'rtl')).toBe('rtl')
    expect(resolveDirectionValue('auto', 'ltr')).toBe('ltr')
    expect(resolveDirectionValue('auto', 'rtl')).toBe('rtl')
  })

  it('treats unknown dir strings like auto (inherit parent), for runtime or serialized trees', () => {
    expect(resolveDirectionValue('' as never, 'rtl')).toBe('rtl')
    expect(resolveDirectionValue('sideways-lr' as never, 'ltr')).toBe('ltr')
    expect(resolveDirectionValue('bogus' as never, 'rtl')).toBe('rtl')
  })

  it('falls back to ltr when parentDirection is not a concrete ltr/rtl at runtime', () => {
    expect(resolveDirectionValue(undefined, 'auto' as never)).toBe('ltr')
    expect(resolveDirectionValue('auto', '' as never)).toBe('ltr')
    expect(resolveDirectionValue(undefined, 0 as never)).toBe('ltr')
    expect(resolveDirectionValue('auto', null as never)).toBe('ltr')
    // Explicit dir still wins even if parent is garbage
    expect(resolveDirectionValue('rtl', 'nope' as never)).toBe('rtl')
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

  it('resolves direction for text and image nodes the same as boxes', () => {
    const rtlText = text({ text: 'x', font: '14px Inter', lineHeight: 20, dir: 'rtl' })
    const rtlImage = image({ src: '/x.png', width: 1, height: 1, dir: 'rtl' })
    expect(resolveElementDirection(rtlText, 'ltr')).toBe('rtl')
    expect(resolveElementDirection(rtlImage, 'ltr')).toBe('rtl')
  })

  it('resolveElementDirection inherits parent for unknown dir on element props', () => {
    const weird = box({ width: 1, height: 1, dir: 'not-a-dir' as never })
    expect(resolveElementDirection(weird, 'rtl')).toBe('rtl')
  })

  it('resolveElementDirection treats invalid parent context as ltr', () => {
    const el = box({ width: 1, height: 1 })
    expect(resolveElementDirection(el, 'sideways' as never)).toBe('ltr')
  })
})

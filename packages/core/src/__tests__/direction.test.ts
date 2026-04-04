import { describe, it, expect } from 'vitest'
import { box, image, scene3d, sphere, text } from '../elements.js'
import { resolveDirectionValue, resolveElementDirection } from '../direction.js'
import { toLayoutTree } from '../tree.js'

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

  it('treats non-string dir values like auto (inherit parent) for corrupt runtime payloads', () => {
    expect(resolveDirectionValue(0 as never, 'rtl')).toBe('rtl')
    expect(resolveDirectionValue(1 as never, 'ltr')).toBe('ltr')
    expect(resolveDirectionValue(false as never, 'rtl')).toBe('rtl')
    expect(resolveDirectionValue(true as never, 'ltr')).toBe('ltr')
    expect(resolveDirectionValue(Number.NaN as never, 'rtl')).toBe('rtl')
    expect(resolveDirectionValue({} as never, 'ltr')).toBe('ltr')
    expect(resolveDirectionValue(Symbol('dir') as never, 'rtl')).toBe('rtl')
    // BigInt must not throw on strict equality checks and should inherit like other non-ltr/rtl values
    expect(resolveDirectionValue(0n as never, 'rtl')).toBe('rtl')
    expect(resolveDirectionValue(1n as never, 'ltr')).toBe('ltr')
  })

  it('treats JSON null dir like auto (inherit parent) without throwing', () => {
    expect(resolveDirectionValue(null as never, 'rtl')).toBe('rtl')
    expect(resolveDirectionValue(null as never, 'ltr')).toBe('ltr')
    const el = box({ width: 1, height: 1, dir: null as never })
    expect(resolveElementDirection(el, 'rtl')).toBe('rtl')
    expect(resolveElementDirection(el, 'ltr')).toBe('ltr')
  })

  it('treats boxed string dir like auto (strict equality only matches primitive ltr/rtl)', () => {
    expect(resolveDirectionValue(Object('rtl') as never, 'ltr')).toBe('ltr')
    expect(resolveDirectionValue(Object('ltr') as never, 'rtl')).toBe('rtl')
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

  it('resolves direction for text, image, and scene3d leaf nodes the same as boxes', () => {
    const rtlText = text({ text: 'x', font: '14px Inter', lineHeight: 20, dir: 'rtl' })
    const rtlImage = image({ src: '/x.png', width: 1, height: 1, dir: 'rtl' })
    const rtlScene = scene3d({ width: 100, height: 100, objects: [sphere({ radius: 1 })], dir: 'rtl' })
    expect(resolveElementDirection(rtlText, 'ltr')).toBe('rtl')
    expect(resolveElementDirection(rtlImage, 'ltr')).toBe('rtl')
    expect(resolveElementDirection(rtlScene, 'ltr')).toBe('rtl')
  })

  it('resolveElementDirection inherits parent for unknown dir on element props', () => {
    const weird = box({ width: 1, height: 1, dir: 'not-a-dir' as never })
    expect(resolveElementDirection(weird, 'rtl')).toBe('rtl')
  })

  it('resolveElementDirection inherits parent when dir is BigInt (corrupt props)', () => {
    const el = box({ width: 1, height: 1, dir: 2n as never })
    expect(resolveElementDirection(el, 'rtl')).toBe('rtl')
  })

  it('resolveElementDirection treats invalid parent context as ltr', () => {
    const el = box({ width: 1, height: 1 })
    expect(resolveElementDirection(el, 'sideways' as never)).toBe('ltr')
  })

  it('nested auto inherits rtl through a depth-first parent chain (selection-style walk)', () => {
    const root = box({ width: 200, height: 100, dir: 'rtl' })
    const middle = box({ width: 180, height: 80, dir: 'auto' })
    const leaf = text({ text: 'x', font: '14px Inter', lineHeight: 20, dir: 'auto' })

    let d = resolveElementDirection(root, 'ltr')
    expect(d).toBe('rtl')
    d = resolveElementDirection(middle, d)
    expect(d).toBe('rtl')
    d = resolveElementDirection(leaf, d)
    expect(d).toBe('rtl')
  })

  it('keeps dir on the live element for resolveElementDirection while toLayoutTree omits it for Textura', () => {
    const el = text({
      text: 'a',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 50,
      height: 18,
      dir: 'rtl',
    })
    expect(resolveElementDirection(el, 'ltr')).toBe('rtl')
    expect(toLayoutTree(el)).not.toHaveProperty('dir')
  })

  it('keeps dir on scene3d for resolveElementDirection while toLayoutTree omits it for Textura', () => {
    const el = scene3d({
      width: 50,
      height: 50,
      objects: [sphere({ radius: 1 })],
      dir: 'rtl',
    })
    expect(resolveElementDirection(el, 'ltr')).toBe('rtl')
    expect(toLayoutTree(el)).not.toHaveProperty('dir')
  })

  it('toLayoutTree omits dir recursively; live tree still resolves mixed rtl/auto/ltr per node', () => {
    const leaf = text({
      text: 'a',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 10,
      height: 18,
      dir: 'ltr',
    })
    const inner = box({ width: 50, height: 20, dir: 'auto' }, [leaf])
    const root = box({ width: 100, height: 100, dir: 'rtl' }, [inner])

    const layout = toLayoutTree(root) as { children: unknown[] }
    expect(layout).not.toHaveProperty('dir')
    expect(layout.children).toHaveLength(1)
    const innerLayout = layout.children[0] as { children: unknown[] }
    expect(innerLayout).not.toHaveProperty('dir')
    const textLayout = innerLayout.children[0] as Record<string, unknown>
    expect(textLayout).not.toHaveProperty('dir')

    let d = resolveElementDirection(root, 'ltr')
    expect(d).toBe('rtl')
    d = resolveElementDirection(inner, d)
    expect(d).toBe('rtl')
    d = resolveElementDirection(leaf, d)
    expect(d).toBe('ltr')
  })
})

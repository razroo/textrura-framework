import { describe, it, expect } from 'vitest'
import { box, image, scene3d, sphere, text } from '../elements.js'
import {
  resolveDirectionValue,
  resolveElementDirection,
  resolveComputeLayoutDirection,
  type ResolvedDirection,
} from '../direction.js'
import { toLayoutTree } from '../tree.js'

describe('direction model', () => {
  it('defaults to parent direction when dir is undefined or auto', () => {
    expect(resolveDirectionValue(undefined, 'ltr')).toBe('ltr')
    expect(resolveDirectionValue(undefined, 'rtl')).toBe('rtl')
    expect(resolveDirectionValue('auto', 'ltr')).toBe('ltr')
    expect(resolveDirectionValue('auto', 'rtl')).toBe('rtl')
  })

  it('uses default ltr parent when the parent argument is omitted or undefined (JS default parameters)', () => {
    expect(resolveDirectionValue('auto')).toBe('ltr')
    expect(resolveDirectionValue(undefined)).toBe('ltr')
    expect(resolveDirectionValue('auto', undefined as unknown as ResolvedDirection)).toBe('ltr')
    const autoEl = box({ width: 1, height: 1, dir: 'auto' })
    expect(resolveElementDirection(autoEl)).toBe('ltr')
    expect(resolveElementDirection(autoEl, undefined as unknown as ResolvedDirection)).toBe('ltr')
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
    expect(resolveDirectionValue(undefined, Number.NaN as never)).toBe('ltr')
    expect(resolveDirectionValue('auto', Number.POSITIVE_INFINITY as never)).toBe('ltr')
    expect(resolveDirectionValue(undefined, Number.NEGATIVE_INFINITY as never)).toBe('ltr')
    const autoEl = box({ width: 1, height: 1, dir: 'auto' })
    expect(resolveElementDirection(autoEl, Number.NaN as never)).toBe('ltr')
    expect(resolveElementDirection(autoEl, Number.POSITIVE_INFINITY as never)).toBe('ltr')
    // Explicit dir still wins even if parent is garbage
    expect(resolveDirectionValue('rtl', 'nope' as never)).toBe('rtl')
  })

  it('treats boxed String parentDirection as invalid (normalize uses strict === rtl; inherit becomes ltr)', () => {
    expect(resolveDirectionValue('auto', Object('rtl') as never)).toBe('ltr')
    expect(resolveDirectionValue(undefined, Object('rtl') as never)).toBe('ltr')
    expect(resolveDirectionValue('rtl', Object('rtl') as never)).toBe('rtl')
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

  it('keeps dir on the live element for resolveElementDirection while toLayoutTree omits it on the layout root', () => {
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

  it('keeps dir on scene3d for resolveElementDirection while toLayoutTree omits it on the layout root', () => {
    const el = scene3d({
      width: 50,
      height: 50,
      objects: [sphere({ radius: 1 })],
      dir: 'rtl',
    })
    expect(resolveElementDirection(el, 'ltr')).toBe('rtl')
    expect(toLayoutTree(el)).not.toHaveProperty('dir')
  })

  it('toLayoutTree omits dir on the root only; nested layout nodes forward dir; live tree still resolves mixed rtl/auto/ltr per node', () => {
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
    const innerLayout = layout.children[0] as { children: unknown[]; dir?: string }
    expect(innerLayout).toHaveProperty('dir', 'auto')
    const textLayout = innerLayout.children[0] as Record<string, unknown>
    expect(textLayout).toHaveProperty('dir', 'ltr')

    let d = resolveElementDirection(root, 'ltr')
    expect(d).toBe('rtl')
    d = resolveElementDirection(inner, d)
    expect(d).toBe('rtl')
    d = resolveElementDirection(leaf, d)
    expect(d).toBe('ltr')
  })
})

describe('resolveComputeLayoutDirection', () => {
  it('uses explicit ltr/rtl when the host option is a primitive string', () => {
    const rtlRoot = box({ width: 1, height: 1, flexDirection: 'row', dir: 'rtl' }, [])
    expect(resolveComputeLayoutDirection('ltr', rtlRoot)).toBe('ltr')
    expect(resolveComputeLayoutDirection('rtl', box({ width: 1, height: 1 }, []))).toBe('rtl')
  })

  it('derives from the root element when the option is omitted', () => {
    const rtlRoot = box({ width: 1, height: 1, dir: 'rtl' })
    expect(resolveComputeLayoutDirection(undefined, rtlRoot)).toBe('rtl')
  })

  it('defaults to ltr when the option is omitted and the root box has no dir (document default)', () => {
    const plainRoot = box({ width: 1, height: 1 })
    expect(resolveComputeLayoutDirection(undefined, plainRoot)).toBe('ltr')
  })

  it('ignores auto and other non-ltr/rtl host values like createApp (root dir wins)', () => {
    const rtlRoot = box({ width: 1, height: 1, flexDirection: 'row', dir: 'rtl' }, [])
    expect(resolveComputeLayoutDirection('auto' as never, rtlRoot)).toBe('rtl')
    expect(resolveComputeLayoutDirection('sideways-lr' as never, rtlRoot)).toBe('rtl')
    expect(resolveComputeLayoutDirection(0 as never, rtlRoot)).toBe('rtl')
    expect(resolveComputeLayoutDirection(null as never, rtlRoot)).toBe('rtl')
    expect(resolveComputeLayoutDirection('' as never, rtlRoot)).toBe('rtl')
  })

  it('ignores object, array, and boolean host layoutDirection (strict primitive check only), deriving from the root', () => {
    const rtlRoot = box({ width: 1, height: 1, flexDirection: 'row', dir: 'rtl' }, [])
    expect(resolveComputeLayoutDirection({} as never, rtlRoot)).toBe('rtl')
    expect(resolveComputeLayoutDirection([] as never, rtlRoot)).toBe('rtl')
    expect(resolveComputeLayoutDirection(false as never, rtlRoot)).toBe('rtl')
    expect(resolveComputeLayoutDirection(true as never, rtlRoot)).toBe('rtl')
    const ltrRoot = box({ width: 1, height: 1, flexDirection: 'row', dir: 'ltr' }, [])
    expect(resolveComputeLayoutDirection({ v: 'rtl' } as never, ltrRoot)).toBe('ltr')
    expect(resolveComputeLayoutDirection([ 'rtl' ] as never, ltrRoot)).toBe('ltr')
  })

  it('ignores trimmed or wrong-case rtl/ltr strings (strict equality; parity with Textura ComputeOptions.direction)', () => {
    const rtlRoot = box({ width: 1, height: 1, flexDirection: 'row', dir: 'rtl' }, [])
    const ltrRoot = box({ width: 1, height: 1, flexDirection: 'row', dir: 'ltr' }, [])
    expect(resolveComputeLayoutDirection('rtl ' as never, ltrRoot)).toBe('ltr')
    expect(resolveComputeLayoutDirection('RTL' as never, ltrRoot)).toBe('ltr')
    expect(resolveComputeLayoutDirection('ltr ' as never, rtlRoot)).toBe('rtl')
    expect(resolveComputeLayoutDirection('LTR' as never, rtlRoot)).toBe('rtl')
  })

  it('ignores boxed-string ltr/rtl (strict equality only), deriving from the root', () => {
    const rtlRoot = box({ width: 1, height: 1, dir: 'rtl' })
    expect(resolveComputeLayoutDirection(Object('rtl') as never, rtlRoot)).toBe('rtl')
    const ltrRoot = box({ width: 1, height: 1, dir: 'ltr' })
    expect(resolveComputeLayoutDirection(Object('ltr') as never, ltrRoot)).toBe('ltr')
  })

  it('does not coerce boxed-string host overrides: direction comes from root, not Object("rtl"|"ltr")', () => {
    const ltrRoot = box({ width: 1, height: 1, dir: 'ltr' })
    expect(resolveComputeLayoutDirection(Object('rtl') as never, ltrRoot)).toBe('ltr')
    const rtlRoot = box({ width: 1, height: 1, dir: 'rtl' })
    expect(resolveComputeLayoutDirection(Object('ltr') as never, rtlRoot)).toBe('rtl')
  })

  it('ignores Symbol host values (only primitive ltr/rtl strings win), deriving from the root', () => {
    const rtlRoot = box({ width: 1, height: 1, dir: 'rtl' })
    expect(resolveComputeLayoutDirection(Symbol('rtl') as never, rtlRoot)).toBe('rtl')
    const ltrRoot = box({ width: 1, height: 1, dir: 'ltr' })
    expect(resolveComputeLayoutDirection(Symbol('ltr') as never, ltrRoot)).toBe('ltr')
  })

  it('ignores BigInt host layoutDirection (derive from root), without throwing', () => {
    const rtlRoot = box({ width: 1, height: 1, dir: 'rtl' })
    expect(resolveComputeLayoutDirection(0n as never, rtlRoot)).toBe('rtl')
    expect(resolveComputeLayoutDirection(1n as never, rtlRoot)).toBe('rtl')
    const ltrRoot = box({ width: 1, height: 1, dir: 'ltr' })
    expect(resolveComputeLayoutDirection(0n as never, ltrRoot)).toBe('ltr')
  })

  it('uses document-default ltr parent when root dir is auto and host override is invalid', () => {
    const autoRoot = box({ width: 1, height: 1, dir: 'auto' })
    expect(resolveComputeLayoutDirection(undefined, autoRoot)).toBe('ltr')
    expect(resolveComputeLayoutDirection('auto' as never, autoRoot)).toBe('ltr')
    expect(resolveComputeLayoutDirection(0 as never, autoRoot)).toBe('ltr')
  })

  it('derives ltr from corrupt root dir when host override is invalid (parity with nested bogus dir in Textura)', () => {
    const bogusRoot = box({ width: 1, height: 1, dir: 'bogus' as never })
    expect(resolveComputeLayoutDirection(undefined, bogusRoot)).toBe('ltr')
    expect(resolveComputeLayoutDirection('auto' as never, bogusRoot)).toBe('ltr')
    expect(resolveComputeLayoutDirection(null as never, bogusRoot)).toBe('ltr')
  })

  it('derives ltr from JSON null root dir when host override is invalid (loose deserialization)', () => {
    const nullDirRoot = box({ width: 1, height: 1, dir: null as never })
    expect(resolveComputeLayoutDirection(undefined, nullDirRoot)).toBe('ltr')
    expect(resolveComputeLayoutDirection('auto' as never, nullDirRoot)).toBe('ltr')
    expect(resolveComputeLayoutDirection(null as never, nullDirRoot)).toBe('ltr')
    expect(resolveComputeLayoutDirection('rtl', nullDirRoot)).toBe('rtl')
    expect(resolveComputeLayoutDirection('ltr', nullDirRoot)).toBe('ltr')
  })

  it('host primitive ltr/rtl overrides corrupt root dir (invalid root does not block layoutDirection)', () => {
    const bogusRoot = box({ width: 1, height: 1, dir: 'bogus' as never })
    expect(resolveComputeLayoutDirection('rtl', bogusRoot)).toBe('rtl')
    expect(resolveComputeLayoutDirection('ltr', bogusRoot)).toBe('ltr')
  })

  it('derives direction from non-box roots (text, image, scene3d) when the host override is invalid', () => {
    const rtlText = text({
      text: 'x',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 10,
      height: 20,
      dir: 'rtl',
    })
    expect(resolveComputeLayoutDirection(undefined, rtlText)).toBe('rtl')
    expect(resolveComputeLayoutDirection('auto' as never, rtlText)).toBe('rtl')

    const autoText = text({
      text: 'x',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 10,
      height: 20,
      dir: 'auto',
    })
    expect(resolveComputeLayoutDirection(undefined, autoText)).toBe('ltr')

    const rtlImage = image({ src: 'a.png', width: 8, height: 8, dir: 'rtl' })
    expect(resolveComputeLayoutDirection(undefined, rtlImage)).toBe('rtl')

    const rtlScene = scene3d({
      width: 16,
      height: 16,
      objects: [],
      dir: 'rtl',
    })
    expect(resolveComputeLayoutDirection(undefined, rtlScene)).toBe('rtl')
  })

  it('derives ltr from corrupt dir on non-box roots when host override is invalid (parity with bogus box root)', () => {
    const bogusText = text({
      text: 'x',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 10,
      height: 20,
      dir: 'bogus' as never,
    })
    expect(resolveComputeLayoutDirection(undefined, bogusText)).toBe('ltr')
    expect(resolveComputeLayoutDirection('auto' as never, bogusText)).toBe('ltr')

    const bogusImage = image({ src: 'a.png', width: 8, height: 8, dir: 'nope' as never })
    expect(resolveComputeLayoutDirection(undefined, bogusImage)).toBe('ltr')

    const bogusScene = scene3d({
      width: 16,
      height: 16,
      objects: [],
      dir: '???' as never,
    })
    expect(resolveComputeLayoutDirection(undefined, bogusScene)).toBe('ltr')
  })

  it('host primitive ltr/rtl overrides non-box root dir', () => {
    const rtlText = text({
      text: 'x',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 10,
      height: 20,
      dir: 'rtl',
    })
    expect(resolveComputeLayoutDirection('ltr', rtlText)).toBe('ltr')

    const ltrText = text({
      text: 'x',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 10,
      height: 20,
      dir: 'ltr',
    })
    expect(resolveComputeLayoutDirection('rtl', ltrText)).toBe('rtl')
  })
})

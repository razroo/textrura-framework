import { describe, it, expect } from 'vitest'
import {
  ambientLight,
  box,
  directionalLight,
  group,
  image,
  line,
  points,
  ring,
  scene3d,
  sphere,
  text,
} from '../elements.js'

describe('box', () => {
  it('moves pointer, keyboard, and composition handlers off props onto handlers', () => {
    const noop = () => {}
    const el = box({
      width: 10,
      height: 10,
      onClick: noop,
      onPointerDown: noop,
      onPointerUp: noop,
      onPointerMove: noop,
      onWheel: noop,
      onKeyDown: noop,
      onKeyUp: noop,
      onCompositionStart: noop,
      onCompositionUpdate: noop,
      onCompositionEnd: noop,
    })
    expect(el.handlers).toEqual({
      onClick: noop,
      onPointerDown: noop,
      onPointerUp: noop,
      onPointerMove: noop,
      onWheel: noop,
      onKeyDown: noop,
      onKeyUp: noop,
      onCompositionStart: noop,
      onCompositionUpdate: noop,
      onCompositionEnd: noop,
    })
    const p = el.props as Record<string, unknown>
    expect(p.onClick).toBeUndefined()
    expect(p.onPointerDown).toBeUndefined()
    expect(p.onCompositionEnd).toBeUndefined()
    expect(p.width).toBe(10)
    expect(p.height).toBe(10)
  })

  it('omits handlers when no event props are provided', () => {
    const el = box({ width: 1, height: 1 })
    expect(el.handlers).toBeUndefined()
  })

  it('preserves key and semantic alongside layout props', () => {
    const el = box(
      { width: 2, height: 2, key: 'k1', semantic: { role: 'button' } },
      [],
    )
    expect(el.key).toBe('k1')
    expect(el.semantic).toEqual({ role: 'button' })
    expect((el.props as Record<string, unknown>).key).toBeUndefined()
    expect((el.props as Record<string, unknown>).semantic).toBeUndefined()
  })

  it('defaults children to an empty array', () => {
    expect(box({ width: 1, height: 1 }).children).toEqual([])
  })

  it('preserves dir on props for runtime direction resolution (toLayoutTree strips dir from Yoga input)', () => {
    const el = box({ width: 1, height: 1, dir: 'rtl' })
    expect((el.props as { dir?: string }).dir).toBe('rtl')
  })

  it('preserves dir auto on props (inherits resolved direction from parent context)', () => {
    const el = box({ width: 1, height: 1, dir: 'auto' })
    expect((el.props as { dir?: string }).dir).toBe('auto')
  })

  it('preserves pointer/hit and scroll style props on props (layout snapshot strips them for Yoga)', () => {
    const el = box({
      width: 1,
      height: 1,
      cursor: 'pointer',
      pointerEvents: 'none',
      zIndex: 2,
      overflow: 'hidden',
      scrollX: 3,
      scrollY: 4,
    })
    const p = el.props as Record<string, unknown>
    expect(p.cursor).toBe('pointer')
    expect(p.pointerEvents).toBe('none')
    expect(p.zIndex).toBe(2)
    expect(p.overflow).toBe('hidden')
    expect(p.scrollX).toBe(3)
    expect(p.scrollY).toBe(4)
  })
})

describe('text', () => {
  it('keeps text layout props on props and lifts key and semantic', () => {
    const el = text({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
      key: 't1',
      semantic: { role: 'paragraph' },
    })
    expect(el.kind).toBe('text')
    expect(el.key).toBe('t1')
    expect(el.semantic).toEqual({ role: 'paragraph' })
    expect(el.props).toMatchObject({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
    })
    expect((el.props as Record<string, unknown>).key).toBeUndefined()
    expect((el.props as Record<string, unknown>).semantic).toBeUndefined()
  })

  it('preserves dir on props for runtime direction resolution (toLayoutTree strips dir from Yoga input)', () => {
    const el = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      dir: 'ltr',
    })
    expect((el.props as { dir?: string }).dir).toBe('ltr')
  })

  it('preserves dir auto on props (inherits resolved direction from parent context)', () => {
    const el = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      dir: 'auto',
    })
    expect((el.props as { dir?: string }).dir).toBe('auto')
  })

  it('preserves cursor and selectable on props for renderers and pointer metadata', () => {
    const el = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      cursor: 'text',
      selectable: true,
    })
    expect((el.props as { cursor?: string }).cursor).toBe('text')
    expect((el.props as { selectable?: boolean }).selectable).toBe(true)
  })
})

describe('image', () => {
  it('keeps src and layout props on props and lifts key and semantic', () => {
    const el = image({
      src: '/a.png',
      width: 32,
      height: 32,
      alt: 'A',
      key: 'i1',
      semantic: { role: 'img' },
    })
    expect(el.kind).toBe('image')
    expect(el.key).toBe('i1')
    expect(el.semantic).toEqual({ role: 'img' })
    expect(el.props).toMatchObject({
      src: '/a.png',
      width: 32,
      height: 32,
      alt: 'A',
    })
    expect((el.props as Record<string, unknown>).key).toBeUndefined()
    expect((el.props as Record<string, unknown>).semantic).toBeUndefined()
  })

  it('preserves dir on props for runtime direction resolution (toLayoutTree strips dir from Yoga input)', () => {
    const el = image({ src: '/a.png', width: 8, height: 8, dir: 'rtl' })
    expect((el.props as { dir?: string }).dir).toBe('rtl')
  })

  it('preserves dir auto on props (inherits resolved direction from parent context)', () => {
    const el = image({ src: '/a.png', width: 8, height: 8, dir: 'auto' })
    expect((el.props as { dir?: string }).dir).toBe('auto')
  })

  it('preserves objectFit on props for renderers', () => {
    const el = image({ src: '/a.png', width: 8, height: 8, objectFit: 'cover' })
    expect((el.props as { objectFit?: string }).objectFit).toBe('cover')
  })

  it('preserves pointer style props on props for hit-test and paint', () => {
    const el = image({
      src: '/a.png',
      width: 8,
      height: 8,
      cursor: 'crosshair',
      pointerEvents: 'auto',
    })
    const p = el.props as Record<string, unknown>
    expect(p.cursor).toBe('crosshair')
    expect(p.pointerEvents).toBe('auto')
  })
})

describe('scene3d', () => {
  it('lifts key and semantic; keeps layout and scene props on props', () => {
    const objects = [sphere({ radius: 1, color: 0xff0000 }), ambientLight({ intensity: 0.4 })]
    const el = scene3d({
      width: 200,
      height: 120,
      background: 0x111111,
      objects,
      fov: 45,
      near: 0.05,
      far: 500,
      cameraPosition: [0, 2, 5],
      cameraTarget: [0, 0, 0],
      orbitControls: { damping: 0.08 },
      maxPixelRatio: 2,
      key: 's1',
      semantic: { role: 'img', ariaLabel: 'preview' },
    })
    expect(el.kind).toBe('scene3d')
    expect(el.key).toBe('s1')
    expect(el.semantic).toEqual({ role: 'img', ariaLabel: 'preview' })
    expect(el.props).toMatchObject({
      width: 200,
      height: 120,
      background: 0x111111,
      objects,
      fov: 45,
      near: 0.05,
      far: 500,
      cameraPosition: [0, 2, 5],
      cameraTarget: [0, 0, 0],
      orbitControls: { damping: 0.08 },
      maxPixelRatio: 2,
    })
    expect((el.props as Record<string, unknown>).key).toBeUndefined()
    expect((el.props as Record<string, unknown>).semantic).toBeUndefined()
  })

  it('preserves dir on props for runtime direction resolution', () => {
    const el = scene3d({
      width: 100,
      height: 80,
      dir: 'rtl',
      objects: [],
    })
    expect((el.props as { dir?: string }).dir).toBe('rtl')
  })

  it('preserves pointer style props on props for hit-test and cursor resolution', () => {
    const el = scene3d({
      width: 48,
      height: 48,
      objects: [],
      cursor: 'grab',
      pointerEvents: 'none',
    })
    const p = el.props as Record<string, unknown>
    expect(p.cursor).toBe('grab')
    expect(p.pointerEvents).toBe('none')
  })
})

describe('scene3d object helpers', () => {
  it('tags each factory with the expected discriminant', () => {
    expect(sphere({ radius: 2 })).toEqual({ type: 'sphere', radius: 2 })
    expect(points({ positions: [0, 1, 2] })).toEqual({ type: 'points', positions: [0, 1, 2] })
    expect(
      line({
        points: [
          [0, 0, 0],
          [1, 0, 0],
        ],
      }),
    ).toEqual({
      type: 'line',
      points: [
        [0, 0, 0],
        [1, 0, 0],
      ],
    })
    expect(ring({ innerRadius: 0.5, outerRadius: 1 })).toEqual({
      type: 'ring',
      innerRadius: 0.5,
      outerRadius: 1,
    })
    expect(ambientLight({ color: 0xffffff })).toEqual({ type: 'ambientLight', color: 0xffffff })
    expect(ambientLight()).toEqual({ type: 'ambientLight' })
    expect(directionalLight({ intensity: 0.7 })).toEqual({ type: 'directionalLight', intensity: 0.7 })
    expect(group({ objects: [sphere({ radius: 1 })] })).toEqual({
      type: 'group',
      objects: [{ type: 'sphere', radius: 1 }],
    })
  })
})

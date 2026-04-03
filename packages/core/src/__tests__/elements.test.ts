import { describe, it, expect } from 'vitest'
import { box, text, image } from '../elements.js'

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

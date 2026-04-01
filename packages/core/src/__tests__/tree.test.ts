import { describe, it, expect } from 'vitest'
import { toLayoutTree } from '../tree.js'
import { box, text, image } from '../elements.js'

type BoxLayoutNode = ReturnType<typeof toLayoutTree> & { children: Array<Record<string, unknown>> }

describe('toLayoutTree', () => {
  it('strips backgroundColor, color, borderColor, borderRadius, borderWidth, opacity from box', () => {
    const el = box({
      width: 100,
      height: 50,
      backgroundColor: '#fff',
      color: '#000',
      borderColor: '#ccc',
      borderRadius: 8,
      borderWidth: 1,
      opacity: 0.5,
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).toHaveProperty('height', 50)
    expect(layout).not.toHaveProperty('backgroundColor')
    expect(layout).not.toHaveProperty('color')
    expect(layout).not.toHaveProperty('borderColor')
    expect(layout).not.toHaveProperty('borderRadius')
    expect(layout).not.toHaveProperty('borderWidth')
    expect(layout).not.toHaveProperty('opacity')
  })

  it('strips selectable from text', () => {
    const el = text({
      text: 'Hello',
      font: '14px sans-serif',
      lineHeight: 18,
      selectable: true,
      width: 100,
      height: 18,
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('selectable')
  })

  it('strips paint and hit-target style props from text leaves (same strip list as boxes)', () => {
    const el = text({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 40,
      height: 18,
      color: '#333',
      backgroundColor: '#eee',
      borderColor: '#ccc',
      borderRadius: 2,
      borderWidth: 1,
      opacity: 0.9,
      cursor: 'text',
      pointerEvents: 'none',
      zIndex: 3,
      overflow: 'hidden',
      scrollX: 1,
      scrollY: 2,
      boxShadow: { offsetX: 0, offsetY: 1, blur: 2, color: '#000' },
      gradient: { type: 'linear', stops: [{ offset: 0, color: '#fff' }] },
      dir: 'rtl',
    })
    const layout = toLayoutTree(el)
    expect(layout).toMatchObject({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 40,
      height: 18,
    })
    for (const k of [
      'color',
      'backgroundColor',
      'borderColor',
      'borderRadius',
      'borderWidth',
      'opacity',
      'cursor',
      'pointerEvents',
      'zIndex',
      'overflow',
      'scrollX',
      'scrollY',
      'boxShadow',
      'gradient',
      'dir',
    ] as const) {
      expect(layout).not.toHaveProperty(k)
    }
  })

  it('preserves flexDirection, padding, gap', () => {
    const el = box({
      width: 200,
      height: 200,
      flexDirection: 'row',
      padding: 10,
      gap: 8,
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('flexDirection', 'row')
    expect(layout).toHaveProperty('padding', 10)
    expect(layout).toHaveProperty('gap', 8)
  })

  it('strips src, alt, objectFit from image', () => {
    const el = image({
      src: 'https://example.com/img.png',
      alt: 'An image',
      objectFit: 'cover',
      width: 100,
      height: 100,
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('src')
    expect(layout).not.toHaveProperty('alt')
    expect(layout).not.toHaveProperty('objectFit')
  })

  it('recurses children', () => {
    const el = box({ width: 200, height: 200 }, [
      box({ width: 100, height: 100, backgroundColor: '#f00' }),
      text({ text: 'Hi', font: '14px sans-serif', lineHeight: 18, width: 50, height: 18 }),
    ])
    const layout = toLayoutTree(el) as BoxLayoutNode
    expect(layout.children).toHaveLength(2)
    expect(layout.children[0]).not.toHaveProperty('backgroundColor')
    expect(layout.children[0]).toHaveProperty('width', 100)
  })

  it('strips cursor, pointerEvents, zIndex, overflow, scrollX, scrollY, boxShadow, gradient', () => {
    const el = box({
      width: 100,
      height: 100,
      cursor: 'pointer',
      pointerEvents: 'none',
      zIndex: 5,
      overflow: 'hidden',
      scrollX: 10,
      scrollY: 20,
      boxShadow: { offsetX: 0, offsetY: 2, blur: 4, color: 'rgba(0,0,0,0.2)' },
      gradient: { type: 'linear', stops: [{ offset: 0, color: 'red' }, { offset: 1, color: 'blue' }] },
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('cursor')
    expect(layout).not.toHaveProperty('pointerEvents')
    expect(layout).not.toHaveProperty('zIndex')
    expect(layout).not.toHaveProperty('overflow')
    expect(layout).not.toHaveProperty('scrollX')
    expect(layout).not.toHaveProperty('scrollY')
    expect(layout).not.toHaveProperty('boxShadow')
    expect(layout).not.toHaveProperty('gradient')
  })

  it('strips dir from layout props', () => {
    const el = box({
      width: 100,
      height: 100,
      dir: 'rtl',
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('dir')
  })
})

import { describe, it, expect } from 'vitest'
import { toLayoutTree } from '../tree.js'
import { box, text, image } from '../elements.js'

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
    const layout = toLayoutTree(el) as any
    expect(layout.children).toHaveLength(2)
    expect(layout.children[0]).not.toHaveProperty('backgroundColor')
    expect(layout.children[0]).toHaveProperty('width', 100)
  })

  it('strips cursor, zIndex, overflow, scrollX, scrollY, boxShadow, gradient', () => {
    const el = box({
      width: 100,
      height: 100,
      cursor: 'pointer',
      zIndex: 5,
      overflow: 'hidden',
      scrollX: 10,
      scrollY: 20,
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      gradient: 'linear-gradient(red, blue)',
    } as any)
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('cursor')
    expect(layout).not.toHaveProperty('zIndex')
    expect(layout).not.toHaveProperty('overflow')
    expect(layout).not.toHaveProperty('scrollX')
    expect(layout).not.toHaveProperty('scrollY')
    expect(layout).not.toHaveProperty('boxShadow')
    expect(layout).not.toHaveProperty('gradient')
  })
})

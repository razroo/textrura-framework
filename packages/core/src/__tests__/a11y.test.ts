import { describe, it, expect } from 'vitest'
import { box, image, text } from '../elements.js'
import { toAccessibilityTree } from '../a11y.js'

describe('toAccessibilityTree', () => {
  it('infers roles and names from semantic/text/image props', () => {
    const tree = box({ semantic: { tag: 'main' } }, [
      text({ text: 'Hello world', font: 'bold 20px Inter', lineHeight: 24, semantic: { tag: 'h2' } }),
      image({ src: '/hero.png', alt: 'Hero image' }),
    ])
    const layout = {
      x: 0, y: 0, width: 300, height: 120,
      children: [
        { x: 0, y: 0, width: 300, height: 30, children: [] },
        { x: 0, y: 40, width: 80, height: 80, children: [] },
      ],
    }

    const a11y = toAccessibilityTree(tree, layout)
    expect(a11y.role).toBe('main')
    expect(a11y.children[0]?.role).toBe('heading')
    expect(a11y.children[0]?.name).toBe('Hello world')
    expect(a11y.children[1]?.role).toBe('img')
    expect(a11y.children[1]?.name).toBe('Hero image')
  })

  it('marks interactive boxes as focusable buttons by default', () => {
    const tree = box({}, [
      box({ onClick: () => undefined, width: 80, height: 30 }, [
        text({ text: 'Save', font: '14px Inter', lineHeight: 18 }),
      ]),
    ])
    const layout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [
        {
          x: 10, y: 20, width: 80, height: 30,
          children: [{ x: 0, y: 0, width: 80, height: 18, children: [] }],
        },
      ],
    }

    const a11y = toAccessibilityTree(tree, layout)
    expect(a11y.children[0]?.role).toBe('button')
    expect(a11y.children[0]?.focusable).toBe(true)
  })

  it('applies scroll offsets to child geometry', () => {
    const tree = box({ scrollX: 10, scrollY: 20 }, [
      text({ text: 'Item', font: '14px Inter', lineHeight: 18 }),
    ])
    const layout = {
      x: 50, y: 60, width: 200, height: 100,
      children: [{ x: 15, y: 8, width: 40, height: 18, children: [] }],
    }

    const a11y = toAccessibilityTree(tree, layout)
    expect(a11y.children[0]?.bounds.x).toBe(55)
    expect(a11y.children[0]?.bounds.y).toBe(48)
  })
})


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

  it('maps common semantic tags for nav/list/form patterns', () => {
    const tree = box({ semantic: { tag: 'main' } }, [
      box({ semantic: { tag: 'nav' } }, [
        box({ semantic: { tag: 'ul' } }, [
          box({ semantic: { tag: 'li' } }, [text({ text: 'Home', font: '12px Inter', lineHeight: 16 })]),
        ]),
      ]),
      box({ semantic: { tag: 'form' } }, [
        box({ semantic: { tag: 'label', ariaLabel: 'Email label' } }, []),
        box({ semantic: { tag: 'input', ariaLabel: 'Email input' } }, []),
        box({ semantic: { tag: 'button' }, onClick: () => undefined }, [
          text({ text: 'Submit', font: '12px Inter', lineHeight: 16 }),
        ]),
      ]),
    ])

    const layout = {
      x: 0, y: 0, width: 400, height: 240,
      children: [
        {
          x: 0, y: 0, width: 400, height: 100,
          children: [
            {
              x: 0, y: 0, width: 400, height: 100,
              children: [
                {
                  x: 0, y: 0, width: 400, height: 24,
                  children: [{ x: 0, y: 0, width: 60, height: 16, children: [] }],
                },
              ],
            },
          ],
        },
        {
          x: 0, y: 120, width: 400, height: 120,
          children: [
            { x: 0, y: 0, width: 120, height: 20, children: [] },
            { x: 0, y: 24, width: 220, height: 24, children: [] },
            { x: 0, y: 56, width: 100, height: 24, children: [{ x: 0, y: 0, width: 100, height: 16, children: [] }] },
          ],
        },
      ],
    }

    const a11y = toAccessibilityTree(tree, layout)
    const nav = a11y.children[0]!
    const list = nav.children[0]!
    const listItem = list.children[0]!
    const form = a11y.children[1]!
    const label = form.children[0]!
    const input = form.children[1]!
    const submit = form.children[2]!

    expect(nav.role).toBe('navigation')
    expect(list.role).toBe('list')
    expect(listItem.role).toBe('listitem')
    expect(form.role).toBe('form')
    expect(label.role).toBe('label')
    expect(label.name).toBe('Email label')
    expect(input.role).toBe('textbox')
    expect(input.name).toBe('Email input')
    expect(submit.role).toBe('button')
    expect(submit.focusable).toBe(true)
  })
})


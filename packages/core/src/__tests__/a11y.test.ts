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

  it('marks composition-only boxes as focusable (parity with Tab order and click-to-focus)', () => {
    const tree = box({}, [
      box(
        {
          width: 120,
          height: 28,
          onCompositionStart: () => undefined,
        },
        [text({ text: 'IME field', font: '14px Inter', lineHeight: 18 })],
      ),
    ])
    const layout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        {
          x: 8,
          y: 10,
          width: 120,
          height: 28,
          children: [{ x: 0, y: 0, width: 120, height: 18, children: [] }],
        },
      ],
    }
    const a11y = toAccessibilityTree(tree, layout)
    expect(a11y.children[0]?.focusable).toBe(true)
  })

  it('marks composition-update-only and composition-end-only boxes as focusable (hasFocusCandidateHandlers parity)', () => {
    const tree = box({}, [
      box(
        { width: 80, height: 24, onCompositionUpdate: () => undefined },
        [text({ text: 'Update', font: '14px Inter', lineHeight: 18 })],
      ),
      box(
        { width: 80, height: 24, onCompositionEnd: () => undefined },
        [text({ text: 'End', font: '14px Inter', lineHeight: 18 })],
      ),
    ])
    const layout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        {
          x: 8,
          y: 10,
          width: 80,
          height: 24,
          children: [{ x: 0, y: 0, width: 80, height: 18, children: [] }],
        },
        {
          x: 8,
          y: 44,
          width: 80,
          height: 24,
          children: [{ x: 0, y: 0, width: 80, height: 18, children: [] }],
        },
      ],
    }
    const a11y = toAccessibilityTree(tree, layout)
    expect(a11y.children[0]?.focusable).toBe(true)
    expect(a11y.children[1]?.focusable).toBe(true)
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

  it('ignores non-finite scroll offsets so child bounds stay finite (matches zero scroll)', () => {
    const tree = box(
      { scrollX: Number.NaN, scrollY: Number.POSITIVE_INFINITY },
      [text({ text: 'Item', font: '14px Inter', lineHeight: 18 })],
    )
    const layout = {
      x: 50,
      y: 60,
      width: 200,
      height: 100,
      children: [{ x: 15, y: 8, width: 40, height: 18, children: [] }],
    }

    const a11y = toAccessibilityTree(tree, layout)
    expect(a11y.children[0]?.bounds.x).toBe(65)
    expect(a11y.children[0]?.bounds.y).toBe(68)
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

  it('maps aria state attributes to accessibility node state', () => {
    const tree = box({}, [
      box({ semantic: { tag: 'button', ariaDisabled: true, ariaExpanded: false } }, []),
      box({ semantic: { tag: 'li', ariaSelected: true } }, []),
    ])
    const layout = {
      x: 0, y: 0, width: 200, height: 80,
      children: [
        { x: 0, y: 0, width: 100, height: 30, children: [] },
        { x: 0, y: 40, width: 100, height: 30, children: [] },
      ],
    }

    const a11y = toAccessibilityTree(tree, layout)
    expect(a11y.children[0]?.state).toEqual({ disabled: true, expanded: false })
    expect(a11y.children[1]?.state).toEqual({ selected: true })
  })

  it('matches accessibility snapshot for dashboard-like template', () => {
    const tree = box({ semantic: { tag: 'main' } }, [
      text({ text: 'Overview', font: 'bold 24px Inter', lineHeight: 30, semantic: { tag: 'h1' } }),
      box({ semantic: { tag: 'section', ariaLabel: 'Stats' } }, [
        box({ semantic: { tag: 'button', ariaLabel: 'Refresh' }, onClick: () => undefined }, []),
      ]),
    ])
    const layout = {
      x: 0, y: 0, width: 320, height: 140,
      children: [
        { x: 0, y: 0, width: 320, height: 30, children: [] },
        {
          x: 0, y: 40, width: 320, height: 100,
          children: [{ x: 0, y: 0, width: 90, height: 30, children: [] }],
        },
      ],
    }
    expect(toAccessibilityTree(tree, layout)).toMatchInlineSnapshot(`
      {
        "bounds": {
          "height": 140,
          "width": 320,
          "x": 0,
          "y": 0,
        },
        "children": [
          {
            "bounds": {
              "height": 30,
              "width": 320,
              "x": 0,
              "y": 0,
            },
            "children": [],
            "focusable": false,
            "name": "Overview",
            "path": [
              0,
            ],
            "role": "heading",
          },
          {
            "bounds": {
              "height": 100,
              "width": 320,
              "x": 0,
              "y": 40,
            },
            "children": [
              {
                "bounds": {
                  "height": 30,
                  "width": 90,
                  "x": 0,
                  "y": 40,
                },
                "children": [],
                "focusable": true,
                "name": "Refresh",
                "path": [
                  1,
                  0,
                ],
                "role": "button",
              },
            ],
            "focusable": false,
            "name": "Stats",
            "path": [
              1,
            ],
            "role": "region",
          },
        ],
        "focusable": false,
        "path": [],
        "role": "main",
      }
    `)
  })

  it('matches accessibility snapshot for form template', () => {
    const tree = box({ semantic: { tag: 'form', ariaLabel: 'Checkout form' } }, [
      box({ semantic: { tag: 'label', ariaLabel: 'Address label' } }, []),
      box({ semantic: { tag: 'input', ariaLabel: 'Address input', ariaDisabled: false } }, []),
      box({ semantic: { tag: 'button', ariaLabel: 'Submit order' }, onClick: () => undefined }, []),
    ])
    const layout = {
      x: 0, y: 0, width: 300, height: 120,
      children: [
        { x: 0, y: 0, width: 120, height: 20, children: [] },
        { x: 0, y: 26, width: 240, height: 24, children: [] },
        { x: 0, y: 60, width: 120, height: 30, children: [] },
      ],
    }
    expect(toAccessibilityTree(tree, layout)).toMatchInlineSnapshot(`
      {
        "bounds": {
          "height": 120,
          "width": 300,
          "x": 0,
          "y": 0,
        },
        "children": [
          {
            "bounds": {
              "height": 20,
              "width": 120,
              "x": 0,
              "y": 0,
            },
            "children": [],
            "focusable": false,
            "name": "Address label",
            "path": [
              0,
            ],
            "role": "label",
          },
          {
            "bounds": {
              "height": 24,
              "width": 240,
              "x": 0,
              "y": 26,
            },
            "children": [],
            "focusable": false,
            "name": "Address input",
            "path": [
              1,
            ],
            "role": "textbox",
            "state": {
              "disabled": false,
            },
          },
          {
            "bounds": {
              "height": 30,
              "width": 120,
              "x": 0,
              "y": 60,
            },
            "children": [],
            "focusable": true,
            "name": "Submit order",
            "path": [
              2,
            ],
            "role": "button",
          },
        ],
        "focusable": false,
        "name": "Checkout form",
        "path": [],
        "role": "form",
      }
    `)
  })
})


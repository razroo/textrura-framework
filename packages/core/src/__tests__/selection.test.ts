import { describe, it, expect } from 'vitest'
import type { ComputedLayout } from 'textura'
import { findInTextNodes } from '../find.js'
import { collectTextNodes, getSelectedText, hitTestText } from '../selection.js'
import type { TextNodeInfo } from '../selection.js'
import { box, image, scene3d, sphere, text } from '../elements.js'

describe('collectTextNodes', () => {
  it('collects text elements (selectable by default)', () => {
    const el = box({ width: 200, height: 100 }, [
      text({ text: 'Hello', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
      text({ text: 'World', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 18, children: [] },
        { x: 0, y: 18, width: 100, height: 18, children: [] },
      ],
    }

    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(2)
    expect(results[0].element.props.text).toBe('Hello')
    expect(results[0].direction).toBe('ltr')
    expect(results[1].element.props.text).toBe('World')
    expect(results[1].direction).toBe('ltr')
  })

  it('skips selectable:false', () => {
    const el = box({ width: 200, height: 100 }, [
      text({ text: 'Visible', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18, selectable: false }),
      text({ text: 'Selectable', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 18, children: [] },
        { x: 0, y: 18, width: 100, height: 18, children: [] },
      ],
    }

    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(1)
    expect(results[0].element.props.text).toBe('Selectable')
    expect(results[0].direction).toBe('ltr')
  })

  it('skips image and scene3d leaves but still collects sibling text (non-box branches are terminal)', () => {
    const el = box({ width: 300, height: 100 }, [
      text({ text: 'A', font: '14px sans-serif', lineHeight: 18, width: 40, height: 18 }),
      image({ src: '/x.png', width: 40, height: 40 }),
      scene3d({ width: 40, height: 40, objects: [sphere({ radius: 1 })] }),
      text({ text: 'B', font: '14px sans-serif', lineHeight: 18, width: 40, height: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 300,
      height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 18, children: [] },
        { x: 50, y: 0, width: 40, height: 40, children: [] },
        { x: 100, y: 0, width: 40, height: 40, children: [] },
        { x: 150, y: 0, width: 40, height: 18, children: [] },
      ],
    }

    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(2)
    expect(results[0].element.props.text).toBe('A')
    expect(results[1].element.props.text).toBe('B')
    expect(results[0].index).toBe(0)
    expect(results[1].index).toBe(1)
  })

  it('inherits resolved direction through nested boxes', () => {
    const el = box({ width: 220, height: 80, dir: 'rtl' }, [
      box({ width: 200, height: 40 }, [
        text({ text: 'RTL child', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
      ]),
      box({ width: 200, height: 40, dir: 'ltr' }, [
        text({ text: 'LTR override', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
      ]),
    ])
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 220, height: 80,
      children: [
        {
          x: 0, y: 0, width: 200, height: 40,
          children: [{ x: 0, y: 0, width: 100, height: 18, children: [] }],
        },
        {
          x: 0, y: 40, width: 200, height: 40,
          children: [{ x: 0, y: 0, width: 100, height: 18, children: [] }],
        },
      ],
    }

    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(2)
    expect(results[0].direction).toBe('rtl')
    expect(results[1].direction).toBe('ltr')
  })

  it('inherits rtl through nested dir:auto on boxes and text (matches resolveElementDirection)', () => {
    const el = box({ width: 220, height: 40, dir: 'rtl' }, [
      box({ width: 200, height: 40, dir: 'auto' }, [
        text({
          text: 'Auto child',
          font: '14px sans-serif',
          lineHeight: 18,
          width: 100,
          height: 18,
          dir: 'auto',
        }),
      ]),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 220,
      height: 40,
      children: [
        {
          x: 0,
          y: 0,
          width: 200,
          height: 40,
          children: [{ x: 0, y: 0, width: 100, height: 18, children: [] }],
        },
      ],
    }

    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(1)
    expect(results[0].direction).toBe('rtl')
  })

  it('skips element children with no matching layout child (partial or stale geometry)', () => {
    const el = box({ width: 200, height: 100 }, [
      text({ text: 'Kept', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
      text({ text: 'Dropped', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [{ x: 0, y: 0, width: 100, height: 18, children: [] }],
    }
    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(1)
    expect(results[0].element.props.text).toBe('Kept')
  })

  it('ignores extra layout children when the element tree is shallower', () => {
    const el = box({ width: 200, height: 100 }, [
      text({ text: 'Only', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 18, children: [] },
        { x: 0, y: 18, width: 100, height: 18, children: [] },
      ],
    }
    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(1)
    expect(results[0].element.props.text).toBe('Only')
  })

  it('sparse layout children array: still collects a later text node when an earlier slot is missing', () => {
    const el = box({ width: 200, height: 100 }, [
      text({ text: 'NoLayout', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
      text({ text: 'Kept', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
    ])
    const sparse: ComputedLayout[] = []
    sparse[1] = { x: 0, y: 40, width: 100, height: 18, children: [] }
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: sparse as unknown as ComputedLayout['children'],
    }
    expect(layout.children).toHaveLength(2)
    expect(layout.children[0]).toBeUndefined()

    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(1)
    expect(results[0].element.props.text).toBe('Kept')
    expect(results[0].y).toBe(40)
  })

  it('treats non-array box.children as a leaf without throwing (nested text unreachable; matches collectFocusOrder)', () => {
    const t = text({ text: 'Hi', font: '14px sans-serif', lineHeight: 18, width: 10, height: 18 })
    const root = box({ width: 100, height: 100 }, [t])
    ;(root as unknown as { children: unknown }).children = null
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 10, height: 18, children: [] }],
    }
    const results: TextNodeInfo[] = []
    expect(() => collectTextNodes(root, layout, 0, 0, results)).not.toThrow()
    expect(results).toHaveLength(0)
  })

  it('overlapping siblings: text node order follows children array index, not z-index paint stack', () => {
    const el = box({ width: 100, height: 40 }, [
      text({
        text: 'PaintedOnTop',
        font: '14px sans-serif',
        lineHeight: 18,
        width: 100,
        height: 18,
        zIndex: 5,
      }),
      text({
        text: 'PaintedBelow',
        font: '14px sans-serif',
        lineHeight: 18,
        width: 100,
        height: 18,
        zIndex: 1,
      }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      children: [
        { x: 0, y: 0, width: 100, height: 18, children: [] },
        { x: 0, y: 0, width: 100, height: 18, children: [] },
      ],
    }
    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results.map(n => n.element.props.text)).toEqual(['PaintedOnTop', 'PaintedBelow'])
  })

  it('treats non-finite root offsetX/Y as zero (aligned with pointer hit-test root offsets)', () => {
    const el = box({ width: 200, height: 100 }, [
      text({ text: 'Hi', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 10,
      y: 20,
      width: 200,
      height: 100,
      children: [{ x: 5, y: 0, width: 100, height: 18, children: [] }],
    }
    const collect = (ox: number, oy: number): TextNodeInfo[] => {
      const r: TextNodeInfo[] = []
      collectTextNodes(el, layout, ox, oy, r)
      return r
    }
    const baseline = collect(3, 4)[0]!
    expect(baseline).toMatchObject({ x: 18, y: 24 })

    expect(collect(Number.NaN, 4)[0]).toMatchObject({ x: 15, y: 24 })
    expect(collect(3, Number.POSITIVE_INFINITY)[0]).toMatchObject({ x: 18, y: 20 })
    expect(collect('7' as unknown as number, 0)[0]).toMatchObject({ x: 15, y: 20 })
    const bx = 1n as unknown as number
    expect(() => collect(bx, 4)).not.toThrow()
    expect(collect(bx, 4)[0]).toMatchObject({ x: 15, y: 24 })
    expect(collect(3, bx)[0]).toMatchObject({ x: 18, y: 20 })
  })

  it('subtracts scrollX/scrollY when descending into children (aligned with canvas paint and hit-test)', () => {
    const t = text({ text: 'InScroll', font: '14px sans-serif', lineHeight: 18, width: 80, height: 18 })
    const el = box({ width: 200, height: 120 }, [
      box(
        { width: 100, height: 100, overflow: 'scroll', scrollX: 12, scrollY: 40 },
        [t],
      ),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      children: [
        {
          x: 10,
          y: 20,
          width: 100,
          height: 100,
          children: [{ x: 5, y: 30, width: 80, height: 18, children: [] }],
        },
      ],
    }
    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(1)
    // paintNode: childOffsetX = (0+10) - 12 = -2, text x = -2 + 5 = 3
    // childOffsetY = (0+20) - 40 = -20, text y = -20 + 30 = 10
    expect(results[0]).toMatchObject({ x: 3, y: 10 })
  })

  it('composes nested scrollX/scrollY when descending (same stack as hit-test / canvas paint)', () => {
    const t = text({
      text: 'Nested',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 40,
      height: 18,
    })
    const inner = box(
      { width: 100, height: 100, overflow: 'scroll', scrollX: 25, scrollY: 35 },
      [t],
    )
    const outer = box(
      { width: 100, height: 100, overflow: 'scroll', scrollX: 20, scrollY: 15 },
      [inner],
    )
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        {
          x: 30,
          y: 40,
          width: 100,
          height: 100,
          children: [{ x: 50, y: 80, width: 40, height: 18, children: [] }],
        },
      ],
    }
    const results: TextNodeInfo[] = []
    collectTextNodes(outer, layout, 0, 0, results)
    expect(results).toHaveLength(1)
    // inner abs = (0 - 20 + 30, 0 - 15 + 40) = (10, 25)
    // text abs = (10 - 25 + 50, 25 - 35 + 80) = (35, 70) — mirrors nested scroll hit-test layout
    expect(results[0]).toMatchObject({ x: 35, y: 70 })
  })

  it('treats non-finite or bigint scrollX/scrollY as zero when descending (finiteNumberOrZero parity with hit-test)', () => {
    const mkText = () =>
      text({ text: 'InScroll', font: '14px sans-serif', lineHeight: 18, width: 80, height: 18 })

    const childLayout = {
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      children: [{ x: 5, y: 30, width: 80, height: 18, children: [] }],
    } satisfies ComputedLayout

    const rootLayout = (inner: ComputedLayout): ComputedLayout => ({
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      children: [inner],
    })

    const r1: TextNodeInfo[] = []
    collectTextNodes(
      box({ width: 200, height: 120 }, [
        box(
          {
            width: 100,
            height: 100,
            overflow: 'scroll',
            scrollX: Number.NaN,
            scrollY: 40,
          },
          [mkText()],
        ),
      ]),
      rootLayout(childLayout),
      0,
      0,
      r1,
    )
    // scrollX → 0: x = 10 + 5 = 15; scrollY 40: y = (20 − 40) + 30 = 10
    expect(r1[0]).toMatchObject({ x: 15, y: 10 })

    const r2: TextNodeInfo[] = []
    collectTextNodes(
      box({ width: 200, height: 120 }, [
        box(
          {
            width: 100,
            height: 100,
            overflow: 'scroll',
            scrollX: 12,
            scrollY: Number.POSITIVE_INFINITY,
          },
          [mkText()],
        ),
      ]),
      rootLayout(childLayout),
      0,
      0,
      r2,
    )
    // scrollY → 0: y = 20 + 30 = 50; scrollX 12: x = (10 − 12) + 5 = 3
    expect(r2[0]).toMatchObject({ x: 3, y: 50 })

    const r3: TextNodeInfo[] = []
    collectTextNodes(
      box({ width: 200, height: 120 }, [
        box(
          {
            width: 100,
            height: 100,
            overflow: 'scroll',
            scrollX: 9n as unknown as number,
            scrollY: 7,
          },
          [mkText()],
        ),
      ]),
      rootLayout(childLayout),
      0,
      0,
      r3,
    )
    // BigInt scrollX → 0: x = 10 + 5 = 15; scrollY 7: y = (20 − 7) + 30 = 43
    expect(r3[0]).toMatchObject({ x: 15, y: 43 })
  })

  it('does not descend when scroll-adjusted child origin overflows (parity with hit-test)', () => {
    const max = Number.MAX_VALUE
    const t = text({ text: 'Hidden', font: '14px sans-serif', lineHeight: 18, width: 80, height: 18 })
    const el = box({ width: 200, height: 120 }, [
      box({ width: 100, height: 100, overflow: 'scroll', scrollX: -max }, [t]),
    ])
    const layout = {
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      children: [
        {
          x: max,
          y: 0,
          width: 100,
          height: 100,
          children: [{ x: 5, y: 30, width: 80, height: 18, children: [] }],
        },
      ],
    }
    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(0)
  })

  it('does not descend when scroll-adjusted child origin overflows on Y (parity with hit-test)', () => {
    const max = Number.MAX_VALUE
    const t = text({ text: 'Hidden', font: '14px sans-serif', lineHeight: 18, width: 80, height: 18 })
    const el = box({ width: 200, height: 120 }, [
      box({ width: 100, height: 100, overflow: 'scroll', scrollY: -max }, [t]),
    ])
    const layout = {
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      children: [
        {
          x: 0,
          y: max,
          width: 100,
          height: 100,
          children: [{ x: 5, y: 30, width: 80, height: 18, children: [] }],
        },
      ],
    }
    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(0)
  })

  it('skips the whole walk when root layout bounds are corrupt (aligned with hit-test / focus)', () => {
    const el = box({ width: 200, height: 100 }, [
      text({ text: 'Hi', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: Number.NaN,
      height: 100,
      children: [{ x: 0, y: 0, width: 100, height: 18, children: [] }],
    }
    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(0)
  })

  it('does not descend under a box with corrupt layout even when a child layout looks valid', () => {
    const el = box({ width: 200, height: 100 }, [
      text({ text: 'Hidden', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [{ x: 0, y: 0, width: -1, height: 18, children: [] }],
    }
    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(0)
  })

  it('skips a text leaf whose own layout bounds are corrupt', () => {
    const el = box({ width: 200, height: 100 }, [
      text({ text: 'Bad', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
      text({ text: 'Good', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        { x: 0, y: 0, width: Number.NaN, height: 18, children: [] },
        { x: 0, y: 18, width: 100, height: 18, children: [] },
      ],
    }
    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(1)
    expect(results[0].element.props.text).toBe('Good')
  })

  it('skips a corrupt nested text under a middle box but still collects later siblings (document order)', () => {
    const el = box({ width: 200, height: 120 }, [
      text({ text: 'Before', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
      box({ width: 100, height: 40 }, [
        text({ text: 'Broken', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
      ]),
      text({ text: 'After', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      children: [
        { x: 0, y: 0, width: 100, height: 18, children: [] },
        {
          x: 0,
          y: 20,
          width: 100,
          height: 40,
          children: [{ x: 0, y: 0, width: Number.NaN, height: 18, children: [] }],
        },
        { x: 0, y: 62, width: 100, height: 18, children: [] },
      ],
    }
    const results: TextNodeInfo[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results.map(n => n.element.props.text)).toEqual(['Before', 'After'])
    expect(results.map(n => n.index)).toEqual([0, 1])
  })
})

describe('getSelectedText', () => {
  const makeNodes = (): TextNodeInfo[] => [
    { element: { kind: 'text' as const, props: { text: 'Hello World', font: '14px sans-serif', lineHeight: 18 } }, direction: 'ltr' as const, x: 0, y: 0, width: 100, height: 18, lines: [], index: 0 },
    { element: { kind: 'text' as const, props: { text: 'Second line', font: '14px sans-serif', lineHeight: 18 } }, direction: 'ltr' as const, x: 0, y: 18, width: 100, height: 18, lines: [], index: 1 },
  ]

  it('extracts from single node', () => {
    const nodes = makeNodes()
    const result = getSelectedText(
      { anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 5 },
      nodes,
    )
    expect(result).toBe('Hello')
  })

  it('works across multiple nodes', () => {
    const nodes = makeNodes()
    const result = getSelectedText(
      { anchorNode: 0, anchorOffset: 6, focusNode: 1, focusOffset: 6 },
      nodes,
    )
    expect(result).toBe('World\nSecond')
  })

  it('handles reversed anchor/focus', () => {
    const nodes = makeNodes()
    const result = getSelectedText(
      { anchorNode: 1, anchorOffset: 6, focusNode: 0, focusOffset: 6 },
      nodes,
    )
    expect(result).toBe('World\nSecond')
  })

  it('returns empty string when there are no text nodes', () => {
    expect(
      getSelectedText({ anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 5 }, []),
    ).toBe('')
  })

  it('returns empty string for a collapsed selection', () => {
    const nodes = makeNodes()
    expect(
      getSelectedText({ anchorNode: 0, anchorOffset: 5, focusNode: 0, focusOffset: 5 }, nodes),
    ).toBe('')
  })

  it('returns empty string when offsets are past the node text (slice semantics)', () => {
    const nodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'hi', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        lines: [],
        index: 0,
      },
    ]
    expect(
      getSelectedText({ anchorNode: 0, anchorOffset: 2, focusNode: 0, focusOffset: 10 }, nodes),
    ).toBe('')
  })

  it('treats focusNode past the last text node as ending on the last node (respects focusOffset)', () => {
    const nodes = makeNodes()
    const sane = getSelectedText(
      { anchorNode: 0, anchorOffset: 0, focusNode: 1, focusOffset: 3 },
      nodes,
    )
    const corruptEndIndex = getSelectedText(
      { anchorNode: 0, anchorOffset: 0, focusNode: 9_000_000, focusOffset: 3 },
      nodes,
    )
    expect(corruptEndIndex).toBe(sane)
    expect(sane).toBe('Hello World\nSec')
  })

  it('returns empty when the normalized range lies entirely past existing nodes', () => {
    const nodes = makeNodes()
    expect(
      getSelectedText({ anchorNode: 5, anchorOffset: 0, focusNode: 5, focusOffset: 1 }, nodes),
    ).toBe('')
  })

  it('returns empty when the normalized range lies entirely before the first node', () => {
    const nodes = makeNodes()
    expect(
      getSelectedText({ anchorNode: -3, anchorOffset: 0, focusNode: -1, focusOffset: 1 }, nodes),
    ).toBe('')
  })

  it('clamps negative offsets to zero (no String.slice negative-index semantics)', () => {
    const nodes = makeNodes()
    expect(
      getSelectedText({ anchorNode: 0, anchorOffset: -50, focusNode: 0, focusOffset: 5 }, nodes),
    ).toBe('Hello')
  })

  it('clamps non-finite offsets to zero before applying slice bounds', () => {
    const nodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'hello', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        lines: [],
        index: 0,
      },
    ]
    expect(
      getSelectedText(
        { anchorNode: 0, anchorOffset: Number.NaN, focusNode: 0, focusOffset: 3 },
        nodes,
      ),
    ).toBe('hel')
    expect(
      getSelectedText(
        { anchorNode: 0, anchorOffset: 1, focusNode: 0, focusOffset: 999 },
        nodes,
      ),
    ).toBe('ello')
    expect(
      getSelectedText(
        { anchorNode: 0, anchorOffset: 0n as unknown as number, focusNode: 0, focusOffset: 2 },
        nodes,
      ),
    ).toBe('he')
  })

  it('truncates fractional offsets toward zero', () => {
    const nodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'hello', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        lines: [],
        index: 0,
      },
    ]
    expect(
      getSelectedText({ anchorNode: 0, anchorOffset: 1.9, focusNode: 0, focusOffset: 3.9 }, nodes),
    ).toBe('el')
  })

  it('truncates fractional node indices toward zero so the walk visits real text nodes', () => {
    const nodes = makeNodes()
    const withFractional = getSelectedText(
      { anchorNode: 0.2, anchorOffset: 0, focusNode: 1.8, focusOffset: 3 },
      nodes,
    )
    const withInteger = getSelectedText(
      { anchorNode: 0, anchorOffset: 0, focusNode: 1, focusOffset: 3 },
      nodes,
    )
    expect(withFractional).toBe(withInteger)
    expect(withInteger).toBe('Hello World\nSec')
  })

  it('returns empty string when node indices are NaN', () => {
    const nodes = makeNodes()
    expect(
      getSelectedText(
        { anchorNode: Number.NaN, anchorOffset: 0, focusNode: 0, focusOffset: 2 },
        nodes,
      ),
    ).toBe('')
    expect(
      getSelectedText(
        { anchorNode: 0, anchorOffset: 0, focusNode: Number.NaN, focusOffset: 2 },
        nodes,
      ),
    ).toBe('')
  })

  it('still clamps focusNode +Infinity to the last node like a huge integer index', () => {
    const nodes = makeNodes()
    expect(
      getSelectedText(
        { anchorNode: 0, anchorOffset: 0, focusNode: Number.POSITIVE_INFINITY, focusOffset: 3 },
        nodes,
      ),
    ).toBe('Hello World\nSec')
  })

  it('normalizes anchorNode +Infinity the same as focus +Infinity (range swap before clipping)', () => {
    const nodes = makeNodes()
    expect(
      getSelectedText(
        { anchorNode: Number.POSITIVE_INFINITY, anchorOffset: 3, focusNode: 0, focusOffset: 0 },
        nodes,
      ),
    ).toBe('Hello World\nSec')
  })

  it('normalizes focusNode -Infinity to the first node after swap (finite indices truncate; -Infinity stays non-finite)', () => {
    const nodes = makeNodes()
    expect(
      getSelectedText(
        { anchorNode: 0, anchorOffset: 5, focusNode: Number.NEGATIVE_INFINITY, focusOffset: 0 },
        nodes,
      ),
    ).toBe('Hello')
  })

  it('returns empty string for BigInt node indices without throwing', () => {
    const nodes = makeNodes()
    const a = 0n as unknown as number
    const b = 1n as unknown as number
    expect(() => getSelectedText({ anchorNode: a, anchorOffset: 0, focusNode: b, focusOffset: 2 }, nodes)).not.toThrow()
    expect(getSelectedText({ anchorNode: a, anchorOffset: 0, focusNode: b, focusOffset: 2 }, nodes)).toBe('')
  })

  it('treats boxed number character offsets as 0 (typeof is not number; clampCharIndex parity)', () => {
    const nodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'hello', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        lines: [],
        index: 0,
      },
    ]
    expect(
      getSelectedText(
        {
          anchorNode: 0,
          anchorOffset: Object(2) as unknown as number,
          focusNode: 0,
          focusOffset: 3,
        },
        nodes,
      ),
    ).toBe('hel')
  })
})

describe('hitTestText', () => {
  it('returns null for an empty textNodes list', () => {
    expect(hitTestText([], 0, 0)).toBeNull()
    expect(hitTestText([], 10, 20)).toBeNull()
  })

  it('uses UTF-16 code-unit indices for charOffset when metrics use one slot per code unit (surrogate pairs)', () => {
    const pair = '\uD83D\uDE00'
    expect(pair.length).toBe(2)
    const lineText = `a${pair}`
    expect(lineText.length).toBe(3)
    const textNodes: TextNodeInfo[] = [
      {
        element: {
          kind: 'text' as const,
          props: { text: lineText, font: '14px sans-serif', lineHeight: 18 },
        },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 200,
        height: 18,
        index: 0,
        lines: [{ text: lineText, x: 0, y: 0, charOffsets: [0, 8, 16], charWidths: [8, 8, 8] }],
      },
    ]
    expect(hitTestText(textNodes, 2, 5)).toEqual({ nodeIndex: 0, charOffset: 0 })
    expect(hitTestText(textNodes, 10, 5)).toEqual({ nodeIndex: 0, charOffset: 1 })
    expect(hitTestText(textNodes, 18, 5)).toEqual({ nodeIndex: 0, charOffset: 2 })
    expect(hitTestText(textNodes, 100, 5)).toEqual({ nodeIndex: 0, charOffset: 3 })
  })

  it('returns null for non-finite pointer coordinates', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'ab', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        index: 0,
        lines: [{ text: 'ab', x: 0, y: 0, charOffsets: [0, 8], charWidths: [8, 8] }],
      },
    ]
    expect(hitTestText(textNodes, Number.NaN, 5)).toBeNull()
    expect(hitTestText(textNodes, 5, Number.NaN)).toBeNull()
    expect(hitTestText(textNodes, Number.POSITIVE_INFINITY, 5)).toBeNull()
    expect(hitTestText(textNodes, 5, Number.NEGATIVE_INFINITY)).toBeNull()
  })

  it('returns null for BigInt or non-number pointer coordinates without throwing', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'ab', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        index: 0,
        lines: [{ text: 'ab', x: 0, y: 0, charOffsets: [0, 8], charWidths: [8, 8] }],
      },
    ]
    const bx = 5n as unknown as number
    const by = 3n as unknown as number
    expect(() => hitTestText(textNodes, bx, 5)).not.toThrow()
    expect(hitTestText(textNodes, bx, 5)).toBeNull()
    expect(() => hitTestText(textNodes, 5, by)).not.toThrow()
    expect(hitTestText(textNodes, 5, by)).toBeNull()
    const sx = '5' as unknown as number
    expect(() => hitTestText(textNodes, sx, 5)).not.toThrow()
    expect(hitTestText(textNodes, sx, 5)).toBeNull()
  })

  it('skips nodes with non-number bounds without throwing (aligned with layoutBoundsAreFinite)', () => {
    const bigintW: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'x', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 1n as unknown as number,
        height: 18,
        index: 0,
        lines: [{ text: 'x', x: 0, y: 0, charOffsets: [0], charWidths: [10] }],
      },
    ]
    expect(() => hitTestText(bigintW, 5, 5)).not.toThrow()
    expect(hitTestText(bigintW, 5, 5)).toBeNull()
  })

  it('skips nodes with non-finite layout bounds (matches pointer hit-test invariants)', () => {
    const badWidth: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'x', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: Number.NaN,
        height: 18,
        index: 0,
        lines: [{ text: 'x', x: 0, y: 0, charOffsets: [0], charWidths: [10] }],
      },
    ]
    expect(hitTestText(badWidth, 5, 5)).toBeNull()

    const badHeight: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'x', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 40,
        height: Number.POSITIVE_INFINITY,
        index: 0,
        lines: [{ text: 'x', x: 0, y: 0, charOffsets: [0], charWidths: [10] }],
      },
    ]
    expect(hitTestText(badHeight, 5, 5)).toBeNull()
  })

  it('skips nodes with negative width or height (matches layout bounds invariants)', () => {
    const badW: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'x', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: -1,
        height: 18,
        index: 0,
        lines: [{ text: 'x', x: 0, y: 0, charOffsets: [0], charWidths: [10] }],
      },
    ]
    expect(hitTestText(badW, 5, 5)).toBeNull()

    const badH: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'x', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 40,
        height: -0.001,
        index: 0,
        lines: [{ text: 'x', x: 0, y: 0, charOffsets: [0], charWidths: [10] }],
      },
    ]
    expect(hitTestText(badH, 5, 5)).toBeNull()
  })

  it('skips a bad-bounds node and still hits a later node with finite geometry', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'bad', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: Number.NaN,
        height: 18,
        index: 0,
        lines: [{ text: 'bad', x: 0, y: 0, charOffsets: [0], charWidths: [8] }],
      },
      {
        element: { kind: 'text' as const, props: { text: 'ok', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 20,
        width: 40,
        height: 18,
        index: 1,
        lines: [{ text: 'ok', x: 0, y: 20, charOffsets: [0, 12], charWidths: [12, 12] }],
      },
    ]
    expect(hitTestText(textNodes, 3, 26)).toEqual({ nodeIndex: 1, charOffset: 0 })
  })

  it('returns null when no node bounds match', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'x', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 10,
        y: 10,
        width: 20,
        height: 18,
        index: 0,
        lines: [{ text: 'x', x: 10, y: 10, charOffsets: [0], charWidths: [10] }],
      },
    ]
    expect(hitTestText(textNodes, 0, 15)).toBeNull()
  })

  it('treats the last line bottom edge as inclusive so the node box bottom matches box hit-test edges', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'ab', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        index: 0,
        lines: [{ text: 'ab', x: 0, y: 0, charOffsets: [0, 8], charWidths: [8, 8] }],
      },
    ]
    // py === line.y + lineHeight: inside node rect (inclusive bottom) but was previously a "between lines" false snap
    expect(hitTestText(textNodes, 2, 18)).toEqual({ nodeIndex: 0, charOffset: 0 })
    expect(hitTestText(textNodes, 12, 18)).toEqual({ nodeIndex: 0, charOffset: 2 })
  })

  it('returns null when x+width overflows to Infinity (aligned with pointInInclusiveLayoutRect; naive sum would admit corners)', () => {
    const max = Number.MAX_VALUE
    expect(max + max).toBe(Infinity)
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'ab', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: max,
        y: 0,
        width: max,
        height: 18,
        index: 0,
        lines: [{ text: 'ab', x: max, y: 0, charOffsets: [0, 8], charWidths: [8, 8] }],
      },
    ]
    expect(hitTestText(textNodes, max, 5)).toBeNull()
    expect(hitTestText(textNodes, max - 1, 5)).toBeNull()
  })

  it('keeps half-open bands between stacked lines so a shared y boundary hits the upper line only', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'ab\ncd', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 36,
        index: 0,
        lines: [
          { text: 'ab', x: 0, y: 0, charOffsets: [0, 8], charWidths: [8, 8] },
          { text: 'cd', x: 0, y: 18, charOffsets: [0, 8], charWidths: [8, 8] },
        ],
      },
    ]
    expect(hitTestText(textNodes, 2, 18)).toEqual({ nodeIndex: 0, charOffset: 2 })
    expect(hitTestText(textNodes, 2, 17)).toEqual({ nodeIndex: 0, charOffset: 0 })
  })

  it('snaps to charOffset 0 when inside node box but lines are empty', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'pending', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 80,
        height: 24,
        index: 0,
        lines: [],
      },
    ]
    expect(hitTestText(textNodes, 5, 5)).toEqual({ nodeIndex: 0, charOffset: 0 })
  })

  it('does not throw when a line has NaN charOffsets; midpoint checks fall through to end-of-line snap', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'ab', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        index: 0,
        lines: [{ text: 'ab', x: 0, y: 0, charOffsets: [0, Number.NaN], charWidths: [8, 8] }],
      },
    ]
    expect(() => hitTestText(textNodes, 2, 5)).not.toThrow()
    expect(hitTestText(textNodes, 2, 5)).toEqual({ nodeIndex: 0, charOffset: 0 })
    expect(hitTestText(textNodes, 12, 5)).toEqual({ nodeIndex: 0, charOffset: 2 })
  })

  it('does not throw when a line has NaN charWidths; LTR still resolves early glyphs then snaps past the bad width', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'ab', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        index: 0,
        lines: [{ text: 'ab', x: 0, y: 0, charOffsets: [0, 8], charWidths: [8, Number.NaN] }],
      },
    ]
    expect(() => hitTestText(textNodes, 2, 5)).not.toThrow()
    expect(hitTestText(textNodes, 2, 5)).toEqual({ nodeIndex: 0, charOffset: 0 })
    expect(hitTestText(textNodes, 14, 5)).toEqual({ nodeIndex: 0, charOffset: 2 })
  })

  it('non-finite element lineHeight skips vertical line bands and snaps to charOffset 0 without throwing', () => {
    const nanLh: TextNodeInfo[] = [
      {
        element: {
          kind: 'text' as const,
          props: { text: 'ab', font: '14px sans-serif', lineHeight: Number.NaN as never },
        },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        index: 0,
        lines: [{ text: 'ab', x: 0, y: 0, charOffsets: [0, 8], charWidths: [8, 8] }],
      },
    ]
    expect(() => hitTestText(nanLh, 5, 5)).not.toThrow()
    expect(hitTestText(nanLh, 5, 5)).toEqual({ nodeIndex: 0, charOffset: 0 })

    const infLh: TextNodeInfo[] = [
      {
        element: {
          kind: 'text' as const,
          props: { text: 'ab', font: '14px sans-serif', lineHeight: Number.POSITIVE_INFINITY as never },
        },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        index: 0,
        lines: [{ text: 'ab', x: 0, y: 0, charOffsets: [0, 8], charWidths: [8, 8] }],
      },
    ]
    expect(() => hitTestText(infLh, 12, 5)).not.toThrow()
    expect(hitTestText(infLh, 12, 5)).toEqual({ nodeIndex: 0, charOffset: 2 })

    const multiNaN: TextNodeInfo[] = [
      {
        element: {
          kind: 'text' as const,
          props: { text: 'ab\ncd', font: '14px sans-serif', lineHeight: Number.NaN as never },
        },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 36,
        index: 0,
        lines: [
          { text: 'ab', x: 0, y: 0, charOffsets: [0, 8], charWidths: [8, 8] },
          { text: 'cd', x: 0, y: 18, charOffsets: [0, 8], charWidths: [8, 8] },
        ],
      },
    ]
    expect(hitTestText(multiNaN, 4, 25)).toEqual({ nodeIndex: 0, charOffset: 0 })
  })
})

describe('hitTestText direction mapping', () => {
  it('maps x positions to logical offsets in rtl text nodes', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'abcd', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'rtl' as const,
        x: 10,
        y: 20,
        width: 40,
        height: 18,
        index: 0,
        lines: [
          { text: 'abcd', x: 10, y: 20, charOffsets: [0, 10, 20, 30], charWidths: [10, 10, 10, 10] },
        ],
      },
    ]

    // Near the left edge of the rendered RTL line maps toward the logical end.
    const leftHit = hitTestText(textNodes, 12, 24)
    // Near the right edge maps toward logical start.
    const rightHit = hitTestText(textNodes, 48, 24)

    expect(leftHit).toEqual({ nodeIndex: 0, charOffset: 4 })
    expect(rightHit).toEqual({ nodeIndex: 0, charOffset: 0 })
  })

  it('does not throw when an RTL line has NaN charWidths (non-finite visual width); snaps to end of line', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'ab', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'rtl' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        index: 0,
        lines: [{ text: 'ab', x: 0, y: 0, charOffsets: [0, 8], charWidths: [8, Number.NaN] }],
      },
    ]
    expect(() => hitTestText(textNodes, 2, 5)).not.toThrow()
    expect(hitTestText(textNodes, 2, 5)).toEqual({ nodeIndex: 0, charOffset: 2 })
    expect(hitTestText(textNodes, 20, 5)).toEqual({ nodeIndex: 0, charOffset: 2 })
  })

  it('does not throw when charWidths is shorter than charOffsets; trailing slots use NaN midpoints and snap to end of line', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'ab', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        index: 0,
        lines: [{ text: 'ab', x: 0, y: 0, charOffsets: [0, 8, 16], charWidths: [8] }],
      },
    ]
    expect(() => hitTestText(textNodes, 2, 5)).not.toThrow()
    // First glyph still has a paired width; later offsets have no width → NaN midpoints → no early hit.
    expect(hitTestText(textNodes, 2, 5)).toEqual({ nodeIndex: 0, charOffset: 0 })
    expect(hitTestText(textNodes, 12, 5)).toEqual({ nodeIndex: 0, charOffset: 2 })
  })

  it('does not throw when charOffsets is shorter than charWidths; only paired entries participate in midpoint tests', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text' as const, props: { text: 'ab', font: '14px sans-serif', lineHeight: 18 } },
        direction: 'ltr' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 18,
        index: 0,
        lines: [{ text: 'ab', x: 0, y: 0, charOffsets: [0, 8], charWidths: [8, 8, 99] }],
      },
    ]
    expect(() => hitTestText(textNodes, 2, 5)).not.toThrow()
    expect(hitTestText(textNodes, 2, 5)).toEqual({ nodeIndex: 0, charOffset: 0 })
    expect(hitTestText(textNodes, 12, 5)).toEqual({ nodeIndex: 0, charOffset: 2 })
  })
})

describe('findInTextNodes', () => {
  function stubTextNode(index: number, t: string): TextNodeInfo {
    return {
      element: { kind: 'text' as const, props: { text: t, font: '14px sans-serif', lineHeight: 18 } },
      direction: 'ltr' as const,
      x: 0,
      y: 0,
      width: 100,
      height: 18,
      index,
      lines: [],
    }
  }

  it('returns an empty list when the query is empty or nodes are empty', () => {
    const a = stubTextNode(0, 'hello')
    expect(findInTextNodes([], 'x')).toEqual([])
    expect(findInTextNodes([a], '')).toEqual([])
  })

  it('matches case-insensitively and records UTF-16 offsets in the original text', () => {
    const nodes = [stubTextNode(0, 'Hello WORLD')]
    expect(findInTextNodes(nodes, 'world')).toEqual([
      { anchorNode: 0, anchorOffset: 6, focusNode: 0, focusOffset: 11 },
    ])
    expect(findInTextNodes(nodes, 'HELLO')).toEqual([
      { anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 5 },
    ])
  })

  it('returns every overlapping occurrence (not just non-overlapping matches)', () => {
    const nodes = [stubTextNode(0, 'aaa')]
    expect(findInTextNodes(nodes, 'aa')).toEqual([
      { anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 2 },
      { anchorNode: 0, anchorOffset: 1, focusNode: 0, focusOffset: 3 },
    ])
  })

  it('walks multiple text nodes in order with distinct anchorNode indices', () => {
    const nodes = [stubTextNode(0, 'foo'), stubTextNode(1, 'Foo')]
    expect(findInTextNodes(nodes, 'foo')).toEqual([
      { anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 3 },
      { anchorNode: 1, anchorOffset: 0, focusNode: 1, focusOffset: 3 },
    ])
  })

  it('matches interior substrings when only letter casing differs', () => {
    const nodes = [stubTextNode(0, 'aBcDe')]
    expect(findInTextNodes(nodes, 'bc')).toEqual([
      { anchorNode: 0, anchorOffset: 1, focusNode: 0, focusOffset: 3 },
    ])
  })

  it('uses UTF-16 code unit offsets for astral-plane characters (matches selection / canvas indices)', () => {
    const nodes = [stubTextNode(0, 'x😀y😀z')]
    expect(findInTextNodes(nodes, '😀')).toEqual([
      { anchorNode: 0, anchorOffset: 1, focusNode: 0, focusOffset: 3 },
      { anchorNode: 0, anchorOffset: 4, focusNode: 0, focusOffset: 6 },
    ])
  })
})

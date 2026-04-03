import { describe, it, expect } from 'vitest'
import type { ComputedLayout } from 'textura'
import { collectTextNodes, getSelectedText, hitTestText } from '../selection.js'
import type { TextNodeInfo } from '../selection.js'
import { text } from '../elements.js'
import { box } from '../elements.js'

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
})

describe('hitTestText', () => {
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
})

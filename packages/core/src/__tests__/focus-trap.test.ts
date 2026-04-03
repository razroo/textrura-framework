import { describe, it, expect, beforeEach } from 'vitest'
import type { ComputedLayout } from 'textura'
import { box, text } from '../elements.js'
import { clearFocus, focusedElement, setFocus } from '../focus.js'
import { trapFocusStep } from '../focus-trap.js'

describe('trapFocusStep', () => {
  beforeEach(() => clearFocus())

  it('cycles focus within scoped subtree only', () => {
    const modalA = box({ onKeyDown: () => undefined }, [])
    const modalB = box({ onKeyDown: () => undefined }, [])
    const outside = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [
      box({}, [modalA, modalB]),
      outside,
    ])
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 300, height: 100,
      children: [
        {
          x: 0, y: 0, width: 200, height: 100,
          children: [
            { x: 0, y: 0, width: 100, height: 40, children: [] },
            { x: 0, y: 50, width: 100, height: 40, children: [] },
          ],
        },
        { x: 220, y: 0, width: 80, height: 40, children: [] },
      ],
    }

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    const first = focusedElement.peek()
    expect(first?.element).toBe(modalA)

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    const second = focusedElement.peek()
    expect(second?.element).toBe(modalB)

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    const wrapped = focusedElement.peek()
    expect(wrapped?.element).toBe(modalA)
    expect(wrapped?.element).not.toBe(outside)
  })

  it('returns false when scope path is out of range', () => {
    const tree = box({}, [box({ onKeyDown: () => undefined }, [])])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      children: [{ x: 0, y: 0, width: 100, height: 40, children: [] }],
    }
    expect(trapFocusStep(tree, layout, [2], 'next')).toBe(false)
    expect(trapFocusStep(tree, layout, [0, 1], 'next')).toBe(false)
  })

  it('skips a focusable when its layout slot is missing (sparse children array; matches hit-test)', () => {
    const missingLayout = box({ onKeyDown: () => undefined }, [])
    const reachable = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [missingLayout, reachable])
    const sparseChildren: ComputedLayout['children'] = []
    sparseChildren[1] = { x: 0, y: 0, width: 100, height: 40, children: [] }
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: sparseChildren,
    }
    expect(layout.children).toHaveLength(2)
    expect(layout.children[0]).toBeUndefined()

    expect(() => trapFocusStep(tree, layout, [], 'next')).not.toThrow()
    expect(trapFocusStep(tree, layout, [], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(reachable)
    clearFocus()
    expect(() => trapFocusStep(tree, layout, [], 'prev')).not.toThrow()
    expect(trapFocusStep(tree, layout, [], 'prev')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(reachable)
  })

  it('returns false when the tree root is not a box', () => {
    const tree = text({ text: 'x', font: '14px sans-serif', lineHeight: 20 })
    const layout: ComputedLayout = { x: 0, y: 0, width: 50, height: 20, children: [] }
    expect(trapFocusStep(tree, layout, [], 'next')).toBe(false)
    expect(trapFocusStep(tree, layout, [], 'prev')).toBe(false)
  })

  it('returns false when scope resolves to a non-box node', () => {
    const tree = box({}, [text({ text: 'x', font: '14px sans-serif', lineHeight: 20 })])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 50,
      height: 20,
      children: [{ x: 0, y: 0, width: 50, height: 20, children: [] }],
    }
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(false)
  })

  it('returns false when subtree has no focusable boxes', () => {
    const tree = box({}, [box({}, [box({}, [])])])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          children: [{ x: 0, y: 0, width: 100, height: 100, children: [] }],
        },
      ],
    }
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(false)
  })

  it('returns false when trap scope layout bounds are corrupt (matches collectFocusOrder)', () => {
    const modal = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [modal])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: Number.NaN, height: 40, children: [] }],
    }
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(false)
  })

  it('returns false when root layout bounds are corrupt (whole-tree scope skips descendants)', () => {
    const inner = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [inner])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: Number.NaN,
      height: 100,
      children: [{ x: 0, y: 0, width: 100, height: 40, children: [] }],
    }
    expect(trapFocusStep(tree, layout, [], 'next')).toBe(false)
    expect(trapFocusStep(tree, layout, [], 'prev')).toBe(false)
  })

  it('skips focusables with negative width or height (same layoutBoundsAreFinite rule as hit-test)', () => {
    const badW = box({ onKeyDown: () => undefined }, [])
    const badH = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [badW, badH])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        { x: 0, y: 0, width: -1, height: 40, children: [] },
        { x: 100, y: 0, width: 40, height: -0.01, children: [] },
      ],
    }
    expect(trapFocusStep(tree, layout, [], 'next')).toBe(false)
    expect(trapFocusStep(tree, layout, [], 'prev')).toBe(false)
  })

  it('cycles backward with prev', () => {
    const a = box({ onKeyDown: () => undefined }, [])
    const b = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [box({}, [a, b])])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        {
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          children: [
            { x: 0, y: 0, width: 100, height: 40, children: [] },
            { x: 0, y: 50, width: 100, height: 40, children: [] },
          ],
        },
      ],
    }

    expect(trapFocusStep(tree, layout, [0], 'prev')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(b)

    expect(trapFocusStep(tree, layout, [0], 'prev')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(a)

    expect(trapFocusStep(tree, layout, [0], 'prev')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(b)
  })

  it('when focus is outside the trap, next targets first focusable and prev targets last', () => {
    const modalA = box({ onKeyDown: () => undefined }, [])
    const modalB = box({ onKeyDown: () => undefined }, [])
    const outside = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [box({}, [modalA, modalB]), outside])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 300,
      height: 100,
      children: [
        {
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          children: [
            { x: 0, y: 0, width: 100, height: 40, children: [] },
            { x: 0, y: 50, width: 100, height: 40, children: [] },
          ],
        },
        { x: 220, y: 0, width: 80, height: 40, children: [] },
      ],
    }

    setFocus(outside, layout.children[1]!)
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(modalA)

    setFocus(outside, layout.children[1]!)
    expect(trapFocusStep(tree, layout, [0], 'prev')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(modalB)
  })

  it('includes onClick-only boxes in trap order (same rule as collectFocusOrder)', () => {
    const clickOnly = box({ onClick: () => undefined }, [])
    const keyOnly = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [box({}, [clickOnly, keyOnly])])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        {
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          children: [
            { x: 0, y: 0, width: 100, height: 40, children: [] },
            { x: 0, y: 50, width: 100, height: 40, children: [] },
          ],
        },
      ],
    }

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(clickOnly)

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(keyOnly)

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(clickOnly)
  })

  it('includes onCompositionUpdate-only and onCompositionEnd-only boxes in trap order', () => {
    const updateOnly = box({ onCompositionUpdate: () => undefined }, [])
    const endOnly = box({ onCompositionEnd: () => undefined }, [])
    const tree = box({}, [box({}, [updateOnly, endOnly])])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        {
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          children: [
            { x: 0, y: 0, width: 100, height: 40, children: [] },
            { x: 0, y: 50, width: 100, height: 40, children: [] },
          ],
        },
      ],
    }

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(updateOnly)

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(endOnly)

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(updateOnly)
  })

  it('with a single focusable, next and prev keep focus on that element (mod-1 wrap)', () => {
    const only = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [only])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      children: [{ x: 0, y: 0, width: 100, height: 40, children: [] }],
    }

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(only)

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(only)

    expect(trapFocusStep(tree, layout, [0], 'prev')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(only)

    clearFocus()
    expect(trapFocusStep(tree, layout, [0], 'prev')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(only)
  })

  it('treats empty scopePath as the tree root box (whole-tree trap)', () => {
    const a = box({ onKeyDown: () => undefined }, [])
    const b = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [a, b])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 40, children: [] },
        { x: 0, y: 50, width: 100, height: 40, children: [] },
      ],
    }

    expect(trapFocusStep(tree, layout, [], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(a)

    expect(trapFocusStep(tree, layout, [], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(b)
  })

  it('includes onKeyUp-only boxes in trap order (same rule as collectFocusOrder)', () => {
    const upOnly = box({ onKeyUp: () => undefined }, [])
    const keyOnly = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [box({}, [upOnly, keyOnly])])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        {
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          children: [
            { x: 0, y: 0, width: 100, height: 40, children: [] },
            { x: 0, y: 50, width: 100, height: 40, children: [] },
          ],
        },
      ],
    }

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(upOnly)

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(keyOnly)
  })

  it('includes composition-only boxes in trap order (same rule as collectFocusOrder)', () => {
    const compOnly = box({ onCompositionStart: () => undefined }, [])
    const keyOnly = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [box({}, [compOnly, keyOnly])])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        {
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          children: [
            { x: 0, y: 0, width: 100, height: 40, children: [] },
            { x: 0, y: 50, width: 100, height: 40, children: [] },
          ],
        },
      ],
    }

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(compOnly)

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(keyOnly)
  })
})

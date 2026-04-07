import { describe, it, expect, beforeEach } from 'vitest'
import type { ComputedLayout } from 'textura'
import { box, image, scene3d, sphere, text } from '../elements.js'
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

  it('cycles in source child order inside the trap, not z-index paint order (matches collectFocusOrder)', () => {
    const backVisually = box({ width: 50, height: 50, zIndex: 0, onKeyDown: () => undefined }, [])
    const frontVisually = box({ width: 50, height: 50, zIndex: 10, onKeyDown: () => undefined }, [])
    const modal = box({ width: 100, height: 100 }, [backVisually, frontVisually])
    const tree = box({}, [modal])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          children: [
            { x: 0, y: 0, width: 50, height: 50, children: [] },
            { x: 0, y: 0, width: 50, height: 50, children: [] },
          ],
        },
      ],
    }

    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(backVisually)
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(frontVisually)
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(backVisually)
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

  it('returns false when the scope path descends through a box with non-array children', () => {
    const inner = box({ onKeyDown: () => undefined }, [])
    const modal = box({}, [inner])
    ;(modal as unknown as { children: unknown }).children = null
    const tree = box({}, [modal])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          children: [{ x: 0, y: 0, width: 50, height: 40, children: [] }],
        },
      ],
    }
    expect(() => trapFocusStep(tree, layout, [0, 0], 'next')).not.toThrow()
    expect(trapFocusStep(tree, layout, [0, 0], 'next')).toBe(false)
  })

  it('treats non-array children on the trap root as empty when stepping focus', () => {
    const inner = box({ onKeyDown: () => undefined }, [])
    const modal = box({ width: 100, height: 100, onKeyDown: () => undefined }, [inner])
    ;(modal as unknown as { children: unknown }).children = null
    const tree = box({}, [modal])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [{ x: 0, y: 0, width: 100, height: 100, children: [] }],
    }
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()!.element).toBe(modal)
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()!.element).toBe(modal)
  })

  it('returns false for negative, fractional, or non-finite scope indices without throwing', () => {
    const inner = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [inner])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      children: [{ x: 0, y: 0, width: 100, height: 40, children: [] }],
    }

    for (const bad of [-1, 0.7, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const) {
      const path = [bad] as never
      expect(() => trapFocusStep(tree, layout, path, 'next')).not.toThrow()
      expect(trapFocusStep(tree, layout, path, 'next')).toBe(false)
      expect(() => trapFocusStep(tree, layout, path, 'prev')).not.toThrow()
      expect(trapFocusStep(tree, layout, path, 'prev')).toBe(false)
    }

    const onePast = [1n] as never
    expect(() => trapFocusStep(tree, layout, onePast, 'next')).not.toThrow()
    expect(trapFocusStep(tree, layout, onePast, 'next')).toBe(false)
  })

  it('returns false when a scope path segment is not a non-negative integer (string / boolean / null / undefined / boxed number / symbol)', () => {
    const inner = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [inner])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      children: [{ x: 0, y: 0, width: 100, height: 40, children: [] }],
    }

    for (const badPath of [
      ['0'] as never,
      [true as never],
      [false as never],
      [null as never],
      [undefined as never],
      [Object(0) as never],
      [Object(1) as never],
      [Symbol('scope') as never],
    ]) {
      expect(() => trapFocusStep(tree, layout, badPath, 'next')).not.toThrow()
      expect(trapFocusStep(tree, layout, badPath, 'next')).toBe(false)
      expect(() => trapFocusStep(tree, layout, badPath, 'prev')).not.toThrow()
      expect(trapFocusStep(tree, layout, badPath, 'prev')).toBe(false)
    }
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

  it('returns false when scope resolves to image or scene3d leaf (non-box trap root)', () => {
    const img = image({ src: '/x.png', width: 10, height: 10 })
    const s3 = scene3d({ width: 16, height: 16, objects: [sphere({ radius: 1 })] })
    const tree = box({}, [img, s3])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: 10, height: 10, children: [] },
        { x: 0, y: 0, width: 16, height: 16, children: [] },
      ],
    }
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(false)
    expect(trapFocusStep(tree, layout, [1], 'prev')).toBe(false)
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

  it('does not descend past an intermediate box with corrupt layout (nested focusables are unreachable)', () => {
    const inner = box({ onKeyDown: () => undefined }, [])
    const mid = box({}, [inner])
    const tree = box({}, [mid])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        {
          x: 0,
          y: 0,
          width: Number.NaN,
          height: 60,
          children: [{ x: 0, y: 0, width: 100, height: 40, children: [] }],
        },
      ],
    }
    expect(trapFocusStep(tree, layout, [], 'next')).toBe(false)
    expect(trapFocusStep(tree, layout, [], 'prev')).toBe(false)
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(false)
    expect(trapFocusStep(tree, layout, [0], 'prev')).toBe(false)
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

  it('treats only exact prev as backward; unknown direction strings match next (runtime / mistyped callers)', () => {
    const a = box({ onKeyDown: () => undefined }, [])
    const b = box({ onKeyDown: () => undefined }, [])
    const c = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [box({}, [a, b, c])])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 160,
      children: [
        {
          x: 0,
          y: 0,
          width: 200,
          height: 160,
          children: [
            { x: 0, y: 0, width: 100, height: 40, children: [] },
            { x: 0, y: 50, width: 100, height: 40, children: [] },
            { x: 0, y: 100, width: 100, height: 40, children: [] },
          ],
        },
      ],
    }

    setFocus(b, layout.children[0]!.children[1]!)
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(c)

    setFocus(b, layout.children[0]!.children[1]!)
    expect(trapFocusStep(tree, layout, [0], 'typo' as 'next' | 'prev')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(c)

    setFocus(b, layout.children[0]!.children[1]!)
    expect(trapFocusStep(tree, layout, [0], 'prev')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(a)
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

  it('when focus is on a pointer-only box inside the trap, next/prev match cleared-focus entry (not in trap list)', () => {
    const modalA = box({ onKeyDown: () => undefined }, [])
    const modalB = box({ onKeyDown: () => undefined }, [])
    const pointerOnly = box(
      { onPointerDown: () => undefined, onPointerUp: () => undefined },
      [],
    )
    const tree = box({}, [box({}, [modalA, pointerOnly, modalB])])
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
            { x: 0, y: 45, width: 100, height: 10, children: [] },
            { x: 0, y: 55, width: 100, height: 40, children: [] },
          ],
        },
      ],
    }

    setFocus(pointerOnly, layout.children[0]!.children[1]!)
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(modalA)

    setFocus(pointerOnly, layout.children[0]!.children[1]!)
    expect(trapFocusStep(tree, layout, [0], 'prev')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(modalB)
  })

  it('when focus is cleared, next targets first focusable and prev targets last (same idx -1 path as outside trap)', () => {
    const modalA = box({ onKeyDown: () => undefined }, [])
    const modalB = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [box({}, [modalA, modalB])])
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

    clearFocus()
    expect(focusedElement.peek()).toBeNull()
    expect(trapFocusStep(tree, layout, [0], 'next')).toBe(true)
    expect(focusedElement.peek()?.element).toBe(modalA)

    clearFocus()
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

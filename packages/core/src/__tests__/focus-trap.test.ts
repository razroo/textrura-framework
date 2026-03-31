import { describe, it, expect, beforeEach } from 'vitest'
import { box } from '../elements.js'
import { clearFocus, focusedElement } from '../focus.js'
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
    const layout = {
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

    expect(trapFocusStep(tree, layout as any, [0], 'next')).toBe(true)
    const first = focusedElement.peek()
    expect(first?.element).toBe(modalA)

    expect(trapFocusStep(tree, layout as any, [0], 'next')).toBe(true)
    const second = focusedElement.peek()
    expect(second?.element).toBe(modalB)

    expect(trapFocusStep(tree, layout as any, [0], 'next')).toBe(true)
    const wrapped = focusedElement.peek()
    expect(wrapped?.element).toBe(modalA)
    expect(wrapped?.element).not.toBe(outside)
  })
})

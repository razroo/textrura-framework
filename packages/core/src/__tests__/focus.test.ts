import { describe, it, expect, beforeEach } from 'vitest'
import { box, text, image } from '../elements.js'
import {
  focusedElement,
  setFocus,
  clearFocus,
  collectFocusOrder,
  focusNext,
  focusPrev,
  resolveFocusedTarget,
} from '../focus.js'
import type { ComputedLayout } from 'textura'
import type { BoxElement } from '../types.js'

function makeLayout(overrides: Partial<ComputedLayout> = {}): ComputedLayout {
  return { x: 0, y: 0, width: 100, height: 100, children: [], ...overrides }
}

describe('setFocus / clearFocus', () => {
  beforeEach(() => clearFocus())

  it('setFocus updates the focusedElement signal', () => {
    const el = box({ width: 10, height: 10, onClick: () => {} })
    const layout = makeLayout()
    setFocus(el, layout)
    const current = focusedElement.peek()
    expect(current).not.toBeNull()
    expect(current!.element).toBe(el)
    expect(current!.layout).toBe(layout)
  })

  it('clearFocus resets to null', () => {
    const el = box({ width: 10, height: 10, onClick: () => {} })
    setFocus(el, makeLayout())
    clearFocus()
    expect(focusedElement.peek()).toBeNull()
  })
})

describe('collectFocusOrder', () => {
  beforeEach(() => clearFocus())

  it('returns empty array for tree with no focusable elements', () => {
    const root = box({ width: 200, height: 200 }, [
      box({ width: 50, height: 50 }),
    ])
    const layout = {
      ...makeLayout({ width: 200, height: 200 }),
      children: [makeLayout({ width: 50, height: 50 })],
    }
    expect(collectFocusOrder(root, layout)).toEqual([])
  })

  it('includes boxes with onClick', () => {
    const btn = box({ width: 50, height: 30, onClick: () => {} })
    const root = box({ width: 200, height: 100 }, [btn])
    const layout = {
      ...makeLayout({ width: 200, height: 100 }),
      children: [makeLayout({ width: 50, height: 30 })],
    }
    const order = collectFocusOrder(root, layout)
    expect(order).toHaveLength(1)
    expect(order[0]!.element).toBe(btn)
  })

  it('includes boxes with onKeyDown or onKeyUp', () => {
    const a = box({ width: 10, height: 10, onKeyDown: () => {} })
    const b = box({ width: 10, height: 10, onKeyUp: () => {} })
    const root = box({ width: 100, height: 100 }, [a, b])
    const layout = {
      ...makeLayout(),
      children: [makeLayout({ width: 10, height: 10 }), makeLayout({ x: 20, width: 10, height: 10 })],
    }
    const order = collectFocusOrder(root, layout)
    expect(order).toHaveLength(2)
    expect(order[0]!.element).toBe(a)
    expect(order[1]!.element).toBe(b)
  })

  it('includes boxes with composition handlers', () => {
    const el = box({ width: 10, height: 10, onCompositionStart: () => {} })
    const root = box({ width: 100, height: 100 }, [el])
    const layout = {
      ...makeLayout(),
      children: [makeLayout({ width: 10, height: 10 })],
    }
    const order = collectFocusOrder(root, layout)
    expect(order).toHaveLength(1)
    expect(order[0]!.element).toBe(el)
  })

  it('returns elements in document order (depth-first)', () => {
    const deepChild = box({ width: 10, height: 10, onClick: () => {} })
    const mid = box({ width: 40, height: 40 }, [deepChild])
    const sibling = box({ width: 30, height: 30, onClick: () => {} })
    const root = box({ width: 200, height: 200 }, [mid, sibling])
    const layout = {
      ...makeLayout({ width: 200, height: 200 }),
      children: [
        { ...makeLayout({ width: 40, height: 40 }), children: [makeLayout({ width: 10, height: 10 })] },
        makeLayout({ x: 50, width: 30, height: 30 }),
      ],
    }
    const order = collectFocusOrder(root, layout)
    expect(order).toHaveLength(2)
    expect(order[0]!.element).toBe(deepChild)
    expect(order[1]!.element).toBe(sibling)
  })

  it('skips text and image elements', () => {
    const txt = text({ text: 'hi', font: '14px sans', lineHeight: 18, width: 50, height: 18 })
    const img = image({ src: 'a.png', width: 50, height: 50 })
    const btn = box({ width: 50, height: 30, onClick: () => {} })
    const root = box({ width: 200, height: 100 }, [txt, img, btn])
    const layout = {
      ...makeLayout({ width: 200, height: 100 }),
      children: [
        makeLayout({ width: 50, height: 18 }),
        makeLayout({ x: 60, width: 50, height: 50 }),
        makeLayout({ x: 120, width: 50, height: 30 }),
      ],
    }
    const order = collectFocusOrder(root, layout)
    expect(order).toHaveLength(1)
    expect(order[0]!.element).toBe(btn)
  })
})

describe('focusNext', () => {
  beforeEach(() => clearFocus())

  it('focuses the first focusable element when nothing is focused', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [a, b])
    const layout = {
      ...makeLayout(),
      children: [makeLayout({ width: 10, height: 10 }), makeLayout({ x: 20, width: 10, height: 10 })],
    }

    focusNext(root, layout)
    expect(focusedElement.peek()!.element).toBe(a)
  })

  it('advances to the next focusable element', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [a, b])
    const layout = {
      ...makeLayout(),
      children: [makeLayout({ width: 10, height: 10 }), makeLayout({ x: 20, width: 10, height: 10 })],
    }

    focusNext(root, layout)
    focusNext(root, layout)
    expect(focusedElement.peek()!.element).toBe(b)
  })

  it('wraps around from last to first', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [a, b])
    const layout = {
      ...makeLayout(),
      children: [makeLayout({ width: 10, height: 10 }), makeLayout({ x: 20, width: 10, height: 10 })],
    }

    focusNext(root, layout)
    focusNext(root, layout)
    focusNext(root, layout)
    expect(focusedElement.peek()!.element).toBe(a)
  })

  it('is a no-op on an empty focus order', () => {
    const root = box({ width: 100, height: 100 })
    const layout = makeLayout()
    focusNext(root, layout)
    expect(focusedElement.peek()).toBeNull()
  })

  it('works with a single focusable element (wraps to itself)', () => {
    const only = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [only])
    const layout = { ...makeLayout(), children: [makeLayout({ width: 10, height: 10 })] }

    focusNext(root, layout)
    expect(focusedElement.peek()!.element).toBe(only)
    focusNext(root, layout)
    expect(focusedElement.peek()!.element).toBe(only)
  })

  it('sets focusIndex on the result', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [a, b])
    const layout = {
      ...makeLayout(),
      children: [makeLayout({ width: 10, height: 10 }), makeLayout({ x: 20, width: 10, height: 10 })],
    }

    focusNext(root, layout)
    expect(focusedElement.peek()!.focusIndex).toBe(0)
    focusNext(root, layout)
    expect(focusedElement.peek()!.focusIndex).toBe(1)
  })
})

describe('focusPrev', () => {
  beforeEach(() => clearFocus())

  it('focuses the last focusable element when nothing is focused', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [a, b])
    const layout = {
      ...makeLayout(),
      children: [makeLayout({ width: 10, height: 10 }), makeLayout({ x: 20, width: 10, height: 10 })],
    }

    focusPrev(root, layout)
    expect(focusedElement.peek()!.element).toBe(b)
  })

  it('moves backward through focusable elements', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onClick: () => {} })
    const c = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [a, b, c])
    const layout = {
      ...makeLayout(),
      children: [
        makeLayout({ width: 10, height: 10 }),
        makeLayout({ x: 20, width: 10, height: 10 }),
        makeLayout({ x: 40, width: 10, height: 10 }),
      ],
    }

    focusNext(root, layout)
    focusNext(root, layout)
    focusNext(root, layout)
    expect(focusedElement.peek()!.element).toBe(c)

    focusPrev(root, layout)
    expect(focusedElement.peek()!.element).toBe(b)

    focusPrev(root, layout)
    expect(focusedElement.peek()!.element).toBe(a)
  })

  it('wraps around from first to last', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [a, b])
    const layout = {
      ...makeLayout(),
      children: [makeLayout({ width: 10, height: 10 }), makeLayout({ x: 20, width: 10, height: 10 })],
    }

    focusNext(root, layout)
    expect(focusedElement.peek()!.element).toBe(a)
    focusPrev(root, layout)
    expect(focusedElement.peek()!.element).toBe(b)
  })

  it('is a no-op on an empty focus order', () => {
    const root = box({ width: 100, height: 100 })
    const layout = makeLayout()
    focusPrev(root, layout)
    expect(focusedElement.peek()).toBeNull()
  })

  it('sets focusIndex on the result', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [a, b])
    const layout = {
      ...makeLayout(),
      children: [makeLayout({ width: 10, height: 10 }), makeLayout({ x: 20, width: 10, height: 10 })],
    }

    focusPrev(root, layout)
    expect(focusedElement.peek()!.focusIndex).toBe(1)
    focusPrev(root, layout)
    expect(focusedElement.peek()!.focusIndex).toBe(0)
  })
})

describe('resolveFocusedTarget', () => {
  beforeEach(() => clearFocus())

  it('returns null when nothing is focused', () => {
    const root = box({ width: 100, height: 100 }, [
      box({ width: 10, height: 10, onClick: () => {} }),
    ])
    const layout = { ...makeLayout(), children: [makeLayout({ width: 10, height: 10 })] }
    expect(resolveFocusedTarget(root, layout)).toBeNull()
  })

  it('returns null when tree has no focusable elements', () => {
    const el = box({ width: 10, height: 10, onClick: () => {} })
    setFocus(el, makeLayout({ width: 10, height: 10 }))

    const root = box({ width: 100, height: 100 })
    const layout = makeLayout()
    expect(resolveFocusedTarget(root, layout)).toBeNull()
  })

  it('resolves by element identity when same reference persists', () => {
    const btn = box({ width: 50, height: 30, onClick: () => {} })
    const root = box({ width: 200, height: 100 }, [btn])
    const layout = { ...makeLayout({ width: 200, height: 100 }), children: [makeLayout({ width: 50, height: 30 })] }

    setFocus(btn, makeLayout({ width: 50, height: 30 }))
    const resolved = resolveFocusedTarget(root, layout)
    expect(resolved).not.toBeNull()
    expect(resolved!.element).toBe(btn)
  })

  it('resolves by bounds when element identity changes (rerender)', () => {
    const oldBtn = box({ width: 50, height: 30, onClick: () => {} })
    setFocus(oldBtn, makeLayout({ x: 10, y: 20, width: 50, height: 30 }))

    const newBtn = box({ width: 50, height: 30, onClick: () => {} })
    const root = box({ width: 200, height: 100 }, [newBtn])
    const layout = {
      ...makeLayout({ width: 200, height: 100 }),
      children: [makeLayout({ x: 10, y: 20, width: 50, height: 30 })],
    }

    const resolved = resolveFocusedTarget(root, layout)
    expect(resolved).not.toBeNull()
    expect(resolved!.element).toBe(newBtn)
  })

  it('returns null when focused element no longer matches any target', () => {
    const removed = box({ width: 50, height: 30, onClick: () => {} })
    setFocus(removed, makeLayout({ x: 999, y: 999, width: 50, height: 30 }))

    const other = box({ width: 60, height: 40, onClick: () => {} })
    const root = box({ width: 200, height: 100 }, [other])
    const layout = {
      ...makeLayout({ width: 200, height: 100 }),
      children: [makeLayout({ x: 10, y: 10, width: 60, height: 40 })],
    }

    const resolved = resolveFocusedTarget(root, layout)
    expect(resolved).toBeNull()
  })

  it('uses focusIndex for fast path when available and in range', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [a, b])
    const layout = {
      ...makeLayout(),
      children: [makeLayout({ width: 10, height: 10 }), makeLayout({ x: 20, width: 10, height: 10 })],
    }

    focusNext(root, layout)
    focusNext(root, layout)
    expect(focusedElement.peek()!.focusIndex).toBe(1)

    const resolved = resolveFocusedTarget(root, layout)
    expect(resolved).not.toBeNull()
    expect(resolved!.element).toBe(b)
    expect(resolved!.focusIndex).toBe(1)
  })

  it('updates focusedElement signal when resolved target differs', () => {
    const oldBtn = box({ width: 50, height: 30, onClick: () => {} })
    setFocus(oldBtn, makeLayout({ x: 10, y: 20, width: 50, height: 30 }))

    const newBtn = box({ width: 50, height: 30, onClick: () => {} })
    const root = box({ width: 200, height: 100 }, [newBtn])
    const layout = {
      ...makeLayout({ width: 200, height: 100 }),
      children: [makeLayout({ x: 10, y: 20, width: 50, height: 30 })],
    }

    resolveFocusedTarget(root, layout)
    const current = focusedElement.peek()
    expect(current!.element).toBe(newBtn)
  })
})

describe('focusNext / focusPrev interaction', () => {
  beforeEach(() => clearFocus())

  it('Tab then Shift+Tab returns to the same element', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onClick: () => {} })
    const c = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [a, b, c])
    const layout = {
      ...makeLayout(),
      children: [
        makeLayout({ width: 10, height: 10 }),
        makeLayout({ x: 15, width: 10, height: 10 }),
        makeLayout({ x: 30, width: 10, height: 10 }),
      ],
    }

    focusNext(root, layout)
    focusNext(root, layout)
    expect(focusedElement.peek()!.element).toBe(b)
    focusPrev(root, layout)
    expect(focusedElement.peek()!.element).toBe(a)
    focusNext(root, layout)
    expect(focusedElement.peek()!.element).toBe(b)
  })

  it('full cycle: Tab through all then Shift+Tab back through all', () => {
    const items: BoxElement[] = []
    for (let i = 0; i < 4; i++) {
      items.push(box({ width: 10, height: 10, onClick: () => {} }))
    }
    const root = box({ width: 100, height: 100 }, items)
    const layout = {
      ...makeLayout(),
      children: items.map((_, i) => makeLayout({ x: i * 15, width: 10, height: 10 })),
    }

    for (let i = 0; i < 4; i++) {
      focusNext(root, layout)
      expect(focusedElement.peek()!.element).toBe(items[i])
    }

    focusNext(root, layout)
    expect(focusedElement.peek()!.element).toBe(items[0])

    for (let i = 3; i >= 0; i--) {
      focusPrev(root, layout)
      expect(focusedElement.peek()!.element).toBe(items[i])
    }
  })
})

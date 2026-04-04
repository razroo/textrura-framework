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

  it('includes pointerEvents none boxes (Tab order is not filtered like pointer hit-testing)', () => {
    const kb = box({ width: 10, height: 10, pointerEvents: 'none', onKeyDown: () => {} })
    const clickOnly = box({ width: 10, height: 10, pointerEvents: 'none', onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [kb, clickOnly])
    const layout = {
      ...makeLayout(),
      children: [
        makeLayout({ width: 10, height: 10 }),
        makeLayout({ x: 20, width: 10, height: 10 }),
      ],
    }
    const order = collectFocusOrder(root, layout)
    expect(order.map(t => t.element)).toEqual([kb, clickOnly])
  })

  it('uses source child order for Tab, not z-index paint order (differs from pointer hit-testing)', () => {
    const backVisually = box({ width: 50, height: 50, zIndex: 0, onClick: () => {} })
    const frontVisually = box({ width: 50, height: 50, zIndex: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [backVisually, frontVisually])
    const layout = {
      ...makeLayout({ width: 100, height: 100 }),
      children: [
        makeLayout({ width: 50, height: 50 }),
        makeLayout({ x: 0, y: 0, width: 50, height: 50 }),
      ],
    }
    const order = collectFocusOrder(root, layout)
    expect(order.map(t => t.element)).toEqual([backVisually, frontVisually])
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

  it('skips focusables when root layout bounds are corrupt (non-finite or negative size)', () => {
    const el = box({ width: 10, height: 10, onClick: () => {} })
    const base = makeLayout({ width: 10, height: 10 })
    for (const bad of [
      { ...base, x: Number.NaN },
      { ...base, width: Number.POSITIVE_INFINITY },
      { ...base, width: -1 },
      { ...base, height: Number.NEGATIVE_INFINITY },
    ] as const) {
      expect(collectFocusOrder(el, bad)).toEqual([])
    }
  })

  it('skips focusables when root layout has BigInt bounds without throwing (layoutBoundsAreFinite parity)', () => {
    const el = box({ width: 10, height: 10, onClick: () => {} })
    const base = makeLayout({ width: 10, height: 10 })
    const b = BigInt(0)
    expect(collectFocusOrder(el, { ...base, x: b } as unknown as ComputedLayout)).toEqual([])
    expect(collectFocusOrder(el, { ...base, y: b } as unknown as ComputedLayout)).toEqual([])
    expect(collectFocusOrder(el, { ...base, width: b } as unknown as ComputedLayout)).toEqual([])
    expect(collectFocusOrder(el, { ...base, height: b } as unknown as ComputedLayout)).toEqual([])
  })

  it('does not descend into children when parent layout bounds are corrupt', () => {
    const child = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [child])
    const layout = {
      ...makeLayout({ width: Number.NaN, height: 100 }),
      children: [makeLayout({ width: 10, height: 10 })],
    }
    expect(collectFocusOrder(root, layout)).toEqual([])
  })

  it('skips a sibling with corrupt layout but still collects a valid later sibling', () => {
    const bad = box({ width: 40, height: 40, onClick: () => {} })
    const good = box({ width: 40, height: 40, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [bad, good])
    const layout = {
      ...makeLayout(),
      children: [
        { ...makeLayout({ width: 40, height: 40 }), width: Number.NaN, height: 40 },
        makeLayout({ x: 50, width: 40, height: 40 }),
      ],
    }
    const order = collectFocusOrder(root, layout)
    expect(order).toHaveLength(1)
    expect(order[0]!.element).toBe(good)
  })

  it('skips a missing child layout slot (sparse children array) but still collects a later sibling', () => {
    const first = box({ width: 40, height: 40, onClick: () => {} })
    const second = box({ width: 40, height: 40, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [first, second])
    const sparseChildren: ComputedLayout[] = []
    sparseChildren[1] = makeLayout({ x: 50, width: 40, height: 40 })
    const layout: ComputedLayout = {
      ...makeLayout({ width: 100, height: 100 }),
      children: sparseChildren,
    }
    expect(layout.children).toHaveLength(2)
    expect(layout.children[0]).toBeUndefined()

    expect(() => collectFocusOrder(root, layout)).not.toThrow()
    const order = collectFocusOrder(root, layout)
    expect(order).toHaveLength(1)
    expect(order[0]!.element).toBe(second)
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

  it('is a no-op when root layout has BigInt bounds (no valid focus order)', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [a])
    const layout = {
      ...makeLayout({ width: 100, height: 100 }),
      children: [makeLayout({ width: 10, height: 10 })],
    }
    const badRoot = { ...layout, width: BigInt(100) } as unknown as ComputedLayout
    focusNext(root, badRoot)
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

  it('returns null when current layout yields no focusables due to BigInt root bounds without throwing', () => {
    const el = box({ width: 10, height: 10, onClick: () => {} })
    setFocus(el, makeLayout({ width: 10, height: 10 }))
    const root = box({ width: 10, height: 10, onClick: () => {} })
    const badLayout = {
      x: BigInt(0),
      y: 0,
      width: 10,
      height: 10,
      children: [],
    } as unknown as ComputedLayout
    expect(resolveFocusedTarget(root, badLayout)).toBeNull()
  })

  it('returns null for corrupt root layout without clearing focusedElement (stale target preserved for retry)', () => {
    const el = box({ width: 10, height: 10, onClick: () => {} })
    setFocus(el, makeLayout({ width: 10, height: 10 }))
    const before = focusedElement.peek()

    const root = box({ width: 10, height: 10, onClick: () => {} })
    const badLayout = {
      x: Number.NaN,
      y: 0,
      width: 10,
      height: 10,
      children: [],
    } as ComputedLayout

    expect(resolveFocusedTarget(root, badLayout)).toBeNull()
    expect(focusedElement.peek()).toBe(before)
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

  it('ignores focusIndex when tab order changes but the focus list length stays the same', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [b, a])
    const layoutA = makeLayout({ width: 10, height: 10 })
    const layoutB = makeLayout({ x: 20, width: 10, height: 10 })
    const layoutSwapped = {
      ...makeLayout(),
      children: [layoutB, layoutA],
    }

    focusedElement.set({ element: b, layout: layoutB, focusIndex: 1 })
    const resolved = resolveFocusedTarget(root, layoutSwapped)
    expect(resolved).not.toBeNull()
    expect(resolved!.element).toBe(b)
    expect(resolved!.focusIndex).toBe(0)
  })

  it('focusNext falls back from stale focusIndex after sibling reorder', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onClick: () => {} })
    const root = box({ width: 100, height: 100 }, [b, a])
    const layoutA = makeLayout({ width: 10, height: 10 })
    const layoutB = makeLayout({ x: 20, width: 10, height: 10 })
    const layoutSwapped = {
      ...makeLayout(),
      children: [layoutB, layoutA],
    }

    focusedElement.set({ element: b, layout: layoutB, focusIndex: 1 })
    focusNext(root, layoutSwapped)
    expect(focusedElement.peek()!.element).toBe(a)
    expect(focusedElement.peek()!.focusIndex).toBe(1)
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

import { describe, it, expect } from 'vitest'
import { dispatchHit, getCursorAtPoint, hasInteractiveHitAtPoint, hitPathAtPoint } from '../hit-test.js'
import { box } from '../elements.js'

describe('dispatchHit', () => {
  it('hit inside a box fires handler', () => {
    let fired = false
    const el = box({ width: 100, height: 50, onClick: () => { fired = true } })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }

    const result = dispatchHit(el, layout, 'onClick', 50, 25)
    expect(result.handled).toBe(true)
    expect(fired).toBe(true)
  })

  it('hit outside returns false', () => {
    let fired = false
    const el = box({ width: 100, height: 50, onClick: () => { fired = true } })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }

    const result = dispatchHit(el, layout, 'onClick', 200, 200)
    expect(result.handled).toBe(false)
    expect(fired).toBe(false)
  })

  it('hit on bottom-right inclusive edge fires handler', () => {
    let fired = false
    const el = box({ width: 100, height: 50, onClick: () => { fired = true } })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }

    const result = dispatchHit(el, layout, 'onClick', 100, 50)
    expect(result.handled).toBe(true)
    expect(fired).toBe(true)
  })

  it('zero-size box: only the origin corner is inside', () => {
    let fired = false
    const el = box({ width: 0, height: 0, onClick: () => { fired = true } })
    const layout = { x: 10, y: 20, width: 0, height: 0, children: [] }

    expect(dispatchHit(el, layout, 'onClick', 10, 20).handled).toBe(true)
    expect(fired).toBe(true)

    fired = false
    expect(dispatchHit(el, layout, 'onClick', 11, 20).handled).toBe(false)
    expect(fired).toBe(false)
  })

  it('nested boxes: deepest handler fires first', () => {
    const log: string[] = []
    const child = box(
      { width: 40, height: 40, onClick: () => { log.push('child') } },
    )
    const parent = box(
      { width: 100, height: 100, onClick: () => { log.push('parent') } },
      [child],
    )
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }

    dispatchHit(parent, layout, 'onClick', 20, 20)
    // Deepest handler fires; only one handler fires per dispatch
    expect(log).toEqual(['child'])
  })

  it('provides target-local pointer coordinates to handlers', () => {
    let localX = -1
    let localY = -1
    const child = box({
      width: 40,
      height: 30,
      onClick: (e) => {
        localX = e.localX ?? -1
        localY = e.localY ?? -1
      },
    })
    const parent = box({ width: 120, height: 80 }, [child])
    const layout = {
      x: 5, y: 10, width: 120, height: 80,
      children: [
        { x: 7, y: 9, width: 40, height: 30, children: [] },
      ],
    }

    dispatchHit(parent, layout, 'onClick', 20, 30)
    expect(localX).toBe(8)
    expect(localY).toBe(11)
  })

  it('click returns focus target for key-only focusable boxes', () => {
    const el = box({ width: 100, height: 50, onKeyDown: () => undefined })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }

    const result = dispatchHit(el, layout, 'onClick', 50, 25)
    expect(result.handled).toBe(false)
    expect(result.focusTarget?.element).toBe(el)
  })

  it('click returns focus target for composition-only focusable boxes', () => {
    const el = box({ width: 100, height: 50, onCompositionStart: () => undefined })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }

    const result = dispatchHit(el, layout, 'onClick', 50, 25)
    expect(result.handled).toBe(false)
    expect(result.focusTarget?.element).toBe(el)
  })

  it('merges extra fields into the hit event', () => {
    let received: Record<string, unknown> | null = null
    const el = box({
      width: 100,
      height: 50,
      onClick: (e) => { received = e as Record<string, unknown> },
    })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }

    dispatchHit(el, layout, 'onClick', 50, 25, { button: 2, shiftKey: true })
    expect(received?.button).toBe(2)
    expect(received?.shiftKey).toBe(true)
    expect(received?.localX).toBe(50)
    expect(received?.localY).toBe(25)
  })

  it('overlapping siblings: higher z-index wins (matches paint order)', () => {
    const log: string[] = []
    const back = box(
      { width: 50, height: 50, zIndex: 0, onClick: () => { log.push('back') } },
    )
    const front = box(
      { width: 50, height: 50, zIndex: 10, onClick: () => { log.push('front') } },
    )
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['front'])
  })

  it('overlapping siblings: negative z-index still stacks below a higher sibling', () => {
    const log: string[] = []
    const back = box(
      { width: 50, height: 50, zIndex: -2, onClick: () => { log.push('back') } },
    )
    const front = box(
      { width: 50, height: 50, zIndex: -1, onClick: () => { log.push('front') } },
    )
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['front'])
  })

  it('overlapping siblings: equal z-index ties break to later sibling (stable paint order)', () => {
    const log: string[] = []
    const first = box(
      { width: 50, height: 50, zIndex: 1, onClick: () => { log.push('first') } },
    )
    const second = box(
      { width: 50, height: 50, zIndex: 1, onClick: () => { log.push('second') } },
    )
    const root = box({ width: 100, height: 100 }, [first, second])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['second'])
  })

  it('nested boxes: deepest onPointerDown fires first', () => {
    const log: string[] = []
    const child = box(
      { width: 40, height: 40, onPointerDown: () => { log.push('child') } },
    )
    const parent = box(
      { width: 100, height: 100, onPointerDown: () => { log.push('parent') } },
      [child],
    )
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }

    dispatchHit(parent, layout, 'onPointerDown', 20, 20)
    expect(log).toEqual(['child'])
  })

  it('nested boxes: both onClick — focus target is the deepest handler', () => {
    const child = box({ width: 40, height: 40, onClick: () => undefined })
    const parent = box({ width: 100, height: 100, onClick: () => undefined }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }

    const result = dispatchHit(parent, layout, 'onClick', 20, 20)
    expect(result.handled).toBe(true)
    expect(result.focusTarget?.element).toBe(child)
  })

  it('nested boxes: child is key-only focusable, parent onClick — parent handler runs and receives focus target', () => {
    const child = box({ width: 40, height: 40, onKeyDown: () => undefined })
    const parent = box({ width: 100, height: 100, onClick: () => undefined }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }

    const result = dispatchHit(parent, layout, 'onClick', 20, 20)
    expect(result.handled).toBe(true)
    expect(result.focusTarget?.element).toBe(parent)
  })

  it('nested boxes: child onClick only — click-to-focus targets child even without key handlers', () => {
    const child = box({ width: 40, height: 40, onClick: () => undefined })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }

    const result = dispatchHit(parent, layout, 'onClick', 20, 20)
    expect(result.handled).toBe(true)
    expect(result.focusTarget?.element).toBe(child)
  })
})

describe('hitPathAtPoint', () => {
  it('returns child index path for nested boxes', () => {
    const child = box({ width: 40, height: 40 })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }
    expect(hitPathAtPoint(parent, layout, 20, 20)).toEqual([0])
  })

  it('returns null when point misses root', () => {
    const el = box({ width: 10, height: 10 })
    const layout = { x: 0, y: 0, width: 10, height: 10, children: [] }
    expect(hitPathAtPoint(el, layout, 99, 99)).toBe(null)
  })

  it('returns empty path for root-only hit', () => {
    const el = box({ width: 50, height: 50 })
    const layout = { x: 0, y: 0, width: 50, height: 50, children: [] }
    expect(hitPathAtPoint(el, layout, 10, 10)).toEqual([])
  })

  it('overlapping siblings: path prefers higher z-index child', () => {
    const back = box({ width: 40, height: 40, zIndex: 0 })
    const front = box({ width: 40, height: 40, zIndex: 5 })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }
    expect(hitPathAtPoint(root, layout, 5, 5)).toEqual([1])
  })

  it('overlapping siblings: prefers less-negative z-index over deeper negative', () => {
    const back = box({ width: 40, height: 40, zIndex: -5 })
    const front = box({ width: 40, height: 40, zIndex: -1 })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }
    expect(hitPathAtPoint(root, layout, 5, 5)).toEqual([1])
  })

  it('overlapping siblings: equal z-index prefers later child index', () => {
    const a = box({ width: 40, height: 40, zIndex: 2 })
    const b = box({ width: 40, height: 40, zIndex: 2 })
    const root = box({ width: 100, height: 100 }, [a, b])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }
    expect(hitPathAtPoint(root, layout, 5, 5)).toEqual([1])
  })
})

describe('getCursorAtPoint', () => {
  it('returns cursor prop from deepest element', () => {
    const child = box({ width: 40, height: 40, cursor: 'pointer' })
    const parent = box({ width: 100, height: 100, cursor: 'default' }, [child])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }

    const cursor = getCursorAtPoint(parent, layout, 20, 20)
    expect(cursor).toBe('pointer')
  })

  it('returns null when no cursor set', () => {
    const el = box({ width: 100, height: 50 })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }

    const cursor = getCursorAtPoint(el, layout, 50, 25)
    expect(cursor).toBeNull()
  })

  it('overlapping siblings: uses cursor from higher z-index', () => {
    const back = box({ width: 40, height: 40, zIndex: 0, cursor: 'default' })
    const front = box({ width: 40, height: 40, zIndex: 2, cursor: 'pointer' })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }
    expect(getCursorAtPoint(root, layout, 5, 5)).toBe('pointer')
  })

  it('overlapping siblings: cursor from less-negative z-index wins', () => {
    const back = box({ width: 40, height: 40, zIndex: -3, cursor: 'default' })
    const front = box({ width: 40, height: 40, zIndex: -1, cursor: 'pointer' })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }
    expect(getCursorAtPoint(root, layout, 5, 5)).toBe('pointer')
  })

  it('overlapping siblings: equal z-index uses cursor from later sibling', () => {
    const first = box({ width: 40, height: 40, zIndex: 0, cursor: 'default' })
    const second = box({ width: 40, height: 40, zIndex: 0, cursor: 'text' })
    const root = box({ width: 100, height: 100 }, [first, second])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }
    expect(getCursorAtPoint(root, layout, 5, 5)).toBe('text')
  })

  it('uses child cursor under horizontal scroll offset', () => {
    const child = box({ width: 50, height: 50, cursor: 'crosshair' })
    const parent = box({ width: 100, height: 100, overflow: 'scroll', scrollX: 30 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 40, y: 25, width: 50, height: 50, children: [] }],
    }
    // Child absX = 0 - 30 + 40 = 10; point (35, 50) lies inside the child
    expect(getCursorAtPoint(parent, layout, 35, 50)).toBe('crosshair')
  })

  it('uses child cursor under vertical scroll offset', () => {
    const child = box({ width: 50, height: 50, cursor: 'grab' })
    const parent = box({ width: 100, height: 100, overflow: 'scroll', scrollY: 25 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 20, y: 40, width: 50, height: 50, children: [] }],
    }
    // Child absY = 0 - 25 + 40 = 15; point (35, 35) lies inside the child
    expect(getCursorAtPoint(parent, layout, 35, 35)).toBe('grab')
  })
})

describe('scroll and overflow clipping', () => {
  it('overflow scroll: pointer outside parent bounds hits nothing', () => {
    let childFired = false
    let parentFired = false
    const child = box({ width: 50, height: 50, onClick: () => { childFired = true } })
    const parent = box(
      { width: 100, height: 100, overflow: 'scroll', onClick: () => { parentFired = true } },
      [child],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 50, height: 50, children: [] }],
    }

    dispatchHit(parent, layout, 'onClick', 150, 50)
    expect(childFired).toBe(false)
    expect(parentFired).toBe(false)
    expect(hitPathAtPoint(parent, layout, 150, 50)).toBe(null)
    expect(hasInteractiveHitAtPoint(parent, layout, 150, 50)).toBe(false)
    expect(getCursorAtPoint(parent, layout, 150, 50)).toBeNull()
  })

  it('overflow scroll: pointer inside parent still hits stacked children', () => {
    let childFired = false
    const child = box({ width: 50, height: 50, onClick: () => { childFired = true } })
    const parent = box({ width: 100, height: 100, overflow: 'scroll' }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 50, height: 50, children: [] }],
    }

    dispatchHit(parent, layout, 'onClick', 25, 25)
    expect(childFired).toBe(true)
    expect(hitPathAtPoint(parent, layout, 25, 25)).toEqual([0])
  })

  it('scrollY shifts child bounds; localY matches scrolled content', () => {
    let localY = -1
    const child = box({
      width: 100,
      height: 50,
      onClick: (e) => { localY = e.localY ?? -999 },
    })
    const parent = box({ width: 100, height: 100, overflow: 'scroll', scrollY: 40 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 80, width: 100, height: 50, children: [] }],
    }

    // Child absY = parentAbsY - scrollY + layout.y = 0 - 40 + 80 = 40
    dispatchHit(parent, layout, 'onClick', 50, 45)
    expect(localY).toBe(5)
  })

  it('scrollX shifts child bounds; localX matches scrolled content', () => {
    let localX = -1
    const child = box({
      width: 50,
      height: 100,
      onClick: (e) => { localX = e.localX ?? -999 },
    })
    const parent = box({ width: 100, height: 100, overflow: 'scroll', scrollX: 40 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 80, y: 0, width: 50, height: 100, children: [] }],
    }

    // Child absX = parentAbsX - scrollX + layout.x = 0 - 40 + 80 = 40
    dispatchHit(parent, layout, 'onClick', 45, 50)
    expect(localX).toBe(5)
  })

  it('hitPathAtPoint resolves path under scrollX', () => {
    const child = box({ width: 50, height: 50 })
    const parent = box({ width: 100, height: 100, overflow: 'scroll', scrollX: 40 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 80, y: 0, width: 50, height: 50, children: [] }],
    }
    expect(hitPathAtPoint(parent, layout, 45, 25)).toEqual([0])
  })

  it('hitPathAtPoint respects higher z-index when scrolling siblings', () => {
    const back = box({ width: 40, height: 40, zIndex: 0 })
    const front = box({ width: 40, height: 40, zIndex: 3 })
    const parent = box({ width: 100, height: 100, overflow: 'scroll', scrollY: 10 }, [back, front])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }
    expect(hitPathAtPoint(parent, layout, 5, 5)).toEqual([1])
  })
})

describe('overflow hidden clipping', () => {
  it('overflow hidden: pointer outside parent bounds hits nothing', () => {
    let childFired = false
    let parentFired = false
    const child = box({ width: 50, height: 50, onClick: () => { childFired = true } })
    const parent = box(
      { width: 100, height: 100, overflow: 'hidden', onClick: () => { parentFired = true } },
      [child],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 50, height: 50, children: [] }],
    }

    dispatchHit(parent, layout, 'onClick', 150, 50)
    expect(childFired).toBe(false)
    expect(parentFired).toBe(false)
    expect(hitPathAtPoint(parent, layout, 150, 50)).toBe(null)
    expect(hasInteractiveHitAtPoint(parent, layout, 150, 50)).toBe(false)
    expect(getCursorAtPoint(parent, layout, 150, 50)).toBeNull()
  })

  it('overflow hidden: pointer inside parent still hits children', () => {
    let childFired = false
    const child = box({ width: 50, height: 50, onClick: () => { childFired = true } })
    const parent = box({ width: 100, height: 100, overflow: 'hidden' }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 50, height: 50, children: [] }],
    }

    dispatchHit(parent, layout, 'onClick', 25, 25)
    expect(childFired).toBe(true)
    expect(hitPathAtPoint(parent, layout, 25, 25)).toEqual([0])
  })
})

describe('hasInteractiveHitAtPoint', () => {
  it('detects interactive containers at pointer position', () => {
    const interactive = box({ width: 120, height: 40, onClick: () => undefined })
    const root = box({ width: 200, height: 100 }, [interactive])
    const layout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [{ x: 20, y: 20, width: 120, height: 40, children: [] }],
    }
    expect(hasInteractiveHitAtPoint(root, layout, 30, 30)).toBe(true)
    expect(hasInteractiveHitAtPoint(root, layout, 5, 5)).toBe(false)
  })

  it('detects onPointerDown without onClick', () => {
    const inner = box({ width: 40, height: 40, onPointerDown: () => undefined })
    const root = box({ width: 100, height: 100 }, [inner])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(true)
  })

  it('detects onPointerUp without onClick', () => {
    const inner = box({ width: 40, height: 40, onPointerUp: () => undefined })
    const root = box({ width: 100, height: 100 }, [inner])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(true)
  })

  it('detects onWheel on deepest hit', () => {
    const inner = box({ width: 40, height: 40, onWheel: () => undefined })
    const root = box({ width: 100, height: 100 }, [inner])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    expect(hasInteractiveHitAtPoint(root, layout, 5, 5)).toBe(true)
  })

  it('detects onPointerMove without onClick', () => {
    const inner = box({ width: 40, height: 40, onPointerMove: () => undefined })
    const root = box({ width: 100, height: 100 }, [inner])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(true)
  })

  it('ignores key-only focusable handlers for hover hit-test', () => {
    const inner = box({ width: 40, height: 40, onKeyDown: () => undefined })
    const root = box({ width: 100, height: 100 }, [inner])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(false)
  })

  it('ignores composition-only handlers for hover hit-test', () => {
    const inner = box({ width: 40, height: 40, onCompositionStart: () => undefined })
    const root = box({ width: 100, height: 100 }, [inner])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(false)
  })
})

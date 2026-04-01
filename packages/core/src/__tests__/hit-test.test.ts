import { describe, it, expect } from 'vitest'
import { dispatchHit, getCursorAtPoint, hasInteractiveHitAtPoint, hitPathAtPoint } from '../hit-test.js'
import { box, image, text } from '../elements.js'
import type { HitEvent, KeyboardHitEvent } from '../types.js'

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

  it('merges extra metadata onto the HitEvent after base pointer fields', () => {
    let received: HitEvent | undefined
    const layout = { x: 10, y: 20, width: 100, height: 50, children: [] }
    const el = box({
      width: 100,
      height: 50,
      onPointerDown: e => {
        received = e
      },
    })

    dispatchHit(el, layout, 'onPointerDown', 50, 40, {
      button: 2,
      shiftKey: true,
      buttons: 4,
    })

    expect(received).toBeDefined()
    expect(received!.x).toBe(50)
    expect(received!.y).toBe(40)
    expect(received!.localX).toBe(40)
    expect(received!.localY).toBe(20)
    expect(received!.target).toBe(layout)
    expect((received as HitEvent & { button: number }).button).toBe(2)
    expect((received as HitEvent & { shiftKey: boolean }).shiftKey).toBe(true)
    expect((received as HitEvent & { buttons: number }).buttons).toBe(4)
  })

  it('applies extra after base HitEvent fields so renderer-supplied keys can override coordinates', () => {
    let received: HitEvent | undefined
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }
    const el = box({
      width: 100,
      height: 50,
      onPointerDown: e => {
        received = e
      },
    })

    dispatchHit(el, layout, 'onPointerDown', 50, 25, {
      x: 1,
      y: 2,
      localX: 3,
      localY: 4,
    })

    expect(received).toBeDefined()
    expect(received!.x).toBe(1)
    expect(received!.y).toBe(2)
    expect(received!.localX).toBe(3)
    expect(received!.localY).toBe(4)
    expect(received!.target).toBe(layout)
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

  it('non-finite pointer coordinates miss dispatch and hit queries', () => {
    let fired = false
    const el = box({ width: 100, height: 50, onClick: () => { fired = true }, cursor: 'pointer' })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }

    expect(dispatchHit(el, layout, 'onClick', NaN, 25).handled).toBe(false)
    expect(dispatchHit(el, layout, 'onClick', 50, NaN).handled).toBe(false)
    expect(dispatchHit(el, layout, 'onClick', Number.POSITIVE_INFINITY, 25).handled).toBe(false)
    expect(dispatchHit(el, layout, 'onClick', 50, Number.POSITIVE_INFINITY).handled).toBe(false)
    expect(dispatchHit(el, layout, 'onClick', Number.NEGATIVE_INFINITY, 25).handled).toBe(false)
    expect(fired).toBe(false)

    expect(hitPathAtPoint(el, layout, NaN, 25)).toBeNull()
    expect(hitPathAtPoint(el, layout, Number.POSITIVE_INFINITY, 25)).toBeNull()
    expect(hitPathAtPoint(el, layout, 50, Number.NEGATIVE_INFINITY)).toBeNull()
    expect(hasInteractiveHitAtPoint(el, layout, NaN, 25)).toBe(false)
    expect(hasInteractiveHitAtPoint(el, layout, Number.POSITIVE_INFINITY, 25)).toBe(false)
    expect(hasInteractiveHitAtPoint(el, layout, 50, Number.NEGATIVE_INFINITY)).toBe(false)
    expect(getCursorAtPoint(el, layout, NaN, 25)).toBeNull()
    expect(getCursorAtPoint(el, layout, Number.POSITIVE_INFINITY, 25)).toBeNull()
    expect(getCursorAtPoint(el, layout, 50, Number.NEGATIVE_INFINITY)).toBeNull()
  })

  it('non-finite layout bounds (NaN or ±Infinity) are a miss for dispatch and hit queries', () => {
    let fired: boolean
    const el = box({
      width: 100,
      height: 50,
      onClick: () => {
        fired = true
      },
      onPointerDown: () => {
        fired = true
      },
      cursor: 'pointer',
    })
    const base = { x: 0, y: 0, width: 100, height: 50, children: [] as const }

    for (const bad of [
      { ...base, x: Number.NaN },
      { ...base, y: Number.NaN },
      { ...base, width: Number.NaN },
      { ...base, height: Number.NaN },
      { ...base, x: Number.POSITIVE_INFINITY },
      { ...base, x: Number.NEGATIVE_INFINITY },
      { ...base, y: Number.POSITIVE_INFINITY },
      { ...base, y: Number.NEGATIVE_INFINITY },
      { ...base, width: Number.POSITIVE_INFINITY },
      { ...base, width: Number.NEGATIVE_INFINITY },
      { ...base, height: Number.POSITIVE_INFINITY },
      { ...base, height: Number.NEGATIVE_INFINITY },
    ] as const) {
      fired = false
      expect(dispatchHit(el, bad, 'onClick', 50, 25).handled).toBe(false)
      expect(fired).toBe(false)
      expect(dispatchHit(el, bad, 'onPointerDown', 50, 25).handled).toBe(false)
      expect(fired).toBe(false)
      expect(hitPathAtPoint(el, bad, 50, 25)).toBeNull()
      expect(hasInteractiveHitAtPoint(el, bad, 50, 25)).toBe(false)
      expect(getCursorAtPoint(el, bad, 50, 25)).toBeNull()
    }
  })

  it('does not treat a child with infinite layout width as covering the parent', () => {
    let childFired = false
    let rootFired = false
    const child = box({ width: 10, height: 10, onClick: () => { childFired = true } })
    const root = box({ width: 100, height: 50, onClick: () => { rootFired = true } }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      children: [{ x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 10, children: [] as const }],
    }

    expect(dispatchHit(root, layout, 'onClick', 5, 5).handled).toBe(true)
    expect(rootFired).toBe(true)
    expect(childFired).toBe(false)
  })

  it('negative finite layout dimensions are a miss for dispatch and hit queries', () => {
    let fired: boolean
    const el = box({
      width: 100,
      height: 50,
      onClick: () => {
        fired = true
      },
      onPointerDown: () => {
        fired = true
      },
      cursor: 'pointer',
    })
    const base = { x: 0, y: 0, width: 100, height: 50, children: [] as const }

    for (const bad of [
      { ...base, width: -1 },
      { ...base, height: -1 },
      { ...base, width: -0.001 },
      { ...base, height: -100 },
    ] as const) {
      fired = false
      expect(dispatchHit(el, bad, 'onClick', 50, 25).handled).toBe(false)
      expect(fired).toBe(false)
      expect(dispatchHit(el, bad, 'onPointerDown', 50, 25).handled).toBe(false)
      expect(fired).toBe(false)
      expect(hitPathAtPoint(el, bad, 50, 25)).toBeNull()
      expect(hasInteractiveHitAtPoint(el, bad, 50, 25)).toBe(false)
      expect(getCursorAtPoint(el, bad, 50, 25)).toBeNull()
    }
  })

  it('does not visit children when parent layout has NaN width (corrupt geometry)', () => {
    let childFired = false
    const child = box({
      width: 10,
      height: 10,
      onClick: () => {
        childFired = true
      },
    })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: Number.NaN,
      height: 100,
      children: [{ x: 0, y: 0, width: 10, height: 10, children: [] as const }],
    }

    dispatchHit(parent, layout, 'onClick', 5, 5)
    expect(childFired).toBe(false)
    expect(hitPathAtPoint(parent, layout, 5, 5)).toBeNull()
  })

  it('does not visit children when parent layout has negative width (corrupt geometry)', () => {
    let childFired = false
    const child = box({
      width: 10,
      height: 10,
      onClick: () => {
        childFired = true
      },
    })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: -50,
      height: 100,
      children: [{ x: 0, y: 0, width: 10, height: 10, children: [] as const }],
    }

    dispatchHit(parent, layout, 'onClick', 5, 5)
    expect(childFired).toBe(false)
    expect(hitPathAtPoint(parent, layout, 5, 5)).toBeNull()
  })

  it('does not visit children when parent layout has negative height (corrupt geometry)', () => {
    let childFired = false
    const child = box({
      width: 10,
      height: 10,
      onClick: () => {
        childFired = true
      },
    })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: -40,
      children: [{ x: 0, y: 0, width: 10, height: 10, children: [] as const }],
    }

    dispatchHit(parent, layout, 'onClick', 5, 5)
    expect(childFired).toBe(false)
    expect(hitPathAtPoint(parent, layout, 5, 5)).toBeNull()
    expect(hasInteractiveHitAtPoint(parent, layout, 5, 5)).toBe(false)
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

  it('fractional pointer coords and subpixel layout hit-test with precise localX/localY', () => {
    let localX = -1
    let localY = -1
    const child = box({
      width: 40,
      height: 30,
      onClick: e => {
        localX = e.localX ?? -1
        localY = e.localY ?? -1
      },
    })
    const parent = box({ width: 120, height: 80 }, [child])
    const layout = {
      x: 5,
      y: 10,
      width: 120,
      height: 80,
      children: [{ x: 7.25, y: 9.5, width: 40, height: 30, children: [] as const }],
    }

    dispatchHit(parent, layout, 'onClick', 20.375, 30.125)
    expect(localX).toBeCloseTo(8.125, 10)
    expect(localY).toBeCloseTo(10.625, 10)

    expect(hitPathAtPoint(parent, layout, 20.375, 30.125)).not.toBeNull()
    expect(hasInteractiveHitAtPoint(parent, layout, 20.375, 30.125)).toBe(true)
  })

  it('inclusive edges accept fractional coordinates at exact width/height', () => {
    let fired = false
    const el = box({ width: 100, height: 50, onClick: () => { fired = true } })
    const layout = { x: 0.25, y: 0.5, width: 100, height: 50, children: [] }

    expect(dispatchHit(el, layout, 'onClick', 100.25, 50.5).handled).toBe(true)
    expect(fired).toBe(true)
  })

  it('merges extra fields onto the HitEvent for pointer handlers', () => {
    type PointerExtras = { button: number; shiftKey: boolean }
    let received: (HitEvent & PointerExtras) | null = null
    const el = box({
      width: 100,
      height: 50,
      onPointerDown: (e) => {
        received = e as HitEvent & PointerExtras
      },
    })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }

    dispatchHit(el, layout, 'onPointerDown', 10, 20, { button: 2, shiftKey: true })
    expect(received).not.toBeNull()
    expect(received!.x).toBe(10)
    expect(received!.y).toBe(20)
    expect(received!.localX).toBe(10)
    expect(received!.localY).toBe(20)
    expect(received!.target).toBe(layout)
    expect(received!.button).toBe(2)
    expect(received!.shiftKey).toBe(true)
  })

  it('click returns focus target for key-only focusable boxes', () => {
    const el = box({ width: 100, height: 50, onKeyDown: () => undefined })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }

    const result = dispatchHit(el, layout, 'onClick', 50, 25)
    expect(result.handled).toBe(false)
    expect(result.focusTarget?.element).toBe(el)
  })

  it('click returns focus target for onKeyUp-only focusable boxes', () => {
    const el = box({ width: 100, height: 50, onKeyUp: () => undefined })
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

  it('click returns focus target for onCompositionUpdate-only focusable boxes', () => {
    const el = box({ width: 100, height: 50, onCompositionUpdate: () => undefined })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }

    const result = dispatchHit(el, layout, 'onClick', 50, 25)
    expect(result.handled).toBe(false)
    expect(result.focusTarget?.element).toBe(el)
  })

  it('click returns focus target for onCompositionEnd-only focusable boxes', () => {
    const el = box({ width: 100, height: 50, onCompositionEnd: () => undefined })
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

  it('overlapping siblings: hit order updates when z-index values change between dispatches', () => {
    const log: string[] = []
    const back = box({
      width: 50,
      height: 50,
      zIndex: 10,
      onClick: () => {
        log.push('back')
      },
    })
    const front = box({
      width: 50,
      height: 50,
      zIndex: 0,
      onClick: () => {
        log.push('front')
      },
    })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['back'])

    log.length = 0
    back.props.zIndex = 0
    front.props.zIndex = 10
    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['front'])
  })

  it('overlapping siblings: missing layout for top z-index still dispatches to sibling behind', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log.push('back') } })
    const front = box({ width: 50, height: 50, zIndex: 10, onClick: () => { log.push('front') } })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 50, height: 50, children: [] }],
    }

    const result = dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['back'])
    expect(result.handled).toBe(true)
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

  it('overlapping siblings: equal z-index top hit updates when child order mutates (cache invalidation)', () => {
    const log: string[] = []
    const first = box(
      { width: 50, height: 50, zIndex: 1, onClick: () => { log.push('first') } },
    )
    const second = box(
      { width: 50, height: 50, zIndex: 1, onClick: () => { log.push('second') } },
    )
    const root = box({ width: 100, height: 100 }, [first, second])
    const layoutBefore = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layoutBefore, 'onClick', 10, 10)
    expect(log).toEqual(['second'])

    log.length = 0
    root.children = [second, first]
    const layoutAfter = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layoutAfter, 'onClick', 10, 10)
    expect(log).toEqual(['first'])

    expect(hitPathAtPoint(root, layoutAfter, 10, 10)).toEqual([1])
  })

  it('overlapping siblings: fractional z-index sorts numerically for dispatch', () => {
    const log: string[] = []
    const low = box({ width: 50, height: 50, zIndex: 1, onClick: () => { log.push('low') } })
    const mid = box({ width: 50, height: 50, zIndex: 1.5, onClick: () => { log.push('mid') } })
    const high = box({ width: 50, height: 50, zIndex: 2, onClick: () => { log.push('high') } })
    const root = box({ width: 100, height: 100 }, [low, mid, high])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['high'])
  })

  it('overlapping siblings: fractional z-index sorts numerically for hitPathAtPoint', () => {
    const low = box({ width: 40, height: 40, zIndex: 1 })
    const mid = box({ width: 40, height: 40, zIndex: 1.5 })
    const high = box({ width: 40, height: 40, zIndex: 2 })
    const root = box({ width: 100, height: 100 }, [low, mid, high])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
        { x: 0, y: 0, width: 40, height: 40, children: [] },
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }

    expect(hitPathAtPoint(root, layout, 10, 10)).toEqual([2])
  })

  it('overlapping siblings: non-finite z-index is treated as 0 for hit order', () => {
    const log: string[] = []
    const invalid = box({
      width: 50,
      height: 50,
      zIndex: Number.NaN,
      onClick: () => { log.push('invalid') },
    })
    const top = box({
      width: 50,
      height: 50,
      zIndex: 5,
      onClick: () => { log.push('top') },
    })
    const root = box({ width: 100, height: 100 }, [invalid, top])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['top'])
  })

  it('overlapping siblings: positive infinity z-index is treated as 0 and loses to higher finite z-index', () => {
    const log: string[] = []
    const infZ = box({
      width: 50,
      height: 50,
      zIndex: Number.POSITIVE_INFINITY,
      onClick: () => { log.push('inf') },
    })
    const top = box({
      width: 50,
      height: 50,
      zIndex: 1,
      onClick: () => { log.push('top') },
    })
    const root = box({ width: 100, height: 100 }, [infZ, top])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['top'])
  })

  it('overlapping siblings: two non-finite z-index values tie-break to later sibling', () => {
    const log: string[] = []
    const first = box({
      width: 50,
      height: 50,
      zIndex: Number.POSITIVE_INFINITY,
      onClick: () => { log.push('first') },
    })
    const second = box({
      width: 50,
      height: 50,
      zIndex: Number.NaN,
      onClick: () => { log.push('second') },
    })
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

  it('overlapping siblings: non-number z-index at runtime is treated as 0 for hit order', () => {
    const log: string[] = []
    const stringZ = box({
      width: 50,
      height: 50,
      zIndex: '99' as unknown as number,
      onClick: () => { log.push('stringZ') },
    })
    const numeric = box({
      width: 50,
      height: 50,
      zIndex: 1,
      onClick: () => { log.push('numeric') },
    })
    const root = box({ width: 100, height: 100 }, [stringZ, numeric])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['numeric'])
  })

  it('overlapping siblings: non-number z-index matches path and cursor order (treated as 0)', () => {
    const bad = box({ width: 40, height: 40, zIndex: '5' as unknown as number, cursor: 'text' })
    const good = box({ width: 40, height: 40, zIndex: 2, cursor: 'pointer' })
    const root = box({ width: 100, height: 100 }, [bad, good])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }

    expect(hitPathAtPoint(root, layout, 10, 10)).toEqual([1])
    expect(getCursorAtPoint(root, layout, 10, 10)).toBe('pointer')
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

  it('nested boxes: onPointerDown runs on parent when child has no pointer handlers', () => {
    const log: string[] = []
    const child = box({ width: 40, height: 40 })
    const parent = box(
      { width: 100, height: 100, onPointerDown: () => { log.push('parent') } },
      [child],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }

    dispatchHit(parent, layout, 'onPointerDown', 20, 20)
    expect(log).toEqual(['parent'])
  })

  it('nested boxes: onClick runs on parent when child is key-only (no onClick)', () => {
    const log: string[] = []
    const child = box({ width: 40, height: 40, onKeyDown: () => { log.push('child-key') } })
    const parent = box(
      { width: 100, height: 100, onClick: () => { log.push('parent') } },
      [child],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }

    const result = dispatchHit(parent, layout, 'onClick', 20, 20)
    expect(log).toEqual(['parent'])
    expect(result.handled).toBe(true)
    expect(result.focusTarget?.element).toBe(parent)
  })

  it('nested boxes: deepest onWheel fires first', () => {
    const log: string[] = []
    const child = box({ width: 40, height: 40, onWheel: () => { log.push('child') } })
    const parent = box({ width: 100, height: 100, onWheel: () => { log.push('parent') } }, [child])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }

    dispatchHit(parent, layout, 'onWheel', 20, 20)
    expect(log).toEqual(['child'])
  })

  it('onWheel: merges wheel and modifier fields onto the event for the hit target', () => {
    let received: HitEvent | undefined
    const layout = { x: 5, y: 6, width: 100, height: 50, children: [] }
    const el = box({
      width: 100,
      height: 50,
      onWheel: e => {
        received = e
      },
    })

    dispatchHit(el, layout, 'onWheel', 50, 40, {
      deltaX: -1.5,
      deltaY: 42,
      deltaMode: 1,
      ctrlKey: true,
    })

    expect(received).toBeDefined()
    expect(received!.x).toBe(50)
    expect(received!.y).toBe(40)
    expect(received!.localX).toBe(45)
    expect(received!.localY).toBe(34)
    expect(received!.target).toBe(layout)
    expect((received as HitEvent & { deltaX: number }).deltaX).toBe(-1.5)
    expect((received as HitEvent & { deltaY: number }).deltaY).toBe(42)
    expect((received as HitEvent & { deltaMode: number }).deltaMode).toBe(1)
    expect((received as HitEvent & { ctrlKey: boolean }).ctrlKey).toBe(true)
  })

  it('nested boxes: deepest onPointerUp fires first', () => {
    const log: string[] = []
    const child = box(
      { width: 40, height: 40, onPointerUp: () => { log.push('child') } },
    )
    const parent = box(
      { width: 100, height: 100, onPointerUp: () => { log.push('parent') } },
      [child],
    )
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }

    dispatchHit(parent, layout, 'onPointerUp', 20, 20)
    expect(log).toEqual(['child'])
  })

  it('nested boxes: deepest onPointerMove fires first', () => {
    const log: string[] = []
    const child = box(
      { width: 40, height: 40, onPointerMove: () => { log.push('child') } },
    )
    const parent = box(
      { width: 100, height: 100, onPointerMove: () => { log.push('parent') } },
      [child],
    )
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }

    dispatchHit(parent, layout, 'onPointerMove', 20, 20)
    expect(log).toEqual(['child'])
  })

  it('overlapping siblings: higher z-index wins for onWheel dispatch', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onWheel: () => { log.push('back') } })
    const front = box({ width: 50, height: 50, zIndex: 10, onWheel: () => { log.push('front') } })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onWheel', 10, 10)
    expect(log).toEqual(['front'])
  })

  it('overlapping siblings: higher z-index wins for onPointerUp dispatch', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onPointerUp: () => { log.push('back') } })
    const front = box({ width: 50, height: 50, zIndex: 10, onPointerUp: () => { log.push('front') } })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onPointerUp', 10, 10)
    expect(log).toEqual(['front'])
  })

  it('overlapping siblings: higher z-index wins for onPointerMove dispatch', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onPointerMove: () => { log.push('back') } })
    const front = box({ width: 50, height: 50, zIndex: 10, onPointerMove: () => { log.push('front') } })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onPointerMove', 10, 10)
    expect(log).toEqual(['front'])
  })

  it('onPointerDown: no focusTarget even when target is focusable (click-only focus routing)', () => {
    const child = box({ width: 40, height: 40, onPointerDown: () => undefined, onKeyDown: () => undefined })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }

    const result = dispatchHit(parent, layout, 'onPointerDown', 20, 20)
    expect(result.handled).toBe(true)
    expect(result.focusTarget).toBeUndefined()
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

  it('onClick: pointer-only handlers do not enable click-to-focus', () => {
    const el = box({ width: 100, height: 50, onPointerDown: () => undefined })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }
    const result = dispatchHit(el, layout, 'onClick', 50, 25)
    expect(result.handled).toBe(false)
    expect(result.focusTarget).toBeUndefined()
  })

  it('onClick: wheel-only handlers do not enable click-to-focus', () => {
    const el = box({ width: 100, height: 50, onWheel: () => undefined })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }
    const result = dispatchHit(el, layout, 'onClick', 50, 25)
    expect(result.handled).toBe(false)
    expect(result.focusTarget).toBeUndefined()
  })

  it('onClick: key-only focusable box yields focusTarget without firing a handler', () => {
    const el = box({ width: 100, height: 50, onKeyDown: () => undefined })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }
    const result = dispatchHit(el, layout, 'onClick', 50, 25)
    expect(result.handled).toBe(false)
    expect(result.focusTarget?.element).toBe(el)
  })

  it('onClick: composition-only focusable box yields focusTarget without firing a handler', () => {
    const el = box({ width: 100, height: 50, onCompositionStart: () => undefined })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }
    const result = dispatchHit(el, layout, 'onClick', 50, 25)
    expect(result.handled).toBe(false)
    expect(result.focusTarget?.element).toBe(el)
  })

  it('onClick: parent without handlers still routes click-to-focus to key-only child', () => {
    const child = box({ width: 40, height: 40, onKeyDown: () => undefined })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    const result = dispatchHit(parent, layout, 'onClick', 20, 20)
    expect(result.handled).toBe(false)
    expect(result.focusTarget?.element).toBe(child)
  })

  it('onKeyDown: deepest handler runs first; no focusTarget', () => {
    const log: string[] = []
    const child = box({ width: 40, height: 40, onKeyDown: () => { log.push('child') } })
    const parent = box({ width: 100, height: 100, onKeyDown: () => { log.push('parent') } }, [child])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    const result = dispatchHit(parent, layout, 'onKeyDown', 20, 20, {
      key: 'a',
      code: 'KeyA',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(result.handled).toBe(true)
    expect(result.focusTarget).toBeUndefined()
    expect(log).toEqual(['child'])
  })

  it('onKeyDown: merges keyboard fields onto the event for the hit target', () => {
    let received: (KeyboardHitEvent & Pick<HitEvent, 'localX' | 'localY'>) | null = null
    const el = box({
      width: 100,
      height: 50,
      onKeyDown: (e) => {
        received = e as KeyboardHitEvent & Pick<HitEvent, 'localX' | 'localY'>
      },
    })
    const layout = { x: 10, y: 20, width: 100, height: 50, children: [] }
    dispatchHit(el, layout, 'onKeyDown', 50, 35, {
      key: 'Tab',
      code: 'Tab',
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(received?.key).toBe('Tab')
    expect(received?.target).toBe(layout)
    expect(received?.localX).toBe(40)
  })

  it('onKeyUp: deepest handler runs when only onKeyUp is registered', () => {
    let fired = false
    const child = box({ width: 40, height: 40, onKeyUp: () => { fired = true } })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    const result = dispatchHit(parent, layout, 'onKeyUp', 10, 10, {
      key: 'b',
      code: 'KeyB',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(result.handled).toBe(true)
    expect(result.focusTarget).toBeUndefined()
    expect(fired).toBe(true)
  })

  it('onCompositionUpdate: deepest handler runs; merges data; no focusTarget', () => {
    let data = ''
    const child = box({
      width: 40,
      height: 40,
      onCompositionUpdate: (e) => { data = e.data },
    })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    const result = dispatchHit(parent, layout, 'onCompositionUpdate', 20, 20, { data: 'かな' })
    expect(result.handled).toBe(true)
    expect(result.focusTarget).toBeUndefined()
    expect(data).toBe('かな')
  })

  it('onCompositionStart: deepest handler runs; merges data; no focusTarget', () => {
    let data = ''
    const child = box({
      width: 40,
      height: 40,
      onCompositionStart: (e) => { data = e.data },
    })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    const result = dispatchHit(parent, layout, 'onCompositionStart', 20, 20, { data: 'あ' })
    expect(result.handled).toBe(true)
    expect(result.focusTarget).toBeUndefined()
    expect(data).toBe('あ')
  })

  it('onCompositionEnd: deepest handler runs; merges data; no focusTarget', () => {
    let data = ''
    const child = box({
      width: 40,
      height: 40,
      onCompositionEnd: (e) => { data = e.data },
    })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    const result = dispatchHit(parent, layout, 'onCompositionEnd', 20, 20, { data: '漢字' })
    expect(result.handled).toBe(true)
    expect(result.focusTarget).toBeUndefined()
    expect(data).toBe('漢字')
  })

  it('nested boxes: onCompositionEnd — deepest handler fires first', () => {
    const log: string[] = []
    const child = box({
      width: 40,
      height: 40,
      onCompositionEnd: () => { log.push('child') },
    })
    const parent = box(
      { width: 100, height: 100, onCompositionEnd: () => { log.push('parent') } },
      [child],
    )
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    dispatchHit(parent, layout, 'onCompositionEnd', 20, 20, { data: '' })
    expect(log).toEqual(['child'])
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

  it('applies offsetX and offsetY for nested coordinate spaces', () => {
    const child = box({ width: 40, height: 40 })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 20, width: 40, height: 40, children: [] }],
    }
    // Same pointer in outer space: without offset the point is outside the child box.
    expect(hitPathAtPoint(parent, layout, 70, 30, 0, 0)).toEqual([])
    // Root abs origin (50, 0): (70, 30) lands inside the child at layout (10, 20).
    expect(hitPathAtPoint(parent, layout, 70, 30, 50, 0)).toEqual([0])
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

  it('overlapping siblings: non-finite z-index is treated as 0 for path order (matches dispatchHit)', () => {
    const invalid = box({ width: 40, height: 40, zIndex: Number.NaN })
    const top = box({ width: 40, height: 40, zIndex: 3 })
    const root = box({ width: 100, height: 100 }, [invalid, top])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 40, height: 40, children: [] },
        { x: 0, y: 0, width: 40, height: 40, children: [] },
      ],
    }
    expect(hitPathAtPoint(root, layout, 5, 5)).toEqual([1])
  })

  it('pointerEvents none on top sibling: path falls through to box behind', () => {
    const back = box({ width: 50, height: 50, zIndex: 0 })
    const front = box({ width: 50, height: 50, zIndex: 2, pointerEvents: 'none' })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }
    expect(hitPathAtPoint(root, layout, 5, 5)).toEqual([0])
  })

  it('pointerEvents none on top sibling: still reports path when overlay wraps a deeper box', () => {
    const inner = box({ width: 30, height: 30 })
    const overlay = box({ width: 50, height: 50, zIndex: 2, pointerEvents: 'none' }, [inner])
    const back = box({ width: 50, height: 50, zIndex: 0 })
    const root = box({ width: 100, height: 100 }, [back, overlay])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        {
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          children: [{ x: 10, y: 10, width: 30, height: 30, children: [] }],
        },
      ],
    }
    expect(hitPathAtPoint(root, layout, 15, 15)).toEqual([1, 0])
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

  it('applies offsetX and offsetY when resolving the deepest cursor', () => {
    const child = box({ width: 40, height: 40, cursor: 'pointer' })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 20, width: 40, height: 40, children: [] }],
    }
    expect(getCursorAtPoint(parent, layout, 70, 30, 0, 0)).toBeNull()
    expect(getCursorAtPoint(parent, layout, 70, 30, 50, 0)).toBe('pointer')
  })
})

describe('scroll and overflow clipping', () => {
  it('non-finite scroll offsets are ignored so hits match zero-scroll geometry', () => {
    let childFired = false
    const child = box({ width: 50, height: 50, onClick: () => { childFired = true } })
    const parent = box(
      {
        width: 100,
        height: 100,
        overflow: 'scroll',
        scrollX: Number.POSITIVE_INFINITY,
        scrollY: Number.NEGATIVE_INFINITY,
      },
      [child],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 10, width: 50, height: 50, children: [] }],
    }
    expect(dispatchHit(parent, layout, 'onClick', 35, 35).handled).toBe(true)
    expect(childFired).toBe(true)
    expect(hitPathAtPoint(parent, layout, 35, 35)).toEqual([0])
    expect(hasInteractiveHitAtPoint(parent, layout, 35, 35)).toBe(true)
  })

  it('non-number scroll props are ignored so child offsets stay finite', () => {
    let childFired = false
    const child = box({ width: 50, height: 50, onClick: () => { childFired = true } })
    const parent = box(
      {
        width: 100,
        height: 100,
        overflow: 'scroll',
        scrollX: 'oops' as unknown as number,
      },
      [child],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 10, width: 50, height: 50, children: [] }],
    }
    expect(dispatchHit(parent, layout, 'onClick', 35, 35).handled).toBe(true)
    expect(childFired).toBe(true)
  })

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

  it('scrollX and scrollY together shift child bounds; localX and localY match scrolled content', () => {
    let localX = -1
    let localY = -1
    const child = box({
      width: 50,
      height: 50,
      onClick: (e) => {
        localX = e.localX ?? -999
        localY = e.localY ?? -999
      },
    })
    const parent = box(
      { width: 100, height: 100, overflow: 'scroll', scrollX: 30, scrollY: 20 },
      [child],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 100, y: 100, width: 50, height: 50, children: [] }],
    }

    // absX = 0 - scrollX + child.x = 70; absY = 0 - scrollY + child.y = 80
    dispatchHit(parent, layout, 'onClick', 75, 85)
    expect(localX).toBe(5)
    expect(localY).toBe(5)
    expect(hitPathAtPoint(parent, layout, 75, 85)).toEqual([0])
  })

  it('negative scrollX and scrollY shift child bounds (finite overscroll-style offsets)', () => {
    let localX = -1
    let localY = -1
    const child = box({
      width: 50,
      height: 50,
      onClick: e => {
        localX = e.localX ?? -999
        localY = e.localY ?? -999
      },
    })
    const parent = box(
      { width: 100, height: 100, overflow: 'scroll', scrollX: -30, scrollY: -20 },
      [child],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 15, width: 50, height: 50, children: [] }],
    }

    // absX = 0 - scrollX + child.x = 40; absY = 0 - scrollY + child.y = 35
    dispatchHit(parent, layout, 'onClick', 45, 40)
    expect(localX).toBe(5)
    expect(localY).toBe(5)
    expect(hitPathAtPoint(parent, layout, 45, 40)).toEqual([0])
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

  it('nested overflow scroll: both scrollY offsets compose for hit path, dispatch, and local coords', () => {
    let localX = -1
    let localY = -1
    const btn = box({
      width: 40,
      height: 40,
      onClick: (e) => {
        localX = e.localX ?? -999
        localY = e.localY ?? -999
      },
    })
    const inner = box(
      { width: 100, height: 150, overflow: 'scroll', scrollY: 15 },
      [btn],
    )
    const outer = box({ width: 100, height: 100, overflow: 'scroll', scrollY: 10 }, [inner])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        {
          x: 0,
          y: 0,
          width: 100,
          height: 150,
          children: [{ x: 0, y: 60, width: 40, height: 40, children: [] as const }],
        },
      ],
    }

    // btn absY = outerY - outer.scrollY + inner.y - inner.scrollY + btn.y = 0 - 10 + 0 - 15 + 60 = 35
    expect(dispatchHit(outer, layout, 'onClick', 20, 70).handled).toBe(true)
    expect(localX).toBe(20)
    expect(localY).toBe(35)
    expect(hitPathAtPoint(outer, layout, 20, 70)).toEqual([0, 0])
    expect(hasInteractiveHitAtPoint(outer, layout, 20, 70)).toBe(true)
  })
})

describe('non-box leaves (text and image)', () => {
  it('click over text dispatches parent box onClick (leaves do not capture pointer hits)', () => {
    let parentFired = false
    const label = text({ text: 'Hi', font: '14px Inter', lineHeight: 20 })
    const root = box({ width: 100, height: 40, onClick: () => { parentFired = true } }, [label])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      children: [{ x: 10, y: 8, width: 24, height: 20, children: [] }],
    }

    dispatchHit(root, layout, 'onClick', 18, 18)
    expect(parentFired).toBe(true)
    expect(hasInteractiveHitAtPoint(root, layout, 18, 18)).toBe(true)
    expect(hitPathAtPoint(root, layout, 18, 18)).toEqual([])
    expect(getCursorAtPoint(root, layout, 18, 18)).toBeNull()
  })

  it('click over image dispatches parent box onClick', () => {
    let parentFired = false
    const pic = image({ src: '/x.png', width: 32, height: 32 })
    const root = box({ width: 80, height: 80, onClick: () => { parentFired = true } }, [pic])
    const layout = {
      x: 0,
      y: 0,
      width: 80,
      height: 80,
      children: [{ x: 8, y: 8, width: 32, height: 32, children: [] }],
    }

    dispatchHit(root, layout, 'onClick', 20, 20)
    expect(parentFired).toBe(true)
    expect(hasInteractiveHitAtPoint(root, layout, 20, 20)).toBe(true)
    expect(hitPathAtPoint(root, layout, 20, 20)).toEqual([])
    expect(getCursorAtPoint(root, layout, 20, 20)).toBeNull()
  })

  it('higher z-index text sibling does not block onClick on box behind', () => {
    const log: string[] = []
    const behind = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log.push('btn') } })
    const overlay = text({ text: 'x', font: '12px Inter', lineHeight: 16, zIndex: 1 })
    const root = box({ width: 60, height: 60 }, [behind, overlay])
    const layout = {
      x: 0,
      y: 0,
      width: 60,
      height: 60,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onClick', 25, 25)
    expect(log).toEqual(['btn'])
  })

  it('getCursorAtPoint falls back to parent cursor when point is over image only', () => {
    const pic = image({ src: '/x.png', width: 32, height: 32 })
    const root = box({ width: 80, height: 80, cursor: 'pointer' }, [pic])
    const layout = {
      x: 0,
      y: 0,
      width: 80,
      height: 80,
      children: [{ x: 8, y: 8, width: 32, height: 32, children: [] }],
    }
    expect(getCursorAtPoint(root, layout, 20, 20)).toBe('pointer')
  })

  it('getCursorAtPoint falls back to parent cursor when point is over text only', () => {
    const label = text({ text: 'Go', font: '14px Inter', lineHeight: 20 })
    const root = box({ width: 100, height: 40, cursor: 'pointer' }, [label])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      children: [{ x: 4, y: 6, width: 28, height: 20, children: [] }],
    }
    expect(getCursorAtPoint(root, layout, 12, 14)).toBe('pointer')
  })

  it('text as tree root: no pointer hit targets (only box nodes participate in collectHits)', () => {
    const root = text({ text: 'Hi', font: '14px Inter', lineHeight: 20 })
    const layout = { x: 0, y: 0, width: 50, height: 20, children: [] }

    expect(dispatchHit(root, layout, 'onClick', 10, 10).handled).toBe(false)
    expect(hitPathAtPoint(root, layout, 10, 10)).toBeNull()
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(false)
    expect(getCursorAtPoint(root, layout, 10, 10)).toBeNull()
  })

  it('image as tree root: no pointer hit targets', () => {
    const root = image({ src: '/x.png', width: 32, height: 32 })
    const layout = { x: 0, y: 0, width: 32, height: 32, children: [] }

    expect(dispatchHit(root, layout, 'onClick', 16, 16).handled).toBe(false)
    expect(hitPathAtPoint(root, layout, 16, 16)).toBeNull()
    expect(hasInteractiveHitAtPoint(root, layout, 16, 16)).toBe(false)
    expect(getCursorAtPoint(root, layout, 16, 16)).toBeNull()
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

  it('overflow hidden: scrollY applies content offset for hit dispatch and path', () => {
    let localY = -1
    const child = box({
      width: 100,
      height: 50,
      onClick: (e) => { localY = e.localY ?? -999 },
    })
    const parent = box({ width: 100, height: 100, overflow: 'hidden', scrollY: 40 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 80, width: 100, height: 50, children: [] }],
    }

    dispatchHit(parent, layout, 'onClick', 50, 45)
    expect(localY).toBe(5)
    expect(hitPathAtPoint(parent, layout, 50, 45)).toEqual([0])
  })

  it('overflow hidden: scrollX applies content offset for hit dispatch and path', () => {
    let localX = -1
    const child = box({
      width: 50,
      height: 100,
      onClick: (e) => { localX = e.localX ?? -999 },
    })
    const parent = box({ width: 100, height: 100, overflow: 'hidden', scrollX: 40 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 80, y: 0, width: 50, height: 100, children: [] }],
    }

    dispatchHit(parent, layout, 'onClick', 45, 50)
    expect(localX).toBe(5)
    expect(hitPathAtPoint(parent, layout, 45, 50)).toEqual([0])
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

  it('ignores other key- and composition-only handlers for hover hit-test', () => {
    const layoutBase = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    } as const
    const onlyHandlers = [
      { onKeyUp: () => undefined },
      { onCompositionUpdate: () => undefined },
      { onCompositionEnd: () => undefined },
    ] as const
    for (const handlers of onlyHandlers) {
      const inner = box({ width: 40, height: 40, ...handlers })
      const root = box({ width: 100, height: 100 }, [inner])
      expect(hasInteractiveHitAtPoint(root, layoutBase, 10, 10)).toBe(false)
    }
  })

  it('walks up the hit stack: key-only overlay does not hide pointer handler on ancestor', () => {
    const parent = box(
      { width: 100, height: 100, onClick: () => undefined },
      [box({ width: 80, height: 80, onKeyDown: () => undefined })],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 80, height: 80, children: [] }],
    }
    expect(hasInteractiveHitAtPoint(parent, layout, 40, 40)).toBe(true)
  })

  it('returns false when every hit in the stack is key- or composition-only', () => {
    const grand = box(
      { width: 100, height: 100, onKeyDown: () => undefined },
      [
        box(
          { width: 80, height: 80, onCompositionStart: () => undefined },
          [box({ width: 60, height: 60, onKeyUp: () => undefined })],
        ),
      ],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        {
          x: 0,
          y: 0,
          width: 80,
          height: 80,
          children: [{ x: 0, y: 0, width: 60, height: 60, children: [] }],
        },
      ],
    }
    expect(hasInteractiveHitAtPoint(grand, layout, 30, 30)).toBe(false)
  })
})

describe('pointerEvents', () => {
  it('pointerEvents none: overlay onClick does not fire; sibling behind receives hit', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log.push('back') } })
    const front = box({
      width: 50,
      height: 50,
      zIndex: 1,
      pointerEvents: 'none',
      onClick: () => { log.push('front') },
    })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['back'])
  })

  it('pointerEvents none on parent: child with onClick still receives dispatch', () => {
    let childFired = false
    const inner = box({ width: 40, height: 40, onClick: () => { childFired = true } })
    const parent = box({ width: 100, height: 100, pointerEvents: 'none' }, [inner])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [{ x: 10, y: 10, width: 40, height: 40, children: [] }],
    }

    expect(dispatchHit(parent, layout, 'onClick', 20, 20).handled).toBe(true)
    expect(childFired).toBe(true)
  })

  it('pointerEvents none: hasInteractiveHitAtPoint sees interactive sibling behind overlay', () => {
    const back = box({ width: 50, height: 50, zIndex: 0, onClick: () => undefined })
    const front = box({ width: 50, height: 50, zIndex: 2, pointerEvents: 'none' })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(true)
  })

  it('pointerEvents none: overlay onClick is ignored for hasInteractiveHitAtPoint when geometry behind has no pointer handlers', () => {
    const back = box({ width: 50, height: 50, zIndex: 0 })
    const front = box({
      width: 50,
      height: 50,
      zIndex: 2,
      pointerEvents: 'none',
      onClick: () => undefined,
    })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(false)
  })

  it('pointerEvents none: getCursorAtPoint resolves cursor from geometry behind overlay', () => {
    const back = box({ width: 50, height: 50, zIndex: 0, cursor: 'pointer' })
    const front = box({ width: 50, height: 50, zIndex: 3, pointerEvents: 'none', cursor: 'text' })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }
    expect(getCursorAtPoint(root, layout, 10, 10)).toBe('pointer')
  })

  it('pointerEvents none: click-to-focus targets keyboard-only box behind overlay (overlay excluded from hit stack)', () => {
    const back = box({ width: 50, height: 50, zIndex: 0, onKeyDown: () => undefined })
    const front = box({
      width: 50,
      height: 50,
      zIndex: 2,
      pointerEvents: 'none',
      onClick: () => undefined,
    })
    const root = box({ width: 100, height: 100 }, [back, front])
    const backLayout = { x: 0, y: 0, width: 50, height: 50, children: [] as const }
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [backLayout, { x: 0, y: 0, width: 50, height: 50, children: [] }],
    }

    const result = dispatchHit(root, layout, 'onClick', 10, 10)
    expect(result.handled).toBe(false)
    expect(result.focusTarget?.element).toBe(back)
    expect(result.focusTarget?.layout).toBe(backLayout)
  })
})

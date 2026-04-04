import { beforeAll, describe, expect, it } from 'vitest'
import { init, computeLayout } from 'textura'
import { dispatchHit, getCursorAtPoint, hasInteractiveHitAtPoint, hitPathAtPoint } from '../hit-test.js'
import { box, image, scene3d, text } from '../elements.js'
import { toLayoutTree } from '../tree.js'
import type { HitEvent, KeyboardHitEvent } from '../types.js'

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    getContext(type: string) {
      if (type !== '2d') return null
      return {
        font: '',
        measureText(value: string) {
          return { width: value.length * 8 }
        },
      }
    }
  }
}

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

  it('non-box root (text): pointer inside layout does not dispatch handlers', () => {
    const el = text({
      text: 'hi',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 100,
      height: 50,
    })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] as const }
    expect(dispatchHit(el, layout, 'onClick', 50, 25)).toEqual({ handled: false })
    expect(dispatchHit(el, layout, 'onPointerDown', 50, 25)).toEqual({ handled: false })
  })

  it('non-box root (image): pointer inside layout does not dispatch handlers', () => {
    const el = image({ src: 'x.png', width: 100, height: 50 })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] as const }
    expect(dispatchHit(el, layout, 'onClick', 50, 25)).toEqual({ handled: false })
  })

  it('non-box root (scene3d): pointer inside layout does not dispatch handlers', () => {
    const el = scene3d({ objects: [], width: 100, height: 50 })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] as const }
    expect(dispatchHit(el, layout, 'onClick', 50, 25)).toEqual({ handled: false })
  })

  describe('non-box roots: path and interactive-hit vs cursor resolution', () => {
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] as const }

    it('hitPathAtPoint returns null for text/image/scene3d roots even when the point is inside bounds', () => {
      const t = text({
        text: 'hi',
        font: '16px sans-serif',
        lineHeight: 20,
        width: 100,
        height: 50,
        cursor: 'text',
      })
      const img = image({ src: 'x.png', width: 100, height: 50, cursor: 'zoom-in' })
      const s3 = scene3d({ objects: [], width: 100, height: 50, cursor: 'crosshair' })
      expect(hitPathAtPoint(t, layout, 50, 25)).toBeNull()
      expect(hitPathAtPoint(img, layout, 50, 25)).toBeNull()
      expect(hitPathAtPoint(s3, layout, 50, 25)).toBeNull()
    })

    it('hasInteractiveHitAtPoint is false for text/image/scene3d roots (no box handlers on the root)', () => {
      const t = text({
        text: 'hi',
        font: '16px sans-serif',
        lineHeight: 20,
        width: 100,
        height: 50,
      })
      const img = image({ src: 'x.png', width: 100, height: 50 })
      const s3 = scene3d({ objects: [], width: 100, height: 50 })
      expect(hasInteractiveHitAtPoint(t, layout, 50, 25)).toBe(false)
      expect(hasInteractiveHitAtPoint(img, layout, 50, 25)).toBe(false)
      expect(hasInteractiveHitAtPoint(s3, layout, 50, 25)).toBe(false)
    })

    it('getCursorAtPoint still resolves cursor on text/image/scene3d roots when the point is inside', () => {
      const t = text({
        text: 'hi',
        font: '16px sans-serif',
        lineHeight: 20,
        width: 100,
        height: 50,
        cursor: 'text',
      })
      const img = image({ src: 'x.png', width: 100, height: 50, cursor: 'zoom-in' })
      const s3 = scene3d({ objects: [], width: 100, height: 50, cursor: 'crosshair' })
      expect(getCursorAtPoint(t, layout, 50, 25)).toBe('text')
      expect(getCursorAtPoint(img, layout, 50, 25)).toBe('zoom-in')
      expect(getCursorAtPoint(s3, layout, 50, 25)).toBe('crosshair')
    })
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

  it('missing earlier child layout (sparse children array) still hit-tests later siblings', () => {
    let fired = false
    const opaque = box({ width: 40, height: 40 })
    const target = box({ width: 40, height: 40, onClick: () => { fired = true } })
    const root = box({ width: 100, height: 100 }, [opaque, target])
    const sparseChildren: Array<{ x: number; y: number; width: number; height: number; children: readonly [] }> =
      []
    sparseChildren[1] = { x: 50, y: 0, width: 40, height: 40, children: [] }
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: sparseChildren,
    }
    expect(layout.children).toHaveLength(2)
    expect(layout.children[0]).toBeUndefined()

    expect(() => dispatchHit(root, layout, 'onClick', 70, 20)).not.toThrow()
    expect(dispatchHit(root, layout, 'onClick', 70, 20).handled).toBe(true)
    expect(fired).toBe(true)

    expect(hitPathAtPoint(root, layout, 70, 20)).toEqual([1])
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

  it('non-number pointer coordinates miss dispatch and hit queries without throwing (Number.isFinite is false)', () => {
    let fired = false
    const el = box({ width: 100, height: 50, onClick: () => { fired = true }, cursor: 'pointer' })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }

    const str50 = '50' as unknown as number
    const str25 = '25' as unknown as number
    expect(() => dispatchHit(el, layout, 'onClick', str50, 25)).not.toThrow()
    expect(dispatchHit(el, layout, 'onClick', str50, 25).handled).toBe(false)
    expect(dispatchHit(el, layout, 'onClick', 50, str25).handled).toBe(false)
    const bx = 1n as unknown as number
    expect(() => dispatchHit(el, layout, 'onClick', bx, 25)).not.toThrow()
    expect(dispatchHit(el, layout, 'onClick', bx, 25).handled).toBe(false)
    expect(dispatchHit(el, layout, 'onClick', 50, bx).handled).toBe(false)
    const boxed50 = Object(50) as unknown as number
    const boxed25 = Object(25) as unknown as number
    expect(() => dispatchHit(el, layout, 'onClick', boxed50, 25)).not.toThrow()
    expect(dispatchHit(el, layout, 'onClick', boxed50, 25).handled).toBe(false)
    expect(dispatchHit(el, layout, 'onClick', 50, boxed25).handled).toBe(false)
    expect(dispatchHit(el, layout, 'onClick', undefined as unknown as number, 25).handled).toBe(false)
    expect(dispatchHit(el, layout, 'onClick', 50, null as unknown as number).handled).toBe(false)
    expect(fired).toBe(false)

    expect(() => hitPathAtPoint(el, layout, str50, 25)).not.toThrow()
    expect(hitPathAtPoint(el, layout, str50, 25)).toBeNull()
    expect(hitPathAtPoint(el, layout, 50, bx)).toBeNull()
    expect(() => hitPathAtPoint(el, layout, boxed50, 25)).not.toThrow()
    expect(hitPathAtPoint(el, layout, boxed50, 25)).toBeNull()
    expect(hitPathAtPoint(el, layout, 50, boxed25)).toBeNull()
    expect(hitPathAtPoint(el, layout, undefined as unknown as number, 25)).toBeNull()
    expect(hitPathAtPoint(el, layout, 50, null as unknown as number)).toBeNull()
    expect(hasInteractiveHitAtPoint(el, layout, str50, 25)).toBe(false)
    expect(hasInteractiveHitAtPoint(el, layout, bx, 25)).toBe(false)
    expect(hasInteractiveHitAtPoint(el, layout, boxed50, 25)).toBe(false)
    expect(hasInteractiveHitAtPoint(el, layout, undefined as unknown as number, 25)).toBe(false)
    expect(hasInteractiveHitAtPoint(el, layout, 50, null as unknown as number)).toBe(false)
    expect(() => getCursorAtPoint(el, layout, str50, 25)).not.toThrow()
    expect(getCursorAtPoint(el, layout, str50, 25)).toBeNull()
    expect(getCursorAtPoint(el, layout, 50, bx)).toBeNull()
    expect(getCursorAtPoint(el, layout, boxed50, 25)).toBeNull()
    expect(getCursorAtPoint(el, layout, 50, boxed25)).toBeNull()
    expect(getCursorAtPoint(el, layout, undefined as unknown as number, 25)).toBeNull()
    expect(getCursorAtPoint(el, layout, 50, null as unknown as number)).toBeNull()
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

  it('negative width or height layout is a miss for dispatch and hit queries (layoutBoundsAreFinite)', () => {
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
      { ...base, height: -0.001 },
      { ...base, width: -Number.MIN_VALUE },
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

  it('corrupt earlier sibling layout does not throw and still allows hits on later siblings', () => {
    let innerFired = false
    const inner = box({
      width: 50,
      height: 50,
      cursor: 'crosshair',
      onClick: () => {
        innerFired = true
      },
    })
    const parent = box(
      { width: 200, height: 100, cursor: 'pointer' },
      [
        box({ width: 1, height: 1 }),
        inner,
      ],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [
        { x: 0, y: 0, width: -1, height: 10, children: [] as const },
        { x: 10, y: 10, width: 50, height: 50, children: [] as const },
      ],
    }

    expect(() => dispatchHit(parent, layout, 'onClick', 35, 35)).not.toThrow()
    expect(dispatchHit(parent, layout, 'onClick', 35, 35).handled).toBe(true)
    expect(innerFired).toBe(true)

    expect(() => hitPathAtPoint(parent, layout, 35, 35)).not.toThrow()
    expect(hitPathAtPoint(parent, layout, 35, 35)).toEqual([1])

    expect(() => hasInteractiveHitAtPoint(parent, layout, 35, 35)).not.toThrow()
    expect(hasInteractiveHitAtPoint(parent, layout, 35, 35)).toBe(true)

    expect(() => getCursorAtPoint(parent, layout, 35, 35)).not.toThrow()
    expect(getCursorAtPoint(parent, layout, 35, 35)).toBe('crosshair')
  })

  it('BigInt layout fields are a miss for dispatch and hit queries without throwing', () => {
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
    const b = 1n as unknown as number
    for (const bad of [
      { ...base, x: b },
      { ...base, y: b },
      { ...base, width: b },
      { ...base, height: b },
    ]) {
      fired = false
      expect(() => dispatchHit(el, bad, 'onClick', 50, 25)).not.toThrow()
      expect(dispatchHit(el, bad, 'onClick', 50, 25).handled).toBe(false)
      expect(fired).toBe(false)
      expect(() => dispatchHit(el, bad, 'onPointerDown', 50, 25)).not.toThrow()
      expect(dispatchHit(el, bad, 'onPointerDown', 50, 25).handled).toBe(false)
      expect(fired).toBe(false)
      expect(() => hitPathAtPoint(el, bad, 50, 25)).not.toThrow()
      expect(hitPathAtPoint(el, bad, 50, 25)).toBeNull()
      expect(() => hasInteractiveHitAtPoint(el, bad, 50, 25)).not.toThrow()
      expect(hasInteractiveHitAtPoint(el, bad, 50, 25)).toBe(false)
      expect(() => getCursorAtPoint(el, bad, 50, 25)).not.toThrow()
      expect(getCursorAtPoint(el, bad, 50, 25)).toBeNull()
    }
  })

  it('boxed Number layout fields are a miss for dispatch and hit queries without throwing', () => {
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
    const boxedZero = Object(0) as unknown as number
    const boxedTen = Object(10) as unknown as number
    for (const bad of [
      { ...base, x: boxedZero },
      { ...base, y: boxedZero },
      { ...base, width: boxedTen },
      { ...base, height: boxedTen },
    ]) {
      fired = false
      expect(() => dispatchHit(el, bad, 'onClick', 50, 25)).not.toThrow()
      expect(dispatchHit(el, bad, 'onClick', 50, 25).handled).toBe(false)
      expect(fired).toBe(false)
      expect(() => dispatchHit(el, bad, 'onPointerDown', 50, 25)).not.toThrow()
      expect(dispatchHit(el, bad, 'onPointerDown', 50, 25).handled).toBe(false)
      expect(fired).toBe(false)
      expect(() => hitPathAtPoint(el, bad, 50, 25)).not.toThrow()
      expect(hitPathAtPoint(el, bad, 50, 25)).toBeNull()
      expect(() => hasInteractiveHitAtPoint(el, bad, 50, 25)).not.toThrow()
      expect(hasInteractiveHitAtPoint(el, bad, 50, 25)).toBe(false)
      expect(() => getCursorAtPoint(el, bad, 50, 25)).not.toThrow()
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

  it('skips a corrupt child layout and still hits a finite sibling without throwing', () => {
    let goodFired = false
    let rootFired = false
    const badChild = box({ width: 10, height: 10 })
    const goodChild = box({
      width: 10,
      height: 10,
      onClick: () => {
        goodFired = true
      },
      cursor: 'text',
    })
    const root = box(
      {
        width: 100,
        height: 50,
        onClick: () => {
          rootFired = true
        },
        cursor: 'pointer',
      },
      [badChild, goodChild],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      children: [
        { x: 0, y: 0, width: Number.NaN, height: 10, children: [] as const },
        { x: 20, y: 0, width: 10, height: 10, children: [] as const },
      ],
    }

    expect(() => dispatchHit(root, layout, 'onClick', 25, 5)).not.toThrow()
    expect(dispatchHit(root, layout, 'onClick', 25, 5).handled).toBe(true)
    expect(goodFired).toBe(true)
    expect(rootFired).toBe(false)

    expect(() => hitPathAtPoint(root, layout, 25, 5)).not.toThrow()
    expect(hitPathAtPoint(root, layout, 25, 5)).toEqual([1])

    expect(() => hasInteractiveHitAtPoint(root, layout, 25, 5)).not.toThrow()
    expect(hasInteractiveHitAtPoint(root, layout, 25, 5)).toBe(true)

    expect(() => getCursorAtPoint(root, layout, 25, 5)).not.toThrow()
    expect(getCursorAtPoint(root, layout, 25, 5)).toBe('text')
  })

  it('single corrupt child layout still allows parent pointer handlers at points missing the child', () => {
    let rootFired = false
    let childFired = false
    const child = box({
      width: 10,
      height: 10,
      onClick: () => {
        childFired = true
      },
    })
    const root = box(
      {
        width: 100,
        height: 50,
        onClick: () => {
          rootFired = true
        },
      },
      [child],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      children: [{ x: 0, y: 0, width: Number.NaN, height: 10, children: [] as const }],
    }

    expect(() => dispatchHit(root, layout, 'onClick', 80, 25)).not.toThrow()
    expect(dispatchHit(root, layout, 'onClick', 80, 25).handled).toBe(true)
    expect(rootFired).toBe(true)
    expect(childFired).toBe(false)
    expect(hitPathAtPoint(root, layout, 80, 25)).toEqual([])
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

  it('sibling with corrupt layout does not block hits on a valid sibling', () => {
    let leftFired = false
    let rightFired = false
    const left = box({
      width: 40,
      height: 40,
      onClick: () => {
        leftFired = true
      },
    })
    const right = box({
      width: 40,
      height: 40,
      cursor: 'crosshair',
      onClick: () => {
        rightFired = true
      },
    })
    const parent = box({ width: 100, height: 100 }, [left, right])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: Number.NaN, height: 40, children: [] as const },
        { x: 50, y: 0, width: 40, height: 40, children: [] as const },
      ],
    }

    expect(dispatchHit(parent, layout, 'onClick', 60, 20).handled).toBe(true)
    expect(leftFired).toBe(false)
    expect(rightFired).toBe(true)

    expect(hitPathAtPoint(parent, layout, 60, 20)).toEqual([1])
    expect(hasInteractiveHitAtPoint(parent, layout, 60, 20)).toBe(true)
    expect(getCursorAtPoint(parent, layout, 60, 20)).toBe('crosshair')
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

  it('applies offsetX and offsetY like hitPathAtPoint and getCursorAtPoint', () => {
    let localX = -1
    let localY = -1
    let evtX = -1
    const child = box({
      width: 40,
      height: 40,
      onClick: e => {
        localX = e.localX ?? -999
        localY = e.localY ?? -999
        evtX = e.x
      },
    })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 20, width: 40, height: 40, children: [] as const }],
    }
    const result = dispatchHit(parent, layout, 'onClick', 70, 30, undefined, 50, 0)
    expect(result.handled).toBe(true)
    expect(evtX).toBe(70)
    expect(localX).toBe(10)
    expect(localY).toBe(10)
    expect(hitPathAtPoint(parent, layout, 70, 30, 50, 0)).toEqual([0])
    expect(hasInteractiveHitAtPoint(parent, layout, 70, 30, 50, 0)).toBe(true)
    expect(dispatchHit(parent, layout, 'onClick', 70, 30).handled).toBe(false)
    expect(hasInteractiveHitAtPoint(parent, layout, 70, 30)).toBe(false)
  })

  it('non-finite or non-number root offsetX/offsetY are treated as zero (matches scroll offset rules)', () => {
    const child = box({
      width: 40,
      height: 40,
      cursor: 'pointer',
      onClick: () => {},
    })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 20, width: 40, height: 40, children: [] as const }],
    }
    expect(dispatchHit(parent, layout, 'onClick', 70, 30, undefined, 50, 0).handled).toBe(true)
    expect(hitPathAtPoint(parent, layout, 70, 30, 50, 0)).toEqual([0])
    expect(hasInteractiveHitAtPoint(parent, layout, 70, 30, 50, 0)).toBe(true)
    expect(getCursorAtPoint(parent, layout, 70, 30, 50, 0)).toBe('pointer')

    // NaN offsetX → 0: (70, 30) misses the child (same as no root offset); a point inside the child still hits.
    expect(dispatchHit(parent, layout, 'onClick', 70, 30, undefined, Number.NaN, 0).handled).toBe(false)
    expect(dispatchHit(parent, layout, 'onClick', 20, 30, undefined, Number.NaN, 0).handled).toBe(true)
    expect(hitPathAtPoint(parent, layout, 70, 30, Number.NaN, 0)).toEqual([])
    expect(hasInteractiveHitAtPoint(parent, layout, 70, 30, Number.NaN, 0)).toBe(false)

    // Non-finite offset on one axis only: bad Y is dropped so X offset still applies.
    expect(dispatchHit(parent, layout, 'onClick', 70, 30, undefined, 50, Number.POSITIVE_INFINITY).handled).toBe(
      true,
    )
    expect(hitPathAtPoint(parent, layout, 70, 30, 50, Number.NEGATIVE_INFINITY)).toEqual([0])

    expect(hasInteractiveHitAtPoint(parent, layout, 70, 30, 'oops' as unknown as number, 0)).toBe(false)
    expect(getCursorAtPoint(parent, layout, 70, 30, 50, Number.NaN)).toBe('pointer')

    // BigInt offsets are non-numbers → treated as 0 (same as corrupt scroll props); must not throw.
    expect(dispatchHit(parent, layout, 'onClick', 70, 30, undefined, 50n as unknown as number, 0).handled).toBe(
      false,
    )
    expect(dispatchHit(parent, layout, 'onClick', 20, 30, undefined, 50n as unknown as number, 0).handled).toBe(
      true,
    )
    expect(hitPathAtPoint(parent, layout, 70, 30, 50n as unknown as number, 0)).toEqual([])
    expect(hasInteractiveHitAtPoint(parent, layout, 20, 30, 0n as unknown as number, 0)).toBe(true)
    expect(hasInteractiveHitAtPoint(parent, layout, 70, 30, 0n as unknown as number, 0)).toBe(false)
  })

  it('merges extra onto the event when offsetX and offsetY are provided', () => {
    let shift = false
    const child = box({
      width: 40,
      height: 40,
      onClick: e => {
        shift = !!(e as HitEvent & { shiftKey?: boolean }).shiftKey
      },
    })
    const parent = box({ width: 100, height: 100 }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 20, width: 40, height: 40, children: [] as const }],
    }
    dispatchHit(parent, layout, 'onClick', 70, 30, { shiftKey: true }, 50, 0)
    expect(shift).toBe(true)
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

  it('hasInteractiveHitAtPoint ignores keyboard and composition-only handlers (pointer hover semantics)', () => {
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }
    const keyDownOnly = box({ width: 100, height: 50, onKeyDown: () => undefined })
    const keyUpOnly = box({ width: 100, height: 50, onKeyUp: () => undefined })
    const compStartOnly = box({ width: 100, height: 50, onCompositionStart: () => undefined })
    expect(hasInteractiveHitAtPoint(keyDownOnly, layout, 50, 25)).toBe(false)
    expect(hasInteractiveHitAtPoint(keyUpOnly, layout, 50, 25)).toBe(false)
    expect(hasInteractiveHitAtPoint(compStartOnly, layout, 50, 25)).toBe(false)
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

  it('overlapping siblings: focusable overlay does not beat clickable sibling behind', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log.push('back') } })
    const front = box({ width: 50, height: 50, zIndex: 10, onKeyDown: () => undefined })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    const result = dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['back'])
    expect(result.handled).toBe(true)
    expect(result.focusTarget?.element).toBe(back)
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

  it('overlapping siblings: appended child wins after prior dispatch warmed z-order cache', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log.push('back') } })
    const mid = box({ width: 50, height: 50, zIndex: 5, onClick: () => { log.push('mid') } })
    const root = box({ width: 100, height: 100 }, [back, mid])
    let layout = {
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
    expect(log).toEqual(['mid'])

    log.length = 0
    const top = box({ width: 50, height: 50, zIndex: 10, onClick: () => { log.push('top') } })
    root.children.push(top)
    layout = {
      ...layout,
      children: [
        ...layout.children,
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }
    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['top'])
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

  it('skips siblings with no matching layout entry (partial geometry) without throwing', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log.push('back') } })
    const front = box({ width: 50, height: 50, zIndex: 10, onClick: () => { log.push('front') } })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 50, height: 50, children: [] as const }],
    }

    expect(() => dispatchHit(root, layout, 'onClick', 10, 10)).not.toThrow()
    expect(log).toEqual(['back'])
    expect(hitPathAtPoint(root, layout, 10, 10)).toEqual([0])
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(true)
    expect(getCursorAtPoint(root, layout, 10, 10)).toBeNull()
  })

  it('overlapping siblings: corrupt layout on higher z-index still dispatches to valid sibling behind', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log.push('back') } })
    const front = box({ width: 50, height: 50, zIndex: 10, onClick: () => { log.push('front') } })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: NaN, height: 50, children: [] },
      ],
    }

    expect(() => dispatchHit(root, layout, 'onClick', 10, 10)).not.toThrow()
    expect(log).toEqual(['back'])
    expect(dispatchHit(root, layout, 'onClick', 10, 10).handled).toBe(true)
    expect(hitPathAtPoint(root, layout, 10, 10)).toEqual([0])
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(true)
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

  it('overlapping siblings: appending a child recomputes z-order so the new topmost receives hits', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log.push('back') } })
    const mid = box({ width: 50, height: 50, zIndex: 5, onClick: () => { log.push('mid') } })
    const root = box({ width: 100, height: 100 }, [back, mid])
    const layoutTwo = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layoutTwo, 'onClick', 10, 10)
    expect(log).toEqual(['mid'])

    const top = box({ width: 50, height: 50, zIndex: 10, onClick: () => { log.push('top') } })
    root.children.push(top)
    const layoutThree = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    log.length = 0
    dispatchHit(root, layoutThree, 'onClick', 10, 10)
    expect(log).toEqual(['top'])
    expect(hitPathAtPoint(root, layoutThree, 10, 10)).toEqual([2])
  })

  it('overlapping siblings: removing a child invalidates z-order cache so the survivor receives hits', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log.push('back') } })
    const front = box({ width: 50, height: 50, zIndex: 10, onClick: () => { log.push('front') } })
    const root = box({ width: 100, height: 100 }, [back, front])
    const layoutTwo = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: 50, height: 50, children: [] },
        { x: 0, y: 0, width: 50, height: 50, children: [] },
      ],
    }

    dispatchHit(root, layoutTwo, 'onClick', 10, 10)
    expect(log).toEqual(['front'])

    root.children = [back]
    const layoutOne = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 50, height: 50, children: [] }],
    }

    log.length = 0
    dispatchHit(root, layoutOne, 'onClick', 10, 10)
    expect(log).toEqual(['back'])
    expect(hitPathAtPoint(root, layoutOne, 10, 10)).toEqual([0])
  })

  it('overlapping siblings: replacing a child at the same index invalidates z-order cache', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log.push('back') } })
    const front = box({ width: 50, height: 50, zIndex: 10, onClick: () => { log.push('front') } })
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
    expect(log).toEqual(['front'])

    const behind = box({ width: 50, height: 50, zIndex: -1, onClick: () => { log.push('behind') } })
    root.children[1] = behind

    log.length = 0
    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['back'])
    expect(hitPathAtPoint(root, layout, 10, 10)).toEqual([0])
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

  it('z-index paint order cache invalidates when the sibling count changes', () => {
    const log: string[] = []
    const a = box({
      width: 50,
      height: 50,
      zIndex: 0,
      onClick: () => {
        log.push('a')
      },
    })
    const b = box({
      width: 50,
      height: 50,
      zIndex: 1,
      onClick: () => {
        log.push('b')
      },
    })
    const root = box({ width: 100, height: 100 }, [a, b])
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
    expect(log).toEqual(['b'])

    const c = box({
      width: 50,
      height: 50,
      zIndex: 2,
      onClick: () => {
        log.push('c')
      },
    })
    root.children.push(c)
    layout.children.push({ x: 0, y: 0, width: 50, height: 50, children: [] })

    log.length = 0
    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['c'])
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

  it('overlapping siblings: bigint z-index is treated as 0 for dispatch, path, and cursor (typeof guard)', () => {
    const log: string[] = []
    const big = box({
      width: 40,
      height: 40,
      zIndex: 99n as unknown as number,
      onClick: () => { log.push('big') },
      cursor: 'text',
    })
    const small = box({
      width: 40,
      height: 40,
      zIndex: 1,
      onClick: () => { log.push('small') },
      cursor: 'pointer',
    })
    const root = box({ width: 100, height: 100 }, [big, small])
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

    dispatchHit(root, layout, 'onClick', 10, 10)
    expect(log).toEqual(['small'])
    expect(hitPathAtPoint(root, layout, 10, 10)).toEqual([1])
    expect(getCursorAtPoint(root, layout, 10, 10)).toBe('pointer')
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

  it('onClick: pointerEvents none wrapper still propagates click-to-focus to key-only descendant', () => {
    const inner = box({ width: 40, height: 40, onKeyDown: () => undefined })
    const overlay = box({ width: 40, height: 40, pointerEvents: 'none' }, [inner])
    const parent = box({ width: 100, height: 100 }, [overlay])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }] }],
    }
    const result = dispatchHit(parent, layout, 'onClick', 20, 20)
    expect(result.handled).toBe(false)
    expect(result.focusTarget?.element).toBe(inner)
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

  it('returns null when the deepest hit is pointer-events-none with no deeper boxes (pass-through leaf)', () => {
    const el = box({ width: 50, height: 50, pointerEvents: 'none' })
    const layout = { x: 0, y: 0, width: 50, height: 50, children: [] }
    expect(hitPathAtPoint(el, layout, 10, 10)).toBeNull()
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

  it('treats empty-string cursor on a nested box as unset so an ancestor cursor wins', () => {
    const child = box({ width: 40, height: 40, cursor: '' })
    const parent = box({ width: 100, height: 100, cursor: 'pointer' }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    expect(getCursorAtPoint(parent, layout, 20, 20)).toBe('pointer')
  })

  it('treats empty-string cursor on a nested text leaf as unset so an ancestor box cursor wins', () => {
    const leaf = text({
      text: 'hi',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 40,
      height: 40,
      cursor: '',
    })
    const parent = box({ width: 100, height: 100, cursor: 'pointer' }, [leaf])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    expect(getCursorAtPoint(parent, layout, 20, 20)).toBe('pointer')
  })

  it('treats empty-string cursor on a nested image leaf as unset so an ancestor box cursor wins', () => {
    const leaf = image({ src: 'x.png', width: 40, height: 40, cursor: '' })
    const parent = box({ width: 100, height: 100, cursor: 'grab' }, [leaf])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 40, height: 40, children: [] }],
    }
    expect(getCursorAtPoint(parent, layout, 20, 20)).toBe('grab')
  })

  it('empty-string cursor on a deep chain falls through to the first non-empty ancestor', () => {
    const leaf = box({ width: 20, height: 20, cursor: '' })
    const mid = box({ width: 50, height: 50, cursor: '' }, [leaf])
    const root = box({ width: 100, height: 100, cursor: 'help' }, [mid])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        {
          x: 10,
          y: 10,
          width: 50,
          height: 50,
          children: [{ x: 5, y: 5, width: 20, height: 20, children: [] }],
        },
      ],
    }
    expect(getCursorAtPoint(root, layout, 20, 20)).toBe('help')
  })

  it('returns empty string when the hit target is the root box and cursor is explicitly empty', () => {
    const el = box({ width: 100, height: 50, cursor: '' })
    const layout = { x: 0, y: 0, width: 100, height: 50, children: [] }
    expect(getCursorAtPoint(el, layout, 50, 25)).toBe('')
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

  it('text, image, and scene3d leaves with pointerEvents none fall through to ancestor cursor', () => {
    const leafText = text({
      text: 'x',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 40,
      height: 40,
      pointerEvents: 'none',
      cursor: 'text',
    })
    const parentText = box({ width: 100, height: 100, cursor: 'help' }, [leafText])
    const layoutText = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 10, width: 40, height: 40, children: [] as const }],
    }
    expect(getCursorAtPoint(parentText, layoutText, 25, 25)).toBe('help')

    const leafImg = image({
      src: 'a.png',
      width: 40,
      height: 40,
      pointerEvents: 'none',
      cursor: 'crosshair',
    })
    const parentImg = box({ width: 100, height: 100, cursor: 'cell' }, [leafImg])
    const layoutImg = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 10, width: 40, height: 40, children: [] as const }],
    }
    expect(getCursorAtPoint(parentImg, layoutImg, 25, 25)).toBe('cell')

    const leaf3d = scene3d({
      objects: [],
      width: 40,
      height: 40,
      pointerEvents: 'none',
      cursor: 'move',
    })
    const parent3d = box({ width: 100, height: 100, cursor: 'grab' }, [leaf3d])
    const layout3d = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 10, width: 40, height: 40, children: [] as const }],
    }
    expect(getCursorAtPoint(parent3d, layout3d, 25, 25)).toBe('grab')
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
    expect(getCursorAtPoint(parent, layout, 35, 35)).toBeNull()
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
        scrollY: { n: 1 } as unknown as number,
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
    expect(getCursorAtPoint(parent, layout, 35, 35)).toBeNull()
  })

  it('NaN scroll offsets are treated as zero (distinct from a finite scroll that would shift hits)', () => {
    const layoutY = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 80, width: 100, height: 50, children: [] as const }],
    }
    let localY = -1
    let fired = false
    const childY = box({
      width: 100,
      height: 50,
      cursor: 'crosshair',
      onClick: e => {
        fired = true
        localY = e.localY ?? -999
      },
    })
    const parentNaNY = box(
      { width: 100, height: 100, overflow: 'scroll', scrollY: Number.NaN },
      [childY],
    )
    // With scrollY 40, child absY would be 40 and (50, 45) would hit. NaN => 0, absY 80 — same point misses.
    expect(dispatchHit(parentNaNY, layoutY, 'onClick', 50, 45).handled).toBe(false)
    expect(fired).toBe(false)
    dispatchHit(parentNaNY, layoutY, 'onClick', 50, 85)
    expect(fired).toBe(true)
    expect(localY).toBe(5)
    expect(hitPathAtPoint(parentNaNY, layoutY, 50, 85)).toEqual([0])
    expect(getCursorAtPoint(parentNaNY, layoutY, 50, 85)).toBe('crosshair')

    const layoutX = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 80, y: 0, width: 50, height: 100, children: [] as const }],
    }
    let localX = -1
    fired = false
    const childX = box({
      width: 50,
      height: 100,
      cursor: 'grab',
      onClick: e => {
        fired = true
        localX = e.localX ?? -999
      },
    })
    const parentNaNX = box(
      { width: 100, height: 100, overflow: 'scroll', scrollX: Number.NaN },
      [childX],
    )
    expect(dispatchHit(parentNaNX, layoutX, 'onClick', 45, 50).handled).toBe(false)
    expect(fired).toBe(false)
    dispatchHit(parentNaNX, layoutX, 'onClick', 85, 50)
    expect(fired).toBe(true)
    expect(localX).toBe(5)
    expect(hitPathAtPoint(parentNaNX, layoutX, 85, 50)).toEqual([0])
    expect(getCursorAtPoint(parentNaNX, layoutX, 85, 50)).toBe('grab')
  })

  it('BigInt scroll offsets are treated as zero (typeof guard; do not coerce with Number(bigint) in hot paths)', () => {
    const layoutY = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 80, width: 100, height: 50, children: [] as const }],
    }
    const childY = box({ width: 100, height: 50, cursor: 'crosshair', onClick: () => {} })
    const parentY = box(
      { width: 100, height: 100, overflow: 'scroll', scrollY: 40n as unknown as number },
      [childY],
    )
    expect(dispatchHit(parentY, layoutY, 'onClick', 50, 45).handled).toBe(false)
    expect(dispatchHit(parentY, layoutY, 'onClick', 50, 85).handled).toBe(true)
    expect(hitPathAtPoint(parentY, layoutY, 50, 85)).toEqual([0])
    expect(getCursorAtPoint(parentY, layoutY, 50, 85)).toBe('crosshair')

    const layoutX = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 80, y: 0, width: 50, height: 100, children: [] as const }],
    }
    const childX = box({ width: 50, height: 100, cursor: 'grab', onClick: () => {} })
    const parentX = box(
      { width: 100, height: 100, overflow: 'scroll', scrollX: 99n as unknown as number },
      [childX],
    )
    expect(dispatchHit(parentX, layoutX, 'onClick', 45, 50).handled).toBe(false)
    expect(dispatchHit(parentX, layoutX, 'onClick', 85, 50).handled).toBe(true)
    expect(hitPathAtPoint(parentX, layoutX, 85, 50)).toEqual([0])
    expect(getCursorAtPoint(parentX, layoutX, 85, 50)).toBe('grab')
  })

  it('±Infinity scroll offsets are treated as zero (non-finite scroll cannot shift child geometry)', () => {
    const layoutY = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 80, width: 100, height: 50, children: [] as const }],
    }
    const childY = box({ width: 100, height: 50, cursor: 'crosshair', onClick: () => {} })
    const parentInfY = box(
      { width: 100, height: 100, overflow: 'scroll', scrollY: Number.POSITIVE_INFINITY },
      [childY],
    )
    expect(dispatchHit(parentInfY, layoutY, 'onClick', 50, 45).handled).toBe(false)
    expect(dispatchHit(parentInfY, layoutY, 'onClick', 50, 85).handled).toBe(true)
    expect(hitPathAtPoint(parentInfY, layoutY, 50, 85)).toEqual([0])
    expect(getCursorAtPoint(parentInfY, layoutY, 50, 85)).toBe('crosshair')

    const layoutX = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 80, y: 0, width: 50, height: 100, children: [] as const }],
    }
    const childX = box({ width: 50, height: 100, cursor: 'grab', onClick: () => {} })
    const parentNegInfX = box(
      { width: 100, height: 100, overflow: 'scroll', scrollX: Number.NEGATIVE_INFINITY },
      [childX],
    )
    expect(dispatchHit(parentNegInfX, layoutX, 'onClick', 45, 50).handled).toBe(false)
    expect(dispatchHit(parentNegInfX, layoutX, 'onClick', 85, 50).handled).toBe(true)
    expect(hitPathAtPoint(parentNegInfX, layoutX, 85, 50)).toEqual([0])
    expect(getCursorAtPoint(parentNegInfX, layoutX, 85, 50)).toBe('grab')
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
    const child = box({
      width: 50,
      height: 50,
      cursor: 'cell',
      onClick: () => { childFired = true },
    })
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
    expect(getCursorAtPoint(parent, layout, 25, 25)).toBe('cell')
  })

  it('scrollY shifts child bounds; localY matches scrolled content', () => {
    let localY = -1
    const child = box({
      width: 100,
      height: 50,
      cursor: 'text',
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
    expect(getCursorAtPoint(parent, layout, 50, 45)).toBe('text')
  })

  it('scrollX shifts child bounds; localX matches scrolled content', () => {
    let localX = -1
    const child = box({
      width: 50,
      height: 100,
      cursor: 'text',
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
    expect(getCursorAtPoint(parent, layout, 45, 50)).toBe('text')
  })

  it('scrollX and scrollY together shift child bounds; localX and localY match scrolled content', () => {
    let localX = -1
    let localY = -1
    const child = box({
      width: 50,
      height: 50,
      cursor: 'crosshair',
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
    expect(getCursorAtPoint(parent, layout, 75, 85)).toBe('crosshair')
  })

  it('negative scrollX and scrollY shift child bounds (finite overscroll-style offsets)', () => {
    let localX = -1
    let localY = -1
    const child = box({
      width: 50,
      height: 50,
      cursor: 'grab',
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
    expect(getCursorAtPoint(parent, layout, 45, 40)).toBe('grab')
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
      cursor: 'pointer',
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
    expect(getCursorAtPoint(outer, layout, 20, 70)).toBe('pointer')
  })

  it('nested overflow scroll: outer and inner scrollX + scrollY compose for dispatch, path, and locals', () => {
    let localX = -1
    let localY = -1
    const btn = box({
      width: 40,
      height: 40,
      cursor: 'pointer',
      onClick: e => {
        localX = e.localX ?? -999
        localY = e.localY ?? -999
      },
    })
    const inner = box(
      { width: 100, height: 100, overflow: 'scroll', scrollX: 25, scrollY: 35 },
      [btn],
    )
    const outer = box(
      { width: 100, height: 100, overflow: 'scroll', scrollX: 20, scrollY: 15 },
      [inner],
    )
    const layout = {
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
          children: [{ x: 50, y: 80, width: 40, height: 40, children: [] as const }],
        },
      ],
    }

    // inner abs = (0 - 20 + 30, 0 - 15 + 40) = (10, 25)
    // btn abs = (10 - 25 + 50, 25 - 35 + 80) = (35, 70)
    expect(dispatchHit(outer, layout, 'onClick', 35, 70).handled).toBe(true)
    expect(localX).toBe(0)
    expect(localY).toBe(0)
    expect(hitPathAtPoint(outer, layout, 35, 70)).toEqual([0, 0])
    expect(hasInteractiveHitAtPoint(outer, layout, 35, 70)).toBe(true)
    expect(getCursorAtPoint(outer, layout, 35, 70)).toBe('pointer')
  })
})

describe('non-box leaves (text, image, scene3d)', () => {
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

  it('click over scene3d dispatches parent box onClick', () => {
    let parentFired = false
    const view = scene3d({ width: 48, height: 48, objects: [] })
    const root = box({ width: 80, height: 80, onClick: () => { parentFired = true } }, [view])
    const layout = {
      x: 0,
      y: 0,
      width: 80,
      height: 80,
      children: [{ x: 6, y: 6, width: 48, height: 48, children: [] }],
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

  it('getCursorAtPoint falls back to parent cursor when point is over scene3d only', () => {
    const view = scene3d({ width: 48, height: 48, objects: [] })
    const root = box({ width: 80, height: 80, cursor: 'pointer' }, [view])
    const layout = {
      x: 0,
      y: 0,
      width: 80,
      height: 80,
      children: [{ x: 6, y: 6, width: 48, height: 48, children: [] }],
    }
    expect(getCursorAtPoint(root, layout, 20, 20)).toBe('pointer')
  })

  it('getCursorAtPoint prefers scene3d leaf cursor over parent', () => {
    const view = scene3d({ width: 48, height: 48, objects: [], cursor: 'grab' })
    const root = box({ width: 100, height: 100, cursor: 'pointer' }, [view])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 10, width: 48, height: 48, children: [] }],
    }
    expect(getCursorAtPoint(root, layout, 24, 24)).toBe('grab')
  })

  it('pointerEvents none on scene3d falls through to parent cursor', () => {
    const view = scene3d({ width: 48, height: 48, objects: [], pointerEvents: 'none' })
    const root = box({ width: 100, height: 100, cursor: 'pointer' }, [view])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 10, y: 10, width: 48, height: 48, children: [] }],
    }
    expect(getCursorAtPoint(root, layout, 24, 24)).toBe('pointer')
  })

  it('text as tree root: no pointer hit targets (only box nodes participate in collectHits)', () => {
    const root = text({ text: 'Hi', font: '14px Inter', lineHeight: 20 })
    const layout = { x: 0, y: 0, width: 50, height: 20, children: [] }

    expect(dispatchHit(root, layout, 'onClick', 10, 10).handled).toBe(false)
    expect(hitPathAtPoint(root, layout, 10, 10)).toBeNull()
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(false)
    expect(getCursorAtPoint(root, layout, 10, 10)).toBeNull()
  })

  it('text as tree root: explicit cursor still resolves (StyleProps parity; no pointer handlers on text)', () => {
    const root = text({ text: 'Hi', font: '14px Inter', lineHeight: 20, cursor: 'text' })
    const layout = { x: 0, y: 0, width: 50, height: 20, children: [] }

    expect(dispatchHit(root, layout, 'onClick', 10, 10).handled).toBe(false)
    expect(hitPathAtPoint(root, layout, 10, 10)).toBeNull()
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(false)
    expect(getCursorAtPoint(root, layout, 10, 10)).toBe('text')
  })

  it('image as tree root: no pointer hit targets', () => {
    const root = image({ src: '/x.png', width: 32, height: 32 })
    const layout = { x: 0, y: 0, width: 32, height: 32, children: [] }

    expect(dispatchHit(root, layout, 'onClick', 16, 16).handled).toBe(false)
    expect(hitPathAtPoint(root, layout, 16, 16)).toBeNull()
    expect(hasInteractiveHitAtPoint(root, layout, 16, 16)).toBe(false)
    expect(getCursorAtPoint(root, layout, 16, 16)).toBeNull()
  })

  it('image as tree root: explicit cursor still resolves (StyleProps parity; no pointer handlers on image)', () => {
    const root = image({ src: '/x.png', width: 32, height: 32, cursor: 'pointer' })
    const layout = { x: 0, y: 0, width: 32, height: 32, children: [] }

    expect(dispatchHit(root, layout, 'onClick', 16, 16).handled).toBe(false)
    expect(hitPathAtPoint(root, layout, 16, 16)).toBeNull()
    expect(hasInteractiveHitAtPoint(root, layout, 16, 16)).toBe(false)
    expect(getCursorAtPoint(root, layout, 16, 16)).toBe('pointer')
  })

  it('scene3d as tree root: no pointer hit targets', () => {
    const root = scene3d({ width: 64, height: 64, objects: [] })
    const layout = { x: 0, y: 0, width: 64, height: 64, children: [] }

    expect(dispatchHit(root, layout, 'onClick', 32, 32).handled).toBe(false)
    expect(hitPathAtPoint(root, layout, 32, 32)).toBeNull()
    expect(hasInteractiveHitAtPoint(root, layout, 32, 32)).toBe(false)
    expect(getCursorAtPoint(root, layout, 32, 32)).toBeNull()
  })

  it('scene3d as tree root: explicit cursor still resolves (StyleProps parity; no pointer handlers on scene3d)', () => {
    const root = scene3d({ width: 64, height: 64, objects: [], cursor: 'crosshair' })
    const layout = { x: 0, y: 0, width: 64, height: 64, children: [] }

    expect(dispatchHit(root, layout, 'onClick', 32, 32).handled).toBe(false)
    expect(hitPathAtPoint(root, layout, 32, 32)).toBeNull()
    expect(hasInteractiveHitAtPoint(root, layout, 32, 32)).toBe(false)
    expect(getCursorAtPoint(root, layout, 32, 32)).toBe('crosshair')
  })

  it('leaf roots: empty-string cursor yields empty string (distinct from omitted cursor → null)', () => {
    const t = text({ text: 'Hi', font: '14px Inter', lineHeight: 20, cursor: '' })
    const tLayout = { x: 0, y: 0, width: 50, height: 20, children: [] as const }
    expect(getCursorAtPoint(t, tLayout, 10, 10)).toBe('')

    const img = image({ src: '/x.png', width: 32, height: 32, cursor: '' })
    const imgLayout = { x: 0, y: 0, width: 32, height: 32, children: [] as const }
    expect(getCursorAtPoint(img, imgLayout, 16, 16)).toBe('')

    const s3 = scene3d({ width: 64, height: 64, objects: [], cursor: '' })
    const s3Layout = { x: 0, y: 0, width: 64, height: 64, children: [] as const }
    expect(getCursorAtPoint(s3, s3Layout, 32, 32)).toBe('')
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

  it('overflow scroll: pointer outside parent bounds hits nothing (same clip gate as hidden)', () => {
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

  it('overflow hidden: scrollY applies content offset for hit dispatch, path, and cursor', () => {
    let localY = -1
    const child = box({
      width: 100,
      height: 50,
      cursor: 'text',
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
    expect(getCursorAtPoint(parent, layout, 50, 45)).toBe('text')
  })

  it('overflow hidden: scrollX applies content offset for hit dispatch, path, and cursor', () => {
    let localX = -1
    const child = box({
      width: 50,
      height: 100,
      cursor: 'grab',
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
    expect(getCursorAtPoint(parent, layout, 45, 50)).toBe('grab')
  })
})

describe('overflow visible', () => {
  it('pointer over child geometry outside parent bounds does not hit child (parent inside gate)', () => {
    let childFired = false
    const child = box({ width: 80, height: 40, onClick: () => { childFired = true } })
    const parent = box({ width: 100, height: 100, overflow: 'visible' }, [child])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 50, y: 30, width: 80, height: 40, children: [] }],
    }
    // Child spans x ≈ 50..130 in root space; (110, 50) is inside the child but outside the parent width.
    dispatchHit(parent, layout, 'onClick', 110, 50)
    expect(childFired).toBe(false)
    expect(hitPathAtPoint(parent, layout, 110, 50)).toBeNull()
    expect(hasInteractiveHitAtPoint(parent, layout, 110, 50)).toBe(false)
    expect(getCursorAtPoint(parent, layout, 110, 50)).toBeNull()
  })

  it('scrollY still shifts child hit geometry (offsets apply for any box; only hidden/scroll add clip)', () => {
    let localY = -1
    const child = box({
      width: 100,
      height: 50,
      cursor: 'text',
      onClick: e => {
        localY = e.localY ?? -999
      },
    })
    const parent = box({ width: 100, height: 100, overflow: 'visible', scrollY: 40 }, [child])
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
    expect(getCursorAtPoint(parent, layout, 50, 45)).toBe('text')
  })

  it('runtime overflow not hidden/scroll does not clip children early; scrollY still offsets like visible', () => {
    let localY = -1
    const child = box({
      width: 100,
      height: 50,
      cursor: 'text',
      onClick: e => {
        localY = e.localY ?? -999
      },
    })
    const parent = box(
      {
        width: 100,
        height: 100,
        scrollY: 40,
        ...({ overflow: 'auto' } as { overflow: 'visible' }),
      },
      [child],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 80, width: 100, height: 50, children: [] }],
    }

    expect(parent.props.overflow).toBe('auto')
    dispatchHit(parent, layout, 'onClick', 50, 45)
    expect(localY).toBe(5)
    expect(hitPathAtPoint(parent, layout, 50, 45)).toEqual([0])
    expect(getCursorAtPoint(parent, layout, 50, 45)).toBe('text')
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

  it('pointerEvents auto: top overlay receives hit (same stack behavior as omitting pointerEvents)', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log.push('back') } })
    const front = box({
      width: 50,
      height: 50,
      zIndex: 1,
      pointerEvents: 'auto',
      onClick: () => { log.push('front') },
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
    expect(log).toEqual(['front'])
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(true)
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

  it('pointerEvents none on scroll parent: scrollY still shifts child hit geometry and cursor', () => {
    let localY = -1
    const child = box({
      width: 100,
      height: 50,
      cursor: 'text',
      onClick: e => {
        localY = e.localY ?? -999
      },
    })
    const parent = box(
      { width: 100, height: 100, overflow: 'scroll', scrollY: 40, pointerEvents: 'none' },
      [child],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 80, width: 100, height: 50, children: [] }],
    }

    // Same abs geometry as scrollY shifts child bounds test; parent does not capture hits.
    dispatchHit(parent, layout, 'onClick', 50, 45)
    expect(localY).toBe(5)
    expect(getCursorAtPoint(parent, layout, 50, 45)).toBe('text')
    expect(hitPathAtPoint(parent, layout, 50, 45)).toEqual([0])
  })

  it('pointerEvents none on scroll parent: overflow clip still blocks descent (no pass-through past viewport)', () => {
    let childFired = false
    const child = box({ width: 100, height: 200, onClick: () => { childFired = true } })
    const parent = box(
      { width: 100, height: 100, overflow: 'scroll', scrollY: 0, pointerEvents: 'none' },
      [child],
    )
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 100, height: 200, children: [] }],
    }

    expect(dispatchHit(parent, layout, 'onClick', 150, 50).handled).toBe(false)
    expect(childFired).toBe(false)
    expect(hitPathAtPoint(parent, layout, 150, 50)).toBeNull()
    expect(hasInteractiveHitAtPoint(parent, layout, 150, 50)).toBe(false)
    expect(getCursorAtPoint(parent, layout, 150, 50)).toBeNull()
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

  it('pointerEvents none on top sibling: onWheel reaches handler on box behind (overlay onWheel is not invoked)', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onWheel: () => { log.push('back') } })
    const front = box({
      width: 50,
      height: 50,
      zIndex: 2,
      pointerEvents: 'none',
      onWheel: () => { log.push('front') },
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

    expect(dispatchHit(root, layout, 'onWheel', 10, 10).handled).toBe(true)
    expect(log).toEqual(['back'])
    expect(hasInteractiveHitAtPoint(root, layout, 10, 10)).toBe(true)
  })

  it('only pointerEvents none is pass-through; unknown strings and non-strings keep the box in the hit stack', () => {
    const log: string[] = []
    const back = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log.push('back') } })
    const bogus = box({
      width: 50,
      height: 50,
      zIndex: 1,
      pointerEvents: 'bogus' as never,
      onClick: () => { log.push('bogus') },
    })
    const root = box({ width: 100, height: 100 }, [back, bogus])
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
    expect(log).toEqual(['bogus'])

    const log2: string[] = []
    const back2 = box({ width: 50, height: 50, zIndex: 0, onClick: () => { log2.push('back') } })
    const corrupt = box({
      width: 50,
      height: 50,
      zIndex: 1,
      pointerEvents: 0 as never,
      onClick: () => { log2.push('corrupt') },
    })
    const root2 = box({ width: 100, height: 100 }, [back2, corrupt])
    dispatchHit(root2, layout, 'onClick', 10, 10)
    expect(log2).toEqual(['corrupt'])
  })
})

describe('Yoga-computed row layout and hit routing (document direction)', () => {
  beforeAll(async () => {
    await init()
  })

  it('LTR document: flex row places DOM-first child at a smaller x; dispatchHit follows geometry', () => {
    const log: string[] = []
    const first = box({ width: 50, height: 50, onClick: () => { log.push('dom-first') } })
    const second = box({ width: 50, height: 50, onClick: () => { log.push('dom-second') } })
    const root = box({ width: 100, height: 50, flexDirection: 'row' }, [first, second])
    const layout = computeLayout(toLayoutTree(root), { width: 100, height: 50, direction: 'ltr' })

    expect(layout.children.length).toBe(2)
    const a = layout.children[0]!
    const b = layout.children[1]!
    expect(a.x).toBeLessThan(b.x)

    const cy = a.y + a.height / 2
    dispatchHit(root, layout, 'onClick', a.x + a.width / 2, cy)
    expect(log).toEqual(['dom-first'])
    log.length = 0
    dispatchHit(root, layout, 'onClick', b.x + b.width / 2, cy)
    expect(log).toEqual(['dom-second'])
  })

  it('RTL document: flex row mirrors along x; DOM-first child has a larger x; dispatchHit follows geometry', () => {
    const log: string[] = []
    const first = box({ width: 50, height: 50, onClick: () => { log.push('dom-first') } })
    const second = box({ width: 50, height: 50, onClick: () => { log.push('dom-second') } })
    const root = box({ width: 100, height: 50, flexDirection: 'row' }, [first, second])
    const layout = computeLayout(toLayoutTree(root), { width: 100, height: 50, direction: 'rtl' })

    expect(layout.children.length).toBe(2)
    const a = layout.children[0]!
    const b = layout.children[1]!
    expect(a.x).toBeGreaterThan(b.x)

    const cy = a.y + a.height / 2
    dispatchHit(root, layout, 'onClick', a.x + a.width / 2, cy)
    expect(log).toEqual(['dom-first'])
    log.length = 0
    dispatchHit(root, layout, 'onClick', b.x + b.width / 2, cy)
    expect(log).toEqual(['dom-second'])
  })
})

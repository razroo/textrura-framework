import { describe, it, expect } from 'vitest'
import { dispatchHit, getCursorAtPoint, hasInteractiveHitAtPoint } from '../hit-test.js'
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
})

describe('hasInteractiveHitAtPoint', () => {
  it('detects interactive containers at pointer position', () => {
    const interactive = box({ width: 120, height: 40, onKeyDown: () => undefined })
    const root = box({ width: 200, height: 100 }, [interactive])
    const layout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [{ x: 20, y: 20, width: 120, height: 40, children: [] }],
    }
    expect(hasInteractiveHitAtPoint(root, layout, 30, 30)).toBe(true)
    expect(hasInteractiveHitAtPoint(root, layout, 5, 5)).toBe(false)
  })
})

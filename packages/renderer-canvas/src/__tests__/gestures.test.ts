import { describe, it, expect } from 'vitest'
import { attachGestureRecognizers } from '../gestures.js'
import type { CanvasGestureRecognizerLike } from '../gestures.js'
import type { PointerSample } from '@geometra/core'

type Listener = (event: unknown) => void

class FakeEventTarget {
  private listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener as Listener)
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener as Listener)
  }

  dispatch(type: string, event: unknown): void {
    const list = this.listeners.get(type)
    if (!list) return
    for (const listener of list) listener(event)
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0
  }
}

function makeRecorder(): CanvasGestureRecognizerLike & {
  events: Array<{ type: string; sample?: PointerSample; pointerId?: number }>
} {
  const events: Array<{ type: string; sample?: PointerSample; pointerId?: number }> = []
  return {
    events,
    pointerDown: sample => events.push({ type: 'down', sample }),
    pointerMove: sample => events.push({ type: 'move', sample }),
    pointerUp: sample => events.push({ type: 'up', sample }),
    pointerCancel: pointerId => events.push({ type: 'cancel', pointerId }),
  }
}

function makeCanvas(target: FakeEventTarget, rect = { left: 10, top: 20 }) {
  return {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    getBoundingClientRect: () => rect,
  } as unknown as HTMLCanvasElement
}

describe('attachGestureRecognizers', () => {
  it('converts pointerdown clientX/Y to canvas-space samples and fans out to all recognizers', () => {
    const canvasTarget = new FakeEventTarget()
    const docTarget = new FakeEventTarget()
    const canvas = makeCanvas(canvasTarget, { left: 10, top: 20 })
    const a = makeRecorder()
    const b = makeRecorder()

    const cleanup = attachGestureRecognizers(canvas, [a, b], {
      documentTarget: docTarget as unknown as Document,
      now: () => 42,
    })

    canvasTarget.dispatch('pointerdown', { pointerId: 1, clientX: 30, clientY: 50 })
    expect(a.events).toEqual([{ type: 'down', sample: { id: 1, x: 20, y: 30, timestampMs: 42 } }])
    expect(b.events).toEqual([{ type: 'down', sample: { id: 1, x: 20, y: 30, timestampMs: 42 } }])

    cleanup()
  })

  it('routes pointermove/up/cancel through documentTarget when trackOutsideCanvas is true (default)', () => {
    const canvasTarget = new FakeEventTarget()
    const docTarget = new FakeEventTarget()
    const canvas = makeCanvas(canvasTarget)
    const r = makeRecorder()

    const cleanup = attachGestureRecognizers(canvas, [r], {
      documentTarget: docTarget as unknown as Document,
      now: () => 0,
    })

    canvasTarget.dispatch('pointerdown', { pointerId: 7, clientX: 10, clientY: 20 })
    docTarget.dispatch('pointermove', { pointerId: 7, clientX: 60, clientY: 80 })
    docTarget.dispatch('pointerup', { pointerId: 7, clientX: 60, clientY: 80 })

    expect(r.events.map(e => e.type)).toEqual(['down', 'move', 'up'])

    // Moves for unknown pointer ids are filtered out.
    docTarget.dispatch('pointermove', { pointerId: 99, clientX: 0, clientY: 0 })
    expect(r.events.map(e => e.type)).toEqual(['down', 'move', 'up'])

    cleanup()
    expect(canvasTarget.listenerCount('pointerdown')).toBe(0)
    expect(docTarget.listenerCount('pointermove')).toBe(0)
    expect(docTarget.listenerCount('pointerup')).toBe(0)
    expect(docTarget.listenerCount('pointercancel')).toBe(0)
  })

  it('clamps all listeners to the canvas when trackOutsideCanvas is false', () => {
    const canvasTarget = new FakeEventTarget()
    const docTarget = new FakeEventTarget()
    const canvas = makeCanvas(canvasTarget)
    const r = makeRecorder()

    const cleanup = attachGestureRecognizers(canvas, [r], {
      trackOutsideCanvas: false,
      documentTarget: docTarget as unknown as Document,
      now: () => 0,
    })

    canvasTarget.dispatch('pointerdown', { pointerId: 1, clientX: 10, clientY: 20 })
    docTarget.dispatch('pointermove', { pointerId: 1, clientX: 60, clientY: 80 })
    // Document move ignored because we only listen on canvas.
    expect(r.events.map(e => e.type)).toEqual(['down'])
    canvasTarget.dispatch('pointermove', { pointerId: 1, clientX: 60, clientY: 80 })
    expect(r.events.map(e => e.type)).toEqual(['down', 'move'])

    cleanup()
  })

  it('pointercancel forwards the pointer id and drops the active pointer', () => {
    const canvasTarget = new FakeEventTarget()
    const docTarget = new FakeEventTarget()
    const canvas = makeCanvas(canvasTarget)
    const r = makeRecorder()

    const cleanup = attachGestureRecognizers(canvas, [r], {
      documentTarget: docTarget as unknown as Document,
      now: () => 0,
    })

    canvasTarget.dispatch('pointerdown', { pointerId: 3, clientX: 10, clientY: 20 })
    docTarget.dispatch('pointercancel', { pointerId: 3 })
    expect(r.events[r.events.length - 1]).toEqual({ type: 'cancel', pointerId: 3 })

    // After cancel, further moves for this id are ignored.
    docTarget.dispatch('pointermove', { pointerId: 3, clientX: 100, clientY: 100 })
    expect(r.events.map(e => e.type)).toEqual(['down', 'cancel'])

    cleanup()
  })

  it('uses the options.now timestamp source for every sample', () => {
    const canvasTarget = new FakeEventTarget()
    const docTarget = new FakeEventTarget()
    const canvas = makeCanvas(canvasTarget)
    const r = makeRecorder()
    let t = 0
    const clock = () => {
      t += 10
      return t
    }
    const cleanup = attachGestureRecognizers(canvas, [r], {
      documentTarget: docTarget as unknown as Document,
      now: clock,
    })
    canvasTarget.dispatch('pointerdown', { pointerId: 1, clientX: 10, clientY: 20 })
    docTarget.dispatch('pointermove', { pointerId: 1, clientX: 12, clientY: 22 })
    expect(r.events.map(e => e.sample?.timestampMs)).toEqual([10, 20])
    cleanup()
  })
})

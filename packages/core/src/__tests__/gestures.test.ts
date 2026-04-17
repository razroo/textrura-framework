import { describe, expect, it } from 'vitest'
import {
  createPanRecognizer,
  createPinchRecognizer,
  createSwipeRecognizer,
} from '../gestures.js'
import type { PanEvent, PinchEvent, SwipeEvent } from '../gestures.js'

function pointer(id: number, x: number, y: number, timestampMs: number) {
  return { id, x, y, timestampMs }
}

describe('createPanRecognizer', () => {
  it('fires onStart only after the pointer crosses minDistance', () => {
    const started: PanEvent[] = []
    const moves: PanEvent[] = []
    const pan = createPanRecognizer({
      minDistance: 5,
      onStart: e => started.push(e),
      onMove: e => moves.push(e),
    })
    pan.pointerDown(pointer(1, 100, 100, 0))
    pan.pointerMove(pointer(1, 102, 100, 10)) // under threshold
    expect(started.length).toBe(0)
    expect(moves.length).toBe(0)
    pan.pointerMove(pointer(1, 106, 100, 20)) // crosses 5px
    expect(started.length).toBe(1)
    expect(started[0]!.deltaX).toBe(6)
    expect(started[0]!.deltaY).toBe(0)
    pan.pointerMove(pointer(1, 120, 110, 30))
    expect(moves.length).toBe(1)
    expect(moves[0]!.deltaX).toBe(20)
  })

  it('fires onEnd with final deltas and clears active state', () => {
    const ends: PanEvent[] = []
    const pan = createPanRecognizer({ minDistance: 0, onEnd: e => ends.push(e) })
    pan.pointerDown(pointer(1, 0, 0, 0))
    pan.pointerMove(pointer(1, 10, 0, 10))
    pan.pointerUp(pointer(1, 15, 0, 20))
    expect(ends.length).toBe(1)
    expect(ends[0]!.deltaX).toBe(15)
    expect(pan.isActive()).toBe(false)
  })

  it('ignores pointer events for IDs that never went down', () => {
    const moves: PanEvent[] = []
    const pan = createPanRecognizer({ minDistance: 0, onMove: e => moves.push(e) })
    pan.pointerMove(pointer(99, 10, 10, 0))
    pan.pointerUp(pointer(99, 20, 20, 10))
    expect(moves.length).toBe(0)
  })

  it('pointerCancel on a gesture that never started does not emit onCancel', () => {
    const cancels: PanEvent[] = []
    const pan = createPanRecognizer({ minDistance: 50, onCancel: e => cancels.push(e) })
    pan.pointerDown(pointer(1, 0, 0, 0))
    pan.pointerMove(pointer(1, 2, 2, 10))
    pan.pointerCancel(1)
    expect(cancels.length).toBe(0)
  })

  it('coerces non-finite minDistance back to the default', () => {
    const started: PanEvent[] = []
    const pan = createPanRecognizer({
      minDistance: Number.NaN,
      onStart: e => started.push(e),
    })
    pan.pointerDown(pointer(1, 0, 0, 0))
    pan.pointerMove(pointer(1, 3, 0, 10))
    expect(started.length).toBe(0)
    pan.pointerMove(pointer(1, 10, 0, 20))
    expect(started.length).toBe(1)
  })
})

describe('createSwipeRecognizer', () => {
  it('classifies a fast horizontal swipe as right', () => {
    const swipes: SwipeEvent[] = []
    const sw = createSwipeRecognizer({
      minDistance: 10,
      minVelocity: 0.1,
      onSwipe: e => swipes.push(e),
    })
    sw.pointerDown(pointer(1, 0, 0, 0))
    sw.pointerMove(pointer(1, 50, 5, 50))
    sw.pointerUp(pointer(1, 100, 10, 100))
    expect(swipes.length).toBe(1)
    expect(swipes[0]!.direction).toBe('right')
    expect(swipes[0]!.elapsedMs).toBe(100)
  })

  it('skips swipes that are too slow', () => {
    const swipes: SwipeEvent[] = []
    const sw = createSwipeRecognizer({
      minDistance: 10,
      minVelocity: 5,
      onSwipe: e => swipes.push(e),
    })
    sw.pointerDown(pointer(1, 0, 0, 0))
    sw.pointerMove(pointer(1, 50, 0, 500))
    sw.pointerUp(pointer(1, 100, 0, 1000))
    expect(swipes.length).toBe(0)
  })

  it('skips swipes shorter than minDistance', () => {
    const swipes: SwipeEvent[] = []
    const sw = createSwipeRecognizer({
      minDistance: 200,
      minVelocity: 0.01,
      onSwipe: e => swipes.push(e),
    })
    sw.pointerDown(pointer(1, 0, 0, 0))
    sw.pointerUp(pointer(1, 50, 0, 100))
    expect(swipes.length).toBe(0)
  })

  it('classifies vertical dominant motion as up/down', () => {
    const swipes: SwipeEvent[] = []
    const sw = createSwipeRecognizer({
      minDistance: 10,
      minVelocity: 0.1,
      onSwipe: e => swipes.push(e),
    })
    sw.pointerDown(pointer(1, 0, 0, 0))
    sw.pointerMove(pointer(1, 5, 40, 50))
    sw.pointerUp(pointer(1, 10, 80, 100))
    expect(swipes[0]!.direction).toBe('down')
  })
})

describe('createPinchRecognizer', () => {
  it('emits onStart after distance changes by minDeltaDistance and tracks scale', () => {
    const starts: PinchEvent[] = []
    const moves: PinchEvent[] = []
    const ends: PinchEvent[] = []
    const pinch = createPinchRecognizer({
      minDeltaDistance: 5,
      onStart: e => starts.push(e),
      onMove: e => moves.push(e),
      onEnd: e => ends.push(e),
    })
    pinch.pointerDown(pointer(1, 100, 100, 0))
    pinch.pointerDown(pointer(2, 200, 100, 0))
    // start distance is 100
    pinch.pointerMove(pointer(2, 210, 100, 10)) // 110 - below minDelta? 10 >= 5, yes
    expect(starts.length).toBe(1)
    expect(starts[0]!.scale).toBeCloseTo(1.1, 5)
    pinch.pointerMove(pointer(2, 300, 100, 20))
    expect(moves.length).toBe(1)
    expect(moves[0]!.scale).toBeCloseTo(2, 5)
    pinch.pointerUp(pointer(2, 300, 100, 30))
    expect(ends.length).toBe(1)
    expect(pinch.isActive()).toBe(false)
  })

  it('ignores extra pointers past the second', () => {
    const pinch = createPinchRecognizer()
    pinch.pointerDown(pointer(1, 0, 0, 0))
    pinch.pointerDown(pointer(2, 100, 0, 0))
    pinch.pointerDown(pointer(3, 50, 50, 0))
    // Extra pointer should not replace existing ones; gesture still reflects 1+2.
    expect(pinch.isActive()).toBe(false) // not started until move crosses minDelta
    pinch.pointerMove(pointer(2, 200, 0, 10))
    expect(pinch.isActive()).toBe(true)
  })

  it('does not start when distance stays within minDeltaDistance', () => {
    const starts: PinchEvent[] = []
    const pinch = createPinchRecognizer({ minDeltaDistance: 50, onStart: e => starts.push(e) })
    pinch.pointerDown(pointer(1, 0, 0, 0))
    pinch.pointerDown(pointer(2, 100, 0, 0))
    pinch.pointerMove(pointer(2, 110, 0, 10))
    expect(starts.length).toBe(0)
  })

  it('ends gesture when a pointer cancels', () => {
    const ends: PinchEvent[] = []
    const pinch = createPinchRecognizer({ minDeltaDistance: 1, onEnd: e => ends.push(e) })
    pinch.pointerDown(pointer(1, 0, 0, 0))
    pinch.pointerDown(pointer(2, 100, 0, 0))
    pinch.pointerMove(pointer(2, 120, 0, 10))
    pinch.pointerCancel(1)
    expect(ends.length).toBe(1)
    expect(pinch.isActive()).toBe(false)
  })

  it('reset clears all state without emitting callbacks', () => {
    const ends: PinchEvent[] = []
    const pinch = createPinchRecognizer({ onEnd: e => ends.push(e) })
    pinch.pointerDown(pointer(1, 0, 0, 0))
    pinch.pointerDown(pointer(2, 100, 0, 0))
    pinch.pointerMove(pointer(2, 120, 0, 10))
    pinch.reset()
    expect(ends.length).toBe(0)
    expect(pinch.isActive()).toBe(false)
  })
})

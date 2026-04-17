/**
 * Renderer-agnostic pointer gesture recognizers: pan/drag, swipe, and pinch.
 *
 * Each recognizer is a pure state machine. Host code (canvas hit-test,
 * terminal pointer, native bridge, tests) feeds it pointer events via
 * `pointerDown`/`pointerMove`/`pointerUp`/`pointerCancel`; the recognizer
 * invokes callbacks when thresholds are crossed. No DOM, no raf.
 *
 * Pointer IDs are integers (matching Pointer Events API conventions), but any
 * stable per-pointer identity works — synthesized ids from terminal tap
 * protocols are fine as long as down/move/up match.
 */

export interface PointerSample {
  id: number
  x: number
  y: number
  /** High-resolution timestamp in ms. Finite values only; callers are responsible. */
  timestampMs: number
}

export interface PanEvent {
  pointerId: number
  x: number
  y: number
  startX: number
  startY: number
  deltaX: number
  deltaY: number
  /** Time since the gesture started moving past `minDistance`. */
  elapsedMs: number
}

export interface PanRecognizerOptions {
  /** Distance in px the pointer must travel before `onStart` fires. Default 4. */
  minDistance?: number
  /** Fires when the pointer crosses `minDistance`. */
  onStart?: (event: PanEvent) => void
  /** Fires on each pointer move after `onStart`. */
  onMove?: (event: PanEvent) => void
  /** Fires on `pointerUp`. Carries the final sample. */
  onEnd?: (event: PanEvent) => void
  /** Fires on `pointerCancel`. No event is built if the gesture never started. */
  onCancel?: (event: PanEvent) => void
}

export interface PanRecognizer {
  pointerDown(sample: PointerSample): void
  pointerMove(sample: PointerSample): void
  pointerUp(sample: PointerSample): void
  pointerCancel(pointerId: number): void
  /** True while the pan gesture has crossed `minDistance` and not yet ended. */
  isActive(): boolean
  /** Drop any in-flight gesture without firing callbacks. */
  reset(): void
}

interface PanTracked {
  start: PointerSample
  last: PointerSample
  startTimeMs: number
  startedGesture: boolean
}

function resolveMinDistance(distance: number | undefined, fallback: number): number {
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) return fallback
  return distance
}

export function createPanRecognizer(options: PanRecognizerOptions = {}): PanRecognizer {
  const minDistance = resolveMinDistance(options.minDistance, 4)
  const tracked = new Map<number, PanTracked>()

  function buildEvent(t: PanTracked, now: PointerSample): PanEvent {
    return {
      pointerId: t.start.id,
      x: now.x,
      y: now.y,
      startX: t.start.x,
      startY: t.start.y,
      deltaX: now.x - t.start.x,
      deltaY: now.y - t.start.y,
      elapsedMs: now.timestampMs - t.startTimeMs,
    }
  }

  return {
    pointerDown(sample) {
      tracked.set(sample.id, {
        start: sample,
        last: sample,
        startTimeMs: sample.timestampMs,
        startedGesture: false,
      })
    },
    pointerMove(sample) {
      const t = tracked.get(sample.id)
      if (!t) return
      t.last = sample
      if (!t.startedGesture) {
        const dx = sample.x - t.start.x
        const dy = sample.y - t.start.y
        const dist2 = dx * dx + dy * dy
        if (dist2 >= minDistance * minDistance) {
          t.startedGesture = true
          t.startTimeMs = sample.timestampMs
          options.onStart?.(buildEvent(t, sample))
        }
        return
      }
      options.onMove?.(buildEvent(t, sample))
    },
    pointerUp(sample) {
      const t = tracked.get(sample.id)
      if (!t) return
      tracked.delete(sample.id)
      if (!t.startedGesture) return
      t.last = sample
      options.onEnd?.(buildEvent(t, sample))
    },
    pointerCancel(pointerId) {
      const t = tracked.get(pointerId)
      if (!t) return
      tracked.delete(pointerId)
      if (!t.startedGesture) return
      options.onCancel?.(buildEvent(t, t.last))
    },
    isActive() {
      for (const t of tracked.values()) if (t.startedGesture) return true
      return false
    },
    reset() {
      tracked.clear()
    },
  }
}

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

export interface SwipeEvent {
  pointerId: number
  direction: SwipeDirection
  deltaX: number
  deltaY: number
  /** px/ms magnitude of the final velocity. */
  velocity: number
  elapsedMs: number
}

export interface SwipeRecognizerOptions {
  /** Minimum total travel (px) before a swipe can register. Default 24. */
  minDistance?: number
  /** Minimum velocity (px/ms) of the release. Default 0.3. */
  minVelocity?: number
  /** Swipe must complete within this many ms. Default 600. */
  maxDurationMs?: number
  onSwipe?: (event: SwipeEvent) => void
}

export interface SwipeRecognizer {
  pointerDown(sample: PointerSample): void
  pointerMove(sample: PointerSample): void
  pointerUp(sample: PointerSample): void
  pointerCancel(pointerId: number): void
  reset(): void
}

function classifyDirection(dx: number, dy: number): SwipeDirection {
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up'
}

interface SwipeTracked {
  start: PointerSample
  samples: PointerSample[]
}

const VELOCITY_WINDOW_MS = 100

export function createSwipeRecognizer(options: SwipeRecognizerOptions = {}): SwipeRecognizer {
  const minDistance = resolveMinDistance(options.minDistance, 24)
  const minVelocity = typeof options.minVelocity === 'number' && Number.isFinite(options.minVelocity) && options.minVelocity > 0
    ? options.minVelocity
    : 0.3
  const maxDurationMs = typeof options.maxDurationMs === 'number' && Number.isFinite(options.maxDurationMs) && options.maxDurationMs > 0
    ? options.maxDurationMs
    : 600
  const tracked = new Map<number, SwipeTracked>()

  return {
    pointerDown(sample) {
      tracked.set(sample.id, { start: sample, samples: [sample] })
    },
    pointerMove(sample) {
      const t = tracked.get(sample.id)
      if (!t) return
      t.samples.push(sample)
      // Keep only the trailing window so velocity doesn't drift on long pans.
      const cutoff = sample.timestampMs - VELOCITY_WINDOW_MS
      while (t.samples.length > 2 && t.samples[0]!.timestampMs < cutoff) t.samples.shift()
    },
    pointerUp(sample) {
      const t = tracked.get(sample.id)
      if (!t) return
      tracked.delete(sample.id)
      const dx = sample.x - t.start.x
      const dy = sample.y - t.start.y
      const dist = Math.hypot(dx, dy)
      const elapsedMs = sample.timestampMs - t.start.timestampMs
      if (dist < minDistance || elapsedMs <= 0 || elapsedMs > maxDurationMs) return
      const windowStart = t.samples[0]!
      const ws = sample.timestampMs - windowStart.timestampMs
      const wdx = sample.x - windowStart.x
      const wdy = sample.y - windowStart.y
      const velocity = ws > 0 ? Math.hypot(wdx, wdy) / ws : 0
      if (velocity < minVelocity) return
      options.onSwipe?.({
        pointerId: t.start.id,
        direction: classifyDirection(dx, dy),
        deltaX: dx,
        deltaY: dy,
        velocity,
        elapsedMs,
      })
    },
    pointerCancel(pointerId) {
      tracked.delete(pointerId)
    },
    reset() {
      tracked.clear()
    },
  }
}

export interface PinchEvent {
  pointerIds: [number, number]
  /** Current distance between the two tracked pointers. */
  distance: number
  /** Distance between pointers when the gesture became active. */
  startDistance: number
  /** `distance / startDistance`. Values > 1 = zoom in, < 1 = zoom out. */
  scale: number
  /** Midpoint of the two pointers, useful as a zoom focal point. */
  centerX: number
  centerY: number
  elapsedMs: number
}

export interface PinchRecognizerOptions {
  /** Minimum absolute distance change (px) before `onStart` fires. Default 4. */
  minDeltaDistance?: number
  onStart?: (event: PinchEvent) => void
  onMove?: (event: PinchEvent) => void
  onEnd?: (event: PinchEvent) => void
}

export interface PinchRecognizer {
  pointerDown(sample: PointerSample): void
  pointerMove(sample: PointerSample): void
  pointerUp(sample: PointerSample): void
  pointerCancel(pointerId: number): void
  isActive(): boolean
  reset(): void
}

interface PinchState {
  pointers: Map<number, PointerSample>
  lastPair: [PointerSample, PointerSample] | null
  startDistance: number
  startTimeMs: number
  started: boolean
}

export function createPinchRecognizer(options: PinchRecognizerOptions = {}): PinchRecognizer {
  const minDelta = resolveMinDistance(options.minDeltaDistance, 4)
  const state: PinchState = {
    pointers: new Map(),
    lastPair: null,
    startDistance: 0,
    startTimeMs: 0,
    started: false,
  }

  function twoPointers(): [PointerSample, PointerSample] | null {
    if (state.pointers.size !== 2) return null
    const iter = state.pointers.values()
    const first = iter.next().value as PointerSample
    const second = iter.next().value as PointerSample
    return [first, second]
  }

  function distance(a: PointerSample, b: PointerSample): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function buildEvent(pair: [PointerSample, PointerSample], now: number): PinchEvent {
    const d = distance(pair[0], pair[1])
    return {
      pointerIds: [pair[0].id, pair[1].id],
      distance: d,
      startDistance: state.startDistance || d,
      scale: state.startDistance > 0 ? d / state.startDistance : 1,
      centerX: (pair[0].x + pair[1].x) / 2,
      centerY: (pair[0].y + pair[1].y) / 2,
      elapsedMs: now - state.startTimeMs,
    }
  }

  function endGesture(lastTimestamp: number): void {
    if (!state.started) return
    const pair = state.lastPair ?? twoPointers()
    if (pair) options.onEnd?.(buildEvent(pair, lastTimestamp))
    state.started = false
    state.startDistance = 0
    state.lastPair = null
  }

  return {
    pointerDown(sample) {
      if (state.pointers.size >= 2 && !state.pointers.has(sample.id)) return
      state.pointers.set(sample.id, sample)
      if (state.pointers.size === 2 && !state.started) {
        const pair = twoPointers()!
        state.startDistance = distance(pair[0], pair[1])
        state.startTimeMs = sample.timestampMs
        state.lastPair = pair
      }
    },
    pointerMove(sample) {
      if (!state.pointers.has(sample.id)) return
      state.pointers.set(sample.id, sample)
      const pair = twoPointers()
      if (!pair) return
      state.lastPair = pair
      const d = distance(pair[0], pair[1])
      if (!state.started) {
        if (Math.abs(d - state.startDistance) < minDelta) return
        state.started = true
        options.onStart?.(buildEvent(pair, sample.timestampMs))
        return
      }
      options.onMove?.(buildEvent(pair, sample.timestampMs))
    },
    pointerUp(sample) {
      const existed = state.pointers.has(sample.id)
      state.pointers.delete(sample.id)
      if (existed && state.pointers.size < 2) endGesture(sample.timestampMs)
    },
    pointerCancel(pointerId) {
      const existed = state.pointers.has(pointerId)
      state.pointers.delete(pointerId)
      if (existed && state.pointers.size < 2) endGesture(state.startTimeMs)
    },
    isActive() {
      return state.started
    },
    reset() {
      state.pointers.clear()
      state.started = false
      state.startDistance = 0
      state.startTimeMs = 0
      state.lastPair = null
    },
  }
}

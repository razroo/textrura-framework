import { signal } from './signals.js'
import type { Signal } from './signals.js'

const raf = typeof requestAnimationFrame !== 'undefined'
  ? requestAnimationFrame
  : (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16) as unknown as number

const cancelRaf = typeof cancelAnimationFrame !== 'undefined'
  ? cancelAnimationFrame
  : (id: number) => clearTimeout(id)

/** Common easing functions. */
export const easing = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t * t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
}

export type EasingFn = (t: number) => number
export type TweenPlaybackState = 'idle' | 'running' | 'paused' | 'finished' | 'cancelled'

export interface TweenTimeline {
  value: Signal<number>
  /** Schedule/interrupt toward a new target. */
  to(to: number, durationMs: number, easingFn?: EasingFn): void
  /** Deterministically advance timeline by fixed milliseconds. */
  step(deltaMs: number): number
  pause(): void
  resume(): void
  cancel(): void
  state(): TweenPlaybackState
}

export type MotionPreference = 'full' | 'reduced'

const motionPreference = signal<MotionPreference>('full')

/** Set global motion preference for animation helpers. */
export function setMotionPreference(preference: MotionPreference): void {
  motionPreference.set(preference)
}

/** Read current global motion preference. */
export function getMotionPreference(): MotionPreference {
  return motionPreference.peek()
}

/**
 * Create an animated signal that transitions from `from` to `to` over `duration` ms.
 * Returns a signal whose `.value` tracks the current interpolated value.
 */
export function transition(
  from: number,
  to: number,
  duration: number,
  easingFn: EasingFn = easing.easeInOut,
  options: { respectReducedMotion?: boolean } = {},
): Signal<number> {
  const s = signal(from)
  if (options.respectReducedMotion && getMotionPreference() === 'reduced') {
    s.set(to)
    return s
  }
  const start = Date.now()

  function tick() {
    const elapsed = Date.now() - start
    const t = Math.min(elapsed / duration, 1)
    s.set(from + (to - from) * easingFn(t))
    if (t < 1) raf(tick)
  }

  raf(tick)
  return s
}

/**
 * Deterministic tween timeline for tests and frame-stepped animation orchestration.
 * Unlike `transition()`, this helper does not use `requestAnimationFrame`.
 */
export function createTweenTimeline(initialValue: number): TweenTimeline {
  const value = signal(initialValue)
  let from = initialValue
  let to = initialValue
  let elapsed = 0
  let duration = 0
  let easingFn: EasingFn = easing.linear
  let playbackState: TweenPlaybackState = 'idle'

  function toTarget(nextTo: number, durationMs: number, nextEasing: EasingFn = easing.easeInOut): void {
    if (getMotionPreference() === 'reduced') {
      value.set(nextTo)
      from = nextTo
      to = nextTo
      elapsed = 0
      duration = 1
      easingFn = nextEasing
      playbackState = 'finished'
      return
    }
    from = value.peek()
    to = nextTo
    elapsed = 0
    duration = Math.max(1, durationMs)
    easingFn = nextEasing
    playbackState = 'running'
  }

  function step(deltaMs: number): number {
    if (playbackState !== 'running') return value.peek()
    elapsed += Math.max(0, deltaMs)
    const t = Math.min(elapsed / duration, 1)
    const next = from + (to - from) * easingFn(t)
    value.set(next)
    if (t >= 1) {
      playbackState = 'finished'
    }
    return next
  }

  function pause(): void {
    if (playbackState === 'running') playbackState = 'paused'
  }

  function resume(): void {
    if (playbackState === 'paused') playbackState = 'running'
  }

  function cancel(): void {
    if (playbackState === 'running' || playbackState === 'paused') {
      playbackState = 'cancelled'
    }
  }

  return {
    value,
    to: toTarget,
    step,
    pause,
    resume,
    cancel,
    state: () => playbackState,
  }
}

/**
 * Create a spring-physics animated signal that follows a target value.
 * Returns a signal that smoothly converges to `target.value`.
 */
export function spring(
  target: Signal<number>,
  config: { stiffness?: number; damping?: number; mass?: number } = {},
): Signal<number> {
  const { stiffness = 170, damping = 26, mass = 1 } = config
  const s = signal(target.peek())
  let velocity = 0
  let prevTarget = target.peek()
  let id: number | null = null

  function tick() {
    const currentTarget = target.peek()
    const current = s.peek()
    const displacement = current - currentTarget
    const springForce = -stiffness * displacement
    const dampingForce = -damping * velocity
    const acceleration = (springForce + dampingForce) / mass

    velocity += acceleration * (1 / 60)
    const next = current + velocity * (1 / 60)

    if (Math.abs(velocity) < 0.01 && Math.abs(displacement) < 0.01) {
      s.set(currentTarget)
      id = null
      return
    }

    s.set(next)
    id = raf(tick) as unknown as number
  }

  // Watch for target changes
  function start() {
    if (id === null) {
      id = raf(tick) as unknown as number
    }
  }

  // Check target periodically (or rely on external calls)
  function checkTarget() {
    const curr = target.peek()
    if (curr !== prevTarget) {
      prevTarget = curr
      start()
    }
    raf(checkTarget)
  }
  raf(checkTarget)
  start()

  return s
}

/**
 * Run a raw animation loop. The callback receives delta time in seconds.
 * Return `false` from the callback to stop. Returns a stop function.
 */
export function animationLoop(callback: (dt: number) => boolean): () => void {
  let lastTime = Date.now()
  let running = true
  let id: number

  function tick() {
    if (!running) return
    const now = Date.now()
    const dt = (now - lastTime) / 1000
    lastTime = now
    if (callback(dt) !== false) {
      id = raf(tick) as unknown as number
    } else {
      running = false
    }
  }

  id = raf(tick) as unknown as number
  return () => { running = false; cancelRaf(id) }
}

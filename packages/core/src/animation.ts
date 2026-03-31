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

/**
 * Create an animated signal that transitions from `from` to `to` over `duration` ms.
 * Returns a signal whose `.value` tracks the current interpolated value.
 */
export function transition(
  from: number,
  to: number,
  duration: number,
  easingFn: EasingFn = easing.easeInOut,
): Signal<number> {
  const s = signal(from)
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

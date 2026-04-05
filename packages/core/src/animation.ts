import { finiteNumberOrZero } from './layout-bounds.js'
import { signal } from './signals.js'
import type { Signal } from './signals.js'

// Require a callable: some environments set RAF globals to `null` or a non-function stub.
const raf =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16) as unknown as number

const cancelRaf =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id: number) => clearTimeout(id)

/** Advance amount for timeline stepping: finite `deltaMs` clamped to `>= 0`; otherwise `0` (NaN/±Infinity cannot poison `elapsed`). */
function stepDeltaMs(deltaMs: number): number {
  return typeof deltaMs === 'number' && Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0
}

/**
 * Named easing curves for {@link transition}, {@link createTweenTimeline}, and {@link createPropertyTimeline}.
 *
 * Each function expects normalized time `t` in `[0, 1]` (inclusive) and returns eased progress in `[0, 1]`
 * at the endpoints; behavior outside that interval is not part of the contract.
 */
export const easing = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t * t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
}

/** Easing callback: `t` is normalized time in `[0, 1]`; return eased progress (typically in `[0, 1]`). */
export type EasingFn = (t: number) => number
export type TweenPlaybackState = 'idle' | 'running' | 'paused' | 'finished' | 'cancelled'

export interface TweenTimeline {
  value: Signal<number>
  /** Schedule/interrupt toward a new target (non-finite values normalize to `0`, same as the initial value). */
  to(to: number, durationMs: number, easingFn?: EasingFn): void
  /**
   * Deterministically advance the timeline by up to `deltaMs` ms (finite values clamped to `>= 0`).
   * Non-finite or non-number `deltaMs` is treated as `0`.
   */
  step(deltaMs: number): number
  pause(): void
  resume(): void
  cancel(): void
  state(): TweenPlaybackState
}

export interface PropertyTimeline {
  values: Record<string, Signal<number>>
  to(targets: Record<string, number>, durationMs: number, easingFn?: EasingFn): void
  /** Per-key stepping; `deltaMs` rules match {@link TweenTimeline.step}. */
  step(deltaMs: number): Record<string, number>
  pause(): void
  resume(): void
  cancel(): void
  state(): TweenPlaybackState
}

export type MotionPreference = 'full' | 'reduced'

const motionPreference = signal<MotionPreference>('full')

/**
 * Set global motion preference for animation helpers.
 * Runtime values other than `'reduced'` normalize to `'full'` so bad serialized or plain-JS callers
 * cannot leave the module in an unexpected state.
 */
export function setMotionPreference(preference: MotionPreference): void {
  motionPreference.set(preference === 'reduced' ? 'reduced' : 'full')
}

/** Read current global motion preference. */
export function getMotionPreference(): MotionPreference {
  return motionPreference.peek()
}

/**
 * Create an animated signal that transitions from `from` to `to` over `duration` ms.
 * Returns a signal whose `.value` tracks the current interpolated value.
 *
 * Non-finite `duration` (NaN, ±Infinity) jumps immediately to `to` with no RAF scheduling.
 * Finite non-positive durations use the same 1 ms floor as {@link createTweenTimeline} so progress
 * scale stays well-defined.
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
  if (!Number.isFinite(duration)) {
    s.set(to)
    return s
  }
  const d = Math.max(1, duration)
  const start = Date.now()

  function tick() {
    const elapsed = Date.now() - start
    const t = Math.min(elapsed / d, 1)
    s.set(from + (to - from) * easingFn(t))
    if (t < 1) raf(tick)
  }

  raf(tick)
  return s
}

/**
 * Deterministic tween timeline for tests and frame-stepped animation orchestration.
 * Unlike `transition()`, this helper does not use `requestAnimationFrame`.
 *
 * Non-finite `durationMs` (NaN, ±Infinity) jumps immediately to the target and ends in `finished`,
 * matching {@link transition} so corrupt or serialized values never leave `step()` dividing by NaN.
 *
 * Non-finite `initialValue` normalizes to `0` so a corrupt starting pose cannot freeze timelines in NaN.
 * {@link TweenTimeline.to} applies the same normalization to targets so corrupt or serialized goal values
 * cannot poison `step()` interpolation.
 *
 * {@link TweenTimeline.step} uses the same finite guard for `deltaMs` so a bad frame clock (NaN/±Infinity)
 * cannot poison internal elapsed time.
 */
export function createTweenTimeline(initialValue: number): TweenTimeline {
  const initial = finiteNumberOrZero(initialValue)
  const value = signal(initial)
  let from = initial
  let to = initial
  let elapsed = 0
  let duration = 0
  let easingFn: EasingFn = easing.linear
  let playbackState: TweenPlaybackState = 'idle'

  function toTarget(nextTo: number, durationMs: number, nextEasing: EasingFn = easing.easeInOut): void {
    const target = finiteNumberOrZero(nextTo)
    if (getMotionPreference() === 'reduced') {
      value.set(target)
      from = target
      to = target
      elapsed = 0
      duration = 1
      easingFn = nextEasing
      playbackState = 'finished'
      return
    }
    if (!Number.isFinite(durationMs)) {
      value.set(target)
      from = target
      to = target
      elapsed = 0
      duration = 1
      easingFn = nextEasing
      playbackState = 'finished'
      return
    }
    from = value.peek()
    to = target
    elapsed = 0
    duration = Math.max(1, durationMs)
    easingFn = nextEasing
    playbackState = 'running'
  }

  function step(deltaMs: number): number {
    if (playbackState !== 'running') return value.peek()
    elapsed += stepDeltaMs(deltaMs)
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
 * Multi-property deterministic timeline for geometry/paint numeric fields.
 * Typical usage includes x/y/width/height/opacity style numeric transitions.
 * Per-key initial values and {@link PropertyTimeline.to} targets use the same non-finite normalization
 * as {@link createTweenTimeline} (via each key's timeline).
 */
export function createPropertyTimeline(initialValues: Record<string, number>): PropertyTimeline {
  const timelines = new Map<string, TweenTimeline>()
  const values: Record<string, Signal<number>> = {}

  for (const key of Object.keys(initialValues)) {
    const timeline = createTweenTimeline(initialValues[key] ?? 0)
    timelines.set(key, timeline)
    values[key] = timeline.value
  }

  function ensureTimeline(key: string): TweenTimeline {
    const existing = timelines.get(key)
    if (existing) return existing
    const created = createTweenTimeline(0)
    timelines.set(key, created)
    values[key] = created.value
    return created
  }

  function to(targets: Record<string, number>, durationMs: number, easingFn: EasingFn = easing.easeInOut): void {
    for (const key of Object.keys(targets)) {
      ensureTimeline(key).to(targets[key] ?? 0, durationMs, easingFn)
    }
  }

  function step(deltaMs: number): Record<string, number> {
    const next: Record<string, number> = {}
    for (const [key, timeline] of timelines) {
      next[key] = timeline.step(deltaMs)
    }
    return next
  }

  function pause(): void {
    for (const timeline of timelines.values()) timeline.pause()
  }

  function resume(): void {
    for (const timeline of timelines.values()) timeline.resume()
  }

  function cancel(): void {
    for (const timeline of timelines.values()) timeline.cancel()
  }

  function state(): TweenPlaybackState {
    let hasRunning = false
    let hasPaused = false
    let hasCancelled = false
    let hasFinished = false
    for (const timeline of timelines.values()) {
      const s = timeline.state()
      hasRunning = hasRunning || s === 'running'
      hasPaused = hasPaused || s === 'paused'
      hasCancelled = hasCancelled || s === 'cancelled'
      hasFinished = hasFinished || s === 'finished'
    }
    if (hasRunning) return 'running'
    if (hasPaused) return 'paused'
    if (hasCancelled) return 'cancelled'
    if (hasFinished) return 'finished'
    return 'idle'
  }

  return { values, to, step, pause, resume, cancel, state }
}

const DEFAULT_SPRING_STIFFNESS = 170
const DEFAULT_SPRING_DAMPING = 26
const DEFAULT_SPRING_MASS = 1

/**
 * Normalize spring config so physics integration never sees NaN, ±Infinity, negative mass, or
 * negative stiffness (which would push away from the target or explode the state).
 * Damping may be `0` (undamped). Stiffness `0` is treated as invalid and falls back to the default
 * so the spring still has a restoring force toward the target.
 * Each field must be a primitive `number`; `BigInt` and boxed `Number` objects use defaults (strict `typeof` check).
 */
export function normalizeSpringConfig(config: {
  stiffness?: number
  damping?: number
  mass?: number
} = {}): { stiffness: number; damping: number; mass: number } {
  let mass = config.mass
  if (typeof mass !== 'number' || !Number.isFinite(mass) || mass <= 0) {
    mass = DEFAULT_SPRING_MASS
  }

  let stiffness = config.stiffness
  if (
    typeof stiffness !== 'number' ||
    !Number.isFinite(stiffness) ||
    stiffness <= 0
  ) {
    stiffness = DEFAULT_SPRING_STIFFNESS
  }

  let damping = config.damping
  if (typeof damping !== 'number' || !Number.isFinite(damping) || damping < 0) {
    damping = DEFAULT_SPRING_DAMPING
  }

  return { stiffness, damping, mass }
}

/**
 * Create a spring-physics animated signal that follows a target value.
 * Returns a signal that smoothly converges to `target.value`.
 */
export function spring(
  target: Signal<number>,
  config: { stiffness?: number; damping?: number; mass?: number } = {},
): Signal<number> {
  const { stiffness, damping, mass } = normalizeSpringConfig(config)
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
 * Return `false` from the callback to stop. Returns a stop function that is safe
 * to call multiple times (only the first call cancels a pending frame).
 *
 * When `Date.now()` moves backward (clock skew, sleep/wake, manual adjustment), `dt` is clamped to `0`
 * so callbacks never see a negative delta.
 */
export function animationLoop(callback: (dt: number) => boolean): () => void {
  let lastTime = Date.now()
  let running = true
  let id: number

  function tick() {
    if (!running) return
    const now = Date.now()
    const dt = Math.max(0, (now - lastTime) / 1000)
    lastTime = now
    if (callback(dt) !== false) {
      id = raf(tick) as unknown as number
    } else {
      running = false
    }
  }

  id = raf(tick) as unknown as number
  return () => {
    if (!running) return
    running = false
    cancelRaf(id)
  }
}

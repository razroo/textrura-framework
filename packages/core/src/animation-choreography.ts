import { finiteNumberOrZero } from './layout-bounds.js'
import { signal } from './signals.js'
import type { Signal } from './signals.js'
import {
  easing,
  getMotionPreference,
} from './animation.js'
import type { EasingFn, TweenPlaybackState } from './animation.js'

/**
 * Declarative animation choreography — `sequence`, `parallel`, and `stagger` —
 * plus a scrubbable keyframe timeline. These compose any unit that implements
 * {@link Choreographable} (which includes {@link TweenTimeline} and
 * {@link PropertyTimeline} from `animation.ts`).
 *
 * Stepping is deterministic: advancing a choreography by `deltaMs` advances each
 * child according to the choreography's policy. Finite `deltaMs` values are
 * clamped to `>= 0`; non-finite `deltaMs` is treated as `0`, same as the base
 * animation module.
 */

/** Smallest surface a choreography child needs. Both {@link TweenTimeline}
 * and {@link PropertyTimeline} already match. */
export interface Choreographable {
  step(deltaMs: number): unknown
  state(): TweenPlaybackState
  cancel(): void
}

/** Running choreography with the same lifecycle controls as an individual timeline. */
export interface Choreography {
  /** Advance by `deltaMs` ms. Returns the current aggregate state. */
  step(deltaMs: number): TweenPlaybackState
  /** Force the choreography into the cancelled state; children are also cancelled. */
  cancel(): void
  /** Aggregate state: `running` if any child is running, then `paused`, then `cancelled`, then `finished`, else `idle`. */
  state(): TweenPlaybackState
}

function clampDelta(deltaMs: number): number {
  return typeof deltaMs === 'number' && Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0
}

function aggregateState(children: ReadonlyArray<Choreographable>): TweenPlaybackState {
  let hasRunning = false
  let hasPaused = false
  let hasCancelled = false
  let hasFinished = false
  for (const child of children) {
    const s = child.state()
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

/**
 * Run children in order: each step only advances the first non-terminal child,
 * carrying remainder time forward when a child finishes mid-step. A child is
 * "terminal" when its state is `finished` or `cancelled`. Finite `deltaMs`
 * clamped to `>= 0`, non-finite coerced to `0` (matches `animation.ts`).
 *
 * The returned state is the first non-terminal child's state, or `finished`
 * when all children have terminated at least once.
 */
export function sequence(children: Choreographable[]): Choreography {
  const items = [...children]
  let index = 0
  let cancelled = false

  function step(deltaMs: number): TweenPlaybackState {
    if (cancelled) return 'cancelled'
    let remaining = clampDelta(deltaMs)
    // Advance as many finished children as the budget allows. We give a child
    // up to `remaining` ms; if it finishes and still has budget left, roll over
    // to the next child. We don't know exactly how much of `remaining` the
    // child consumed, so we treat a finishing step as consuming the whole slice.
    // Callers that need frame-exact splitting should use a keyframe timeline.
    while (index < items.length) {
      const child = items[index]!
      const before = child.state()
      if (before === 'finished' || before === 'cancelled') {
        index += 1
        continue
      }
      child.step(remaining)
      if (child.state() === 'running' || child.state() === 'paused') break
      index += 1
      remaining = 0
    }
    return state()
  }

  function cancel(): void {
    cancelled = true
    for (const child of items) child.cancel()
  }

  function state(): TweenPlaybackState {
    if (cancelled) return 'cancelled'
    if (index >= items.length) return items.length === 0 ? 'idle' : 'finished'
    return items[index]!.state()
  }

  return { step, cancel, state }
}

/** Run all children in parallel. Each step advances every child by `deltaMs`. */
export function parallel(children: Choreographable[]): Choreography {
  const items = [...children]
  let cancelled = false

  function step(deltaMs: number): TweenPlaybackState {
    if (cancelled) return 'cancelled'
    const d = clampDelta(deltaMs)
    for (const child of items) child.step(d)
    return aggregateState(items)
  }

  function cancel(): void {
    cancelled = true
    for (const child of items) child.cancel()
  }

  function state(): TweenPlaybackState {
    if (cancelled) return 'cancelled'
    return aggregateState(items)
  }

  return { step, cancel, state }
}

/**
 * Start children at staggered intervals of `delayMs`. Each child is held at
 * `idle` until its own start time is reached, then runs to completion.
 * A non-finite or negative `delayMs` is clamped to `0` (all children start together).
 */
export function stagger(children: Choreographable[], delayMs: number): Choreography {
  const items = [...children]
  const gap = typeof delayMs === 'number' && Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0
  const startsAt = items.map((_, i) => i * gap)
  let elapsed = 0
  let cancelled = false

  function step(deltaMs: number): TweenPlaybackState {
    if (cancelled) return 'cancelled'
    elapsed += clampDelta(deltaMs)
    for (let i = 0; i < items.length; i++) {
      if (elapsed < startsAt[i]!) continue
      const budget = elapsed - startsAt[i]!
      items[i]!.step(Math.min(budget, clampDelta(deltaMs)))
    }
    return aggregateState(items)
  }

  function cancel(): void {
    cancelled = true
    for (const child of items) child.cancel()
  }

  function state(): TweenPlaybackState {
    if (cancelled) return 'cancelled'
    return aggregateState(items)
  }

  return { step, cancel, state }
}

/** One keyframe in a {@link KeyframeTimeline}. `at` is the absolute time (ms) from the timeline start. */
export interface Keyframe {
  at: number
  values: Record<string, number>
  /** Optional easing applied across this keyframe's leading segment; default inherits the timeline's easing. */
  easing?: EasingFn
}

export type KeyframeTimelinePlaybackState = TweenPlaybackState

export interface KeyframeTimeline {
  /** Live signals for each tracked key. */
  values: Record<string, Signal<number>>
  /** Total duration in ms (time of the last keyframe). */
  duration: number
  /** Advance by `deltaMs`. */
  step(deltaMs: number): Record<string, number>
  /** Jump to normalized progress `t ∈ [0, 1]` without changing play state. Values outside [0, 1] clamp. */
  scrubTo(t: number): Record<string, number>
  /** Jump to absolute time in ms. Values outside [0, duration] clamp. */
  scrubToMs(ms: number): Record<string, number>
  pause(): void
  resume(): void
  cancel(): void
  state(): KeyframeTimelinePlaybackState
}

/**
 * Multi-property keyframe timeline with scrub support. Keyframes are sorted by
 * `at` and sampled with optional per-segment easing. Requires at least one
 * keyframe; single-keyframe timelines produce a constant pose and finish
 * immediately on the first step.
 *
 * Non-finite numeric values in keyframes are normalized to `0` (matches
 * {@link finiteNumberOrZero} used throughout `animation.ts`) so corrupt JSON
 * can't poison interpolation.
 *
 * When the global motion preference is `reduced`, the timeline jumps straight
 * to the final pose and ends `finished` — same policy as `createTweenTimeline`.
 */
export function createKeyframeTimeline(
  keyframes: ReadonlyArray<Keyframe>,
  options: { easing?: EasingFn } = {},
): KeyframeTimeline {
  if (keyframes.length === 0) {
    throw new Error('createKeyframeTimeline requires at least one keyframe')
  }
  const sorted = [...keyframes]
    .map(k => ({
      at: Number.isFinite(k.at) ? Math.max(0, k.at) : 0,
      values: normalizeValues(k.values),
      easing: k.easing,
    }))
    .sort((a, b) => a.at - b.at)
  const defaultEasing = options.easing ?? easing.easeInOut
  const duration = sorted[sorted.length - 1]!.at

  const keys = new Set<string>()
  for (const k of sorted) for (const key of Object.keys(k.values)) keys.add(key)

  const values = Object.create(null) as Record<string, Signal<number>>
  for (const key of keys) values[key] = signal(sorted[0]!.values[key] ?? 0)

  let elapsed = 0
  let playbackState: KeyframeTimelinePlaybackState =
    getMotionPreference() === 'reduced' || duration === 0 ? 'idle' : 'running'
  if (getMotionPreference() === 'reduced') {
    const final = sampleAt(sorted, duration, keys, defaultEasing)
    for (const key of keys) values[key]!.set(final[key] ?? 0)
    playbackState = 'finished'
  } else {
    const initial = sampleAt(sorted, 0, keys, defaultEasing)
    for (const key of keys) values[key]!.set(initial[key] ?? 0)
    if (duration === 0) playbackState = 'finished'
  }

  function step(deltaMs: number): Record<string, number> {
    if (playbackState === 'running') {
      elapsed = Math.min(elapsed + clampDelta(deltaMs), duration)
    }
    const current = sampleAt(sorted, elapsed, keys, defaultEasing)
    for (const key of keys) values[key]!.set(current[key] ?? 0)
    if (playbackState === 'running' && elapsed >= duration) {
      playbackState = 'finished'
    }
    return current
  }

  function scrubTo(t: number): Record<string, number> {
    const normalized = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0
    return scrubToMs(normalized * duration)
  }

  function scrubToMs(ms: number): Record<string, number> {
    const normalized = Number.isFinite(ms) ? Math.min(duration, Math.max(0, ms)) : 0
    elapsed = normalized
    const current = sampleAt(sorted, elapsed, keys, defaultEasing)
    for (const key of keys) values[key]!.set(current[key] ?? 0)
    return current
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
    values,
    duration,
    step,
    scrubTo,
    scrubToMs,
    pause,
    resume,
    cancel,
    state: () => playbackState,
  }
}

function normalizeValues(input: Record<string, number>): Record<string, number> {
  const out = Object.create(null) as Record<string, number>
  for (const key of Object.keys(input)) {
    out[key] = finiteNumberOrZero(input[key] ?? 0)
  }
  return out
}

function sampleAt(
  frames: ReadonlyArray<{ at: number; values: Record<string, number>; easing?: EasingFn }>,
  t: number,
  keys: Iterable<string>,
  defaultEasing: EasingFn,
): Record<string, number> {
  const out = Object.create(null) as Record<string, number>
  if (frames.length === 1) {
    const only = frames[0]!
    for (const key of keys) out[key] = only.values[key] ?? 0
    return out
  }
  if (t <= frames[0]!.at) {
    const first = frames[0]!
    for (const key of keys) out[key] = first.values[key] ?? 0
    return out
  }
  const last = frames[frames.length - 1]!
  if (t >= last.at) {
    for (const key of keys) out[key] = last.values[key] ?? 0
    return out
  }
  let left = frames[0]!
  let right = frames[1]!
  for (let i = 1; i < frames.length; i++) {
    if (frames[i]!.at >= t) {
      right = frames[i]!
      left = frames[i - 1]!
      break
    }
  }
  const span = right.at - left.at
  const localT = span > 0 ? (t - left.at) / span : 1
  const ease = right.easing ?? defaultEasing
  const eased = Number.isFinite(localT) ? ease(localT) : 1
  for (const key of keys) {
    const from = left.values[key] ?? right.values[key] ?? 0
    const to = right.values[key] ?? left.values[key] ?? 0
    out[key] = from + (to - from) * eased
  }
  return out
}

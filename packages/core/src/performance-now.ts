import { isFinitePlainNumber } from './layout-bounds.js'

/**
 * Monotonic layout timing without throwing when `performance` is partial or hostile
 * (missing `now`, non-function `now`, or a throwing implementation).
 *
 * Returns a **finite** millisecond value: `NaN`, `±Infinity`, and any non-primitive-number return
 * from `now()` become `0`, so Yoga/layout wall-time deltas stay safe for
 * {@link import('./types.js').Renderer.setFrameTimings}. Negative finite values (offsets before the
 * time origin) are preserved like positive magnitudes.
 *
 * Primitive IEEE **−0** is preserved (`Object.is` distinguishes −0 from +0).
 *
 * @see {@link readPerformanceNow} when the caller clamps deltas itself (canvas paint timing).
 */
export function safePerformanceNowMs(): number {
  try {
    const perf = globalThis.performance
    if (perf && typeof perf.now === 'function') {
      const t = perf.now()
      return isFinitePlainNumber(t) ? t : 0
    }
  } catch {
    // ignore
  }
  return 0
}

/**
 * Read `globalThis.performance.now()` when available, otherwise `0`.
 *
 * Unlike {@link safePerformanceNowMs}, any value with `typeof t === 'number'` is returned as-is,
 * including `NaN` and `±Infinity`, so broken clocks can be detected. Values that are not primitive
 * numbers (boxed numbers, `null` — `typeof null === 'object'`, strings, bigint, objects with
 * `Symbol.toPrimitive`, etc.) become `0` — `typeof` gates avoid `ToNumber` coercion that could throw on `bigint`.
 *
 * Callers computing wall-time deltas should clamp with `Number.isFinite` and `Math.max(0, …)` the
 * same way layout timings are sanitized after Yoga (see canvas renderer `lastRenderWallMs`).
 *
 * Never throws (covers missing `performance`, missing `now`, or a throwing implementation).
 */
export function readPerformanceNow(): number {
  try {
    const perf = globalThis.performance
    if (perf && typeof perf.now === 'function') {
      const t = perf.now()
      return typeof t === 'number' ? t : 0
    }
  } catch {
    // ignore
  }
  return 0
}

/**
 * Clamp raw layout wall time (ms) for {@link import('./types.js').Renderer.setFrameTimings} telemetry:
 * only primitive finite numbers are honored (same `typeof` + `Number.isFinite` rule as
 * {@link import('./layout-bounds.js').isFinitePlainNumber}); otherwise the value is treated as `0`.
 * Negative finite values and IEEE **−0** become non-negative `0` via `Math.max`.
 *
 * @param value — Milliseconds from layout timing; widened to `unknown` so corrupt or mistyped telemetry cannot coerce via `ToNumber`.
 * @returns A non-negative finite millisecond value, or `0` when the input is not a primitive finite number.
 */
export function clampNonNegativeLayoutWallMs(value: unknown): number {
  return Math.max(0, isFinitePlainNumber(value) ? value : 0)
}

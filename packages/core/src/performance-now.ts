/**
 * Monotonic layout timing without throwing when `performance` is partial or hostile
 * (missing `now`, non-function `now`, or a throwing implementation).
 *
 * Non-finite values from `now()` are coerced to `0` so layout deltas stay safe for
 * {@link Renderer.setFrameTimings}.
 */
export function safePerformanceNowMs(): number {
  try {
    const perf = globalThis.performance
    if (perf && typeof perf.now === 'function') {
      const t = perf.now()
      return typeof t === 'number' && Number.isFinite(t) ? t : 0
    }
  } catch {
    // ignore
  }
  return 0
}

/**
 * Read `globalThis.performance.now()` when available, otherwise `0`.
 * Does **not** coerce NaN/±Infinity — callers compute deltas and clamp like pre-guard canvas code.
 * Non-number returns from `now` (broken polyfills, mistaken host shims) become `0` so paint timing
 * math cannot receive strings or objects.
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

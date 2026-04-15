import { isFinitePlainNumber } from './layout-bounds.js'

/** Indices describing the visible slice of a virtual list after {@link syncVirtualWindow}. */
export interface VirtualWindowState {
  /** First visible row index (inclusive), in `[0, totalRows - 1]` when `totalRows > 0`. */
  start: number
  /** Last visible row index (inclusive); equals `start` when at most one row is visible. */
  end: number
  /** Selection index after clamping to valid row range. */
  selected: number
}

/**
 * Only primitive finite numbers count — same rule as {@link isFinitePlainNumber} / protocol patch validation
 * so corrupt host props cannot slip boxed numbers or strings into window math.
 */
function finiteOr(n: unknown, fallback: number): number {
  return isFinitePlainNumber(n) ? n : fallback
}

/** Non-negative integer row index / count: finite numbers only, then floored (aligned with `windowSize` flooring). */
function intRowMetric(n: unknown, fallback: number): number {
  return Math.max(0, Math.floor(finiteOr(n, fallback)))
}

/** Like `Math.max(0, n)` but maps non-finite `n` to `0` so corrupt floats cannot poison window indices. */
function nonNegativeOrZero(n: unknown): number {
  return isFinitePlainNumber(n) ? Math.max(0, n) : 0
}

/**
 * Inclusive last row index for a window starting at `start`. When `start + safeWindow - 1` overflows or is
 * otherwise non-finite, returns `Math.max(0, maxIndex)` when `maxIndex` is finite, else `0` (same overflow idea as
 * {@link import('./layout-bounds.js').pointInInclusiveLayoutRect}; negative caps clamp like the finite-`spanEnd` branch).
 *
 * When `spanEnd` is finite but `maxIndex` is not, returns `spanEnd` so corrupt caps cannot yield `NaN` from
 * `Math.min`. {@link syncVirtualWindow} always passes a non-negative integer `maxIndex`. When both are
 * finite, `maxIndex` is clamped to `≥ 0` before `Math.min` so a negative cap cannot produce a negative end
 * while `spanEnd` is still positive.
 *
 * Exported for parity tests and advanced virtual-list math; {@link syncVirtualWindow} is the primary API.
 *
 * @param start — Window start row (inclusive). `syncVirtualWindow` passes floored non-negative indices; direct callers may pass corrupt values — NaN/±Inf on `start` or `safeWindow` yield non-finite `spanEnd` and fall through to the `maxIndex` / `0` branches (see tests). Non-number values (including `BigInt` and boxed numbers) are treated like `NaN` for span math — they must not reach `+` (which throws on `bigint`/`number` mix) or `Number.isFinite(bigint)` (which throws in ECMAScript).
 * @param maxIndex — Inclusive last row index in the list. Negative values clamp to `0` before `Math.min` with `spanEnd` so a corrupt cap cannot produce a negative end when `spanEnd` is still positive.
 * @param safeWindow — Visible row count for the span (`start + safeWindow - 1`). `syncVirtualWindow` always passes `≥ 1`; smaller or negative windows can yield negative `spanEnd` (documented for direct callers).
 * @returns Inclusive last visible row index, or a safe fallback when `spanEnd` or `maxIndex` is non-finite (see implementation).
 */
export function inclusiveEndIndex(start: number, maxIndex: number, safeWindow: number): number {
  const spanEnd =
    typeof start === 'number' && typeof safeWindow === 'number' ? start + safeWindow - 1 : Number.NaN
  const maxIdx = typeof maxIndex === 'number' ? maxIndex : Number.NaN
  if (!Number.isFinite(spanEnd)) {
    // Match the finite-span branch: clamp corrupt negative caps so callers never get a negative end when
    // span math overflowed (syncVirtualWindow always supplies non-negative maxIndex; direct callers may not).
    if (!Number.isFinite(maxIdx)) return 0
    return Math.max(0, maxIdx)
  }
  if (!Number.isFinite(maxIdx)) {
    return spanEnd
  }
  // maxIndex is always non-negative from syncVirtualWindow; clamp so direct callers with corrupt
  // negative caps cannot produce a negative end when spanEnd is still positive.
  return Math.min(Math.max(0, maxIdx), spanEnd)
}

/**
 * Keep the selected row index visible inside a fixed-size virtual window.
 *
 * @param totalRows — Non-negative row count; negative values are treated as zero. Non-integer finite values are
 * floored so row counts stay whole indices (same rule as `windowSize`).
 * @param windowSize — Visible row count; values below 1 are clamped to 1. Non-integer finite values are floored
 * so `start` / `end` stay whole row indices (same as counting visible list rows).
 * @param selected — Desired selection index; floored to a whole row, then clamped into `[0, totalRows - 1]`.
 * @param currentStart — Current window start index; floored to a whole row, then clamped into valid range before
 * adjusting for selection.
 * Non-finite arguments use the same defaults as empty/reset UI state (`0` rows, window `1`, selection/start `0`).
 *
 * @returns Indices with `start <= end`, selection clamped to `[0, totalRows - 1]` (or `0` when empty), and
 *   `selected` always inside `[start, end]` whenever `totalRows > 0`.
 */
export function syncVirtualWindow(
  totalRows: number,
  windowSize: number,
  selected: number,
  currentStart: number,
): VirtualWindowState {
  const safeTotal = intRowMetric(totalRows, 0)
  const safeWindow = Math.max(1, Math.floor(finiteOr(windowSize, 1)))
  const maxIndex = Math.max(0, safeTotal - 1)
  const nextSelected = Math.max(0, Math.min(maxIndex, intRowMetric(selected, 0)))
  const maxStart = nonNegativeOrZero(safeTotal - safeWindow)

  let start = nonNegativeOrZero(Math.min(maxStart, intRowMetric(currentStart, 0)))
  const end = inclusiveEndIndex(start, maxIndex, safeWindow)

  if (nextSelected < start) {
    start = nextSelected
  } else if (nextSelected > end) {
    start = nonNegativeOrZero(nextSelected - safeWindow + 1)
  }

  const clampedStart = nonNegativeOrZero(Math.min(maxStart, start))
  return {
    start: clampedStart,
    end: inclusiveEndIndex(clampedStart, maxIndex, safeWindow),
    selected: nextSelected,
  }
}

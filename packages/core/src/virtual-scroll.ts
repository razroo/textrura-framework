/** Indices describing the visible slice of a virtual list after {@link syncVirtualWindow}. */
export interface VirtualWindowState {
  /** First visible row index (inclusive), in `[0, totalRows - 1]` when `totalRows > 0`. */
  start: number
  /** Last visible row index (inclusive); equals `start` when at most one row is visible. */
  end: number
  /** Selection index after clamping to valid row range. */
  selected: number
}

/** Only plain finite `number` values count (`typeof` + `Number.isFinite`, same idea as `layoutBoundsAreFinite` in `layout-bounds.js`). */
function finiteOr(n: number, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

/** Non-negative integer row index / count: finite numbers only, then floored (aligned with `windowSize` flooring). */
function intRowMetric(n: number, fallback: number): number {
  return Math.max(0, Math.floor(finiteOr(n, fallback)))
}

/** Like `Math.max(0, n)` but maps non-finite `n` to `0` so corrupt floats cannot poison window indices. */
function nonNegativeOrZero(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

/**
 * Inclusive last row index for a window starting at `start`. When `start + safeWindow - 1` overflows or is
 * otherwise non-finite, returns `maxIndex` (same defensive rule as {@link import('./layout-bounds.js').pointInInclusiveLayoutRect}).
 *
 * Exported for parity tests and advanced virtual-list math; {@link syncVirtualWindow} is the primary API.
 */
export function inclusiveEndIndex(start: number, maxIndex: number, safeWindow: number): number {
  const spanEnd = start + safeWindow - 1
  return Number.isFinite(spanEnd) ? Math.min(maxIndex, spanEnd) : maxIndex
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

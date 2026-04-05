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
  const maxStart = Math.max(0, safeTotal - safeWindow)

  let start = Math.max(0, Math.min(maxStart, intRowMetric(currentStart, 0)))
  const end = Math.min(maxIndex, start + safeWindow - 1)

  if (nextSelected < start) {
    start = nextSelected
  } else if (nextSelected > end) {
    start = Math.max(0, nextSelected - safeWindow + 1)
  }

  const clampedStart = Math.max(0, Math.min(maxStart, start))
  return {
    start: clampedStart,
    end: Math.min(maxIndex, clampedStart + safeWindow - 1),
    selected: nextSelected,
  }
}

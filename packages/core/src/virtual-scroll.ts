export interface VirtualWindowState {
  start: number
  end: number
  selected: number
}

/**
 * Keep the selected row index visible inside a fixed-size virtual window.
 *
 * @param totalRows — Non-negative row count; negative values are treated as zero.
 * @param windowSize — Visible row count; values below 1 are clamped to 1.
 * @param selected — Desired selection index; clamped into `[0, totalRows - 1]`.
 * @param currentStart — Current window start index; clamped into valid range before adjusting for selection.
 */
export function syncVirtualWindow(
  totalRows: number,
  windowSize: number,
  selected: number,
  currentStart: number,
): VirtualWindowState {
  const safeTotal = Math.max(0, totalRows)
  const safeWindow = Math.max(1, windowSize)
  const maxIndex = Math.max(0, safeTotal - 1)
  const nextSelected = Math.max(0, Math.min(maxIndex, selected))
  const maxStart = Math.max(0, safeTotal - safeWindow)

  let start = Math.max(0, Math.min(maxStart, currentStart))
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

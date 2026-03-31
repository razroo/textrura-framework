export interface VirtualWindowState {
  start: number
  end: number
  selected: number
}

/**
 * Keep selected row visible within a fixed-size virtual window.
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

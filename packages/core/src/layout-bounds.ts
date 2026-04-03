import type { ComputedLayout } from 'textura'

/**
 * Reject NaN, ±Infinity, and negative sizes so corrupt layout cannot invert rects or poison
 * coordinate math. Shared by hit-testing, focus order, and focus traps.
 */
export function layoutBoundsAreFinite(layout: ComputedLayout): boolean {
  return (
    Number.isFinite(layout.x) &&
    Number.isFinite(layout.y) &&
    Number.isFinite(layout.width) &&
    Number.isFinite(layout.height) &&
    layout.width >= 0 &&
    layout.height >= 0
  )
}

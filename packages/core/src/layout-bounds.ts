import type { ComputedLayout } from 'textura'

/** `Number.isFinite` throws on BigInt; gate with `typeof` so corrupt layout never crashes callers. */
function isFiniteLayoutNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Reject NaN, ±Infinity, and negative sizes so corrupt layout cannot invert rects or poison
 * coordinate math. Shared by hit-testing, focus order, and focus traps.
 *
 * Degenerate rects (`width` / `height` of `0`) are accepted; they still yield a well-defined
 * inclusive hit-test edge at the origin corner.
 *
 * Non-number fields (including BigInt) are rejected without throwing — `Number.isFinite` would
 * throw on BigInt, which would otherwise take down pointer dispatch.
 *
 * @param layout — Bounds from Textura/Yoga {@link ComputedLayout} output.
 * @returns `true` when `x`, `y`, `width`, and `height` are finite and both dimensions are `>= 0`.
 *
 * Only this node's own fields are inspected; {@link ComputedLayout.children} entries are not
 * validated recursively. Callers walking a tree should check each visited layout when needed.
 */
export function layoutBoundsAreFinite(layout: ComputedLayout): boolean {
  const { x, y, width, height } = layout
  return (
    isFiniteLayoutNumber(x) &&
    isFiniteLayoutNumber(y) &&
    isFiniteLayoutNumber(width) &&
    isFiniteLayoutNumber(height) &&
    width >= 0 &&
    height >= 0
  )
}

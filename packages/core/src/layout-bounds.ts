import type { ComputedLayout } from 'textura'

/** True only for finite primitive numbers: `typeof` rejects `BigInt`, boxed numbers, and objects before `Number.isFinite`. */
function isFiniteLayoutNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Coerce a runtime value to a finite number for scroll offsets, root paint offsets, and similar layout math.
 * Non-numbers, NaN, and ±Infinity become `0`. `typeof` rejects `BigInt` before any numeric coercion that could throw.
 *
 * Shared by hit-testing, text selection walks, accessibility bounds, text-input caret math, and animation timelines
 * so corrupt serialized values cannot poison coordinates or timing.
 */
export function finiteNumberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Reject NaN, ±Infinity, and negative sizes so corrupt layout cannot invert rects or poison
 * coordinate math. Shared by hit-testing, focus order, and focus traps.
 *
 * Degenerate rects (`width` / `height` of `0`) are accepted; they still yield a well-defined
 * inclusive hit-test edge at the origin corner.
 *
 * Non-number fields (including `BigInt` and boxed `Number`) are rejected without coercion — global
 * `isFinite` would coerce operands and throws on `BigInt`, which would otherwise take down pointer dispatch.
 *
 * @param layout — Bounds from Textura/Yoga {@link ComputedLayout} output.
 * @returns `true` when `x`, `y`, `width`, and `height` are finite and both dimensions are `>= 0`.
 *
 * `x` / `y` / `width` / `height` are read with normal property access (destructuring), so inherited
 * **enumerable** values on the prototype chain are observed the same as own fields — typical
 * {@link ComputedLayout} snapshots from Textura use plain objects with own fields only.
 * {@link ComputedLayout.children} is not validated recursively. Callers walking a tree should check
 * each visited layout when needed.
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

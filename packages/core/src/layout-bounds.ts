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
 *
 * @param value — Any runtime value (including corrupt deserialized props).
 * @returns A primitive finite `number`, or `0` when the input is not a finite number. Primitive IEEE **−0** is preserved.
 */
export function finiteNumberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Optional Textura root width/height from host options: only finite, non-negative numbers become
 * constraints; otherwise the key is omitted (unconstrained layout).
 *
 * IEEE **−0** is normalized to **+0** so serializers cannot thread signed zero into Yoga constraints.
 * Non-numbers, NaN, and ±Infinity yield `undefined` (same rule as `typeof` + `Number.isFinite`, so boxed
 * numbers and bigint never coerce).
 *
 * @param value — Typically `AppOptions.width` / `height`; accepts `unknown` so corrupt runtime options
 *   cannot slip through widened casts.
 */
export function finiteRootExtent(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const v = Object.is(value, -0) ? 0 : value
  return v >= 0 ? v : undefined
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
 * @returns `true` when `x`, `y`, `width`, and `height` are finite, both dimensions are `>= 0`, and
 *   `children` is a real array (empty is fine). Missing or non-array `children` is rejected so parallel
 *   tree walks (hit-test, focus, a11y) never throw on `layout.children[i]` from bad snapshots or transport bugs.
 *
 * `x` / `y` / `width` / `height` are read with normal property access (destructuring uses `[[Get]]`), so
 * inherited values on the prototype chain are observed the same as own fields — including
 * non-enumerable prototype descriptors (enumerability affects `for...in`, not ordinary reads). Typical
 * {@link ComputedLayout} snapshots from Textura use plain objects with own fields only.
 * {@link ComputedLayout.children} is not validated recursively. Callers walking a tree should check
 * each visited layout when needed.
 */
export function layoutBoundsAreFinite(layout: ComputedLayout): boolean {
  const { x, y, width, height, children } = layout
  if (!Array.isArray(children)) return false
  return (
    isFiniteLayoutNumber(x) &&
    isFiniteLayoutNumber(y) &&
    isFiniteLayoutNumber(width) &&
    isFiniteLayoutNumber(height) &&
    width >= 0 &&
    height >= 0
  )
}

/**
 * Inclusive axis-aligned rect test for pointer-style coordinates: `x` in `[absX, absX + width]`,
 * `y` in `[absY, absY + height]`, with `width` / `height` ≥ 0 (degenerate zero-size rects hit only the origin corner).
 *
 * Returns `false` when the summed right or bottom edge overflows to non-finite values — with IEEE doubles,
 * two large finite operands can still produce `±Infinity`, and naive `x <= absX + width` would then accept
 * every finite `x`. Shared by hit-testing and overflow clipping so behavior stays consistent.
 *
 * @param x — Pointer X (must be a finite primitive `number`; non-numbers yield `false` via `Number.isFinite`).
 * @param y — Pointer Y (same rules as `x`).
 * @param absX — Rectangle minimum X in the same coordinate space as `x`.
 * @param absY — Rectangle minimum Y in the same coordinate space as `y`.
 * @param width — Non-negative width; negative values yield `false`.
 * @param height — Non-negative height; negative values yield `false`.
 * @returns `true` when the point lies inside the inclusive rect and all arguments are finite with non-negative size.
 */
export function pointInInclusiveLayoutRect(
  x: number,
  y: number,
  absX: number,
  absY: number,
  width: number,
  height: number,
): boolean {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(absX) ||
    !Number.isFinite(absY) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 0 ||
    height < 0
  ) {
    return false
  }
  if (x < absX || y < absY) return false
  const right = absX + width
  const bottom = absY + height
  if (!Number.isFinite(right) || !Number.isFinite(bottom)) return false
  return x <= right && y <= bottom
}

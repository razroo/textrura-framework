/**
 * Shared layout coordinate helpers for hit-testing, text selection, focus routing, a11y bounds, text-input
 * caret math, root extent options, and animation timelines. All entry points assume plain deserialized
 * geometry; `typeof` / `Number.isFinite` guards avoid `BigInt` mixing and accidental coercion from boxed
 * or string values.
 */
import type { ComputedLayout } from 'textura'

/**
 * True only for finite **primitive** numbers: `typeof` rejects `BigInt`, boxed numbers, and objects before
 * `Number.isFinite`. The same guard is imported by `@geometra/server` (`packages/server/src/protocol.ts`)
 * for GEOM layout patches — non-negative dimension checks, per-field `x`/`y`/`width`/`height` updates, and
 * `coalescePatches` merge rules — so corrupt wire scalars fail closed consistently with layout bounds and
 * hit-testing.
 *
 * @param value — Any runtime value (deserialized layout fields, scroll offsets, protocol scalars).
 * @returns `true` when `value` is a primitive finite IEEE-754 number (including **−0**); `false` for `NaN`,
 *   `±Infinity`, non-numbers, boxed numbers, `bigint`, and objects.
 */
export function isFinitePlainNumber(value: unknown): value is number {
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
 * Scroll-adjusted origin for child layout coordinates (`abs - scroll`), shared by hit-testing and
 * {@link collectTextNodes} so text selection stays in the same coordinate space as pointer dispatch.
 * When the difference overflows to a non-finite value, returns `null` so descendants are not walked with
 * offsets that would become `0` inside downstream math using {@link finiteNumberOrZero} (which would
 * misplace children).
 *
 * @param absX — Absolute X of the current node in parent space; must be a **primitive** finite `number`.
 *   `typeof` rejects `BigInt` before subtraction (mixing `bigint` with `number` throws in JS) and rejects
 *   boxed numbers / strings so corrupt host input cannot coerce via `-`.
 * @param absY — Same rules as `absX`, for the Y axis.
 * @param scrollX — Horizontal scroll offset; coerced with {@link finiteNumberOrZero} (same rule as element `scrollX` props).
 * @param scrollY — Vertical scroll offset; coerced with {@link finiteNumberOrZero}.
 * @returns `{ ox, oy }` when both differences are finite (may be **negative** when scroll exceeds `abs`),
 *   or `null` when `absX`/`absY` are not primitive finite numbers or when either axis overflows to non-finite.
 */
export function scrollSafeChildOffsets(
  absX: number,
  absY: number,
  scrollX: unknown,
  scrollY: unknown,
): { ox: number; oy: number } | null {
  if (typeof absX !== 'number' || !Number.isFinite(absX) || typeof absY !== 'number' || !Number.isFinite(absY)) {
    return null
  }
  const ox = absX - finiteNumberOrZero(scrollX)
  const oy = absY - finiteNumberOrZero(scrollY)
  if (!Number.isFinite(ox) || !Number.isFinite(oy)) return null
  return { ox, oy }
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
 *   cannot slip through widened casts. JSON `null` is non-number and yields `undefined` (unconstrained), same as omission.
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
 * `children` is validated with `Array.isArray` before `x` / `y` / `width` / `height` are read, so corrupt
 * snapshots without a real `children` array do not pay four numeric `[[Get]]`s (and avoid invoking
 * accessors for bounds keys when the subtree cannot be walked). Numeric fields use normal property access
 * (`[[Get]]`), so inherited values on the prototype chain match own fields — including non-enumerable
 * prototype descriptors (enumerability affects `for...in`, not ordinary reads). Typical
 * {@link ComputedLayout} snapshots from Textura use plain objects with own fields only.
 * {@link ComputedLayout.children} is not validated recursively. Callers walking a tree should check
 * each visited layout when needed.
 */
export function layoutBoundsAreFinite(layout: ComputedLayout): boolean {
  // Children first: corrupt snapshots often omit or mistype `children`; avoid reading x/y/width/height
  // (and any throwing accessors on those keys) until we know parallel tree walks are safe.
  if (!Array.isArray(layout.children)) return false
  const { x, y, width, height } = layout
  return (
    isFinitePlainNumber(x) &&
    isFinitePlainNumber(y) &&
    isFinitePlainNumber(width) &&
    isFinitePlainNumber(height) &&
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
 * @param x — Pointer X; must pass the same primitive finite-number guard as {@link layoutBoundsAreFinite}
 *   (`typeof` + `Number.isFinite`; boxed numbers and non-numbers yield `false`).
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
    !isFinitePlainNumber(x) ||
    !isFinitePlainNumber(y) ||
    !isFinitePlainNumber(absX) ||
    !isFinitePlainNumber(absY) ||
    !isFinitePlainNumber(width) ||
    !isFinitePlainNumber(height) ||
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

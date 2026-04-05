/**
 * Responsive layout helpers: viewport signals, named breakpoints, and
 * breakpoint-to-value mapping.
 *
 * Works with both local apps (listen to `window.resize`) and server-driven
 * apps (server updates viewport signals when clients send resize messages).
 */

import { finiteNumberOrZero } from './layout-bounds.js'
import { signal, computed } from './signals.js'
import type { Signal, Computed } from './signals.js'

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

export interface Viewport {
  /** Reactive viewport width. */
  readonly width: Signal<number>
  /** Reactive viewport height. */
  readonly height: Signal<number>
  /** Update both dimensions at once. */
  resize(width: number, height: number): void
}

/**
 * Create a reactive viewport with initial dimensions.
 *
 * In a browser you can wire it to `window` resize events; in a server-driven
 * app the server updates it when a client sends a `resize` message.
 *
 * Width and height are coerced with {@link finiteNumberOrZero} on creation and on
 * {@link Viewport.resize} so corrupt or non-finite values from deserialized resize
 * payloads cannot poison layout breakpoints.
 */
export function createViewport(initialWidth: number, initialHeight: number): Viewport {
  const w = signal(finiteNumberOrZero(initialWidth))
  const h = signal(finiteNumberOrZero(initialHeight))
  return {
    width: w,
    height: h,
    resize(width: number, height: number): void {
      w.set(finiteNumberOrZero(width))
      h.set(finiteNumberOrZero(height))
    },
  }
}

// ---------------------------------------------------------------------------
// Breakpoints
// ---------------------------------------------------------------------------

/**
 * Breakpoint map: keys are breakpoint names, values are the **minimum width**
 * at which that breakpoint activates (inclusive).  Must be sorted ascending
 * by value.
 *
 * Example: `{ sm: 0, md: 640, lg: 1024 }`
 */
export type BreakpointMap = Record<string, number>

/** Min-width used only for ordering; non-finite thresholds sort last so real breakpoints are tried first. */
function breakpointSortKey(minWidth: number): number {
  return typeof minWidth === 'number' && Number.isFinite(minWidth) ? minWidth : Number.POSITIVE_INFINITY
}

/**
 * Return the active breakpoint name for a given width signal and breakpoint map.
 *
 * The breakpoints are evaluated largest-first; the first whose minimum width
 * is `<=` the current width wins. If no breakpoint matches (shouldn't happen
 * if one starts at 0), returns the smallest breakpoint name.
 *
 * Entries whose minimum width is not a finite number are ignored for matching
 * (`w >= NaN` is always false) but still participate in fallback ordering via a
 * stable sort key so `Object.entries` order alone cannot flip results.
 */
export function breakpoint<B extends BreakpointMap>(
  width: Signal<number> | Computed<number>,
  breakpoints: B,
): Computed<keyof B & string> {
  // Pre-sort descending by min-width for fast lookup (non-finite → +∞ key so they sort after real thresholds).
  const sorted = Object.entries(breakpoints).sort(
    (a, b) => breakpointSortKey(b[1]) - breakpointSortKey(a[1]),
  )
  const fallback = sorted[sorted.length - 1]![0] as keyof B & string

  return computed(() => {
    const w = width.value
    for (const [name, minWidth] of sorted) {
      if (typeof minWidth !== 'number' || !Number.isFinite(minWidth)) continue
      if (w >= minWidth) return name as keyof B & string
    }
    return fallback
  })
}

/**
 * Map breakpoint names to values, returning a reactive computed that resolves
 * to the value for the current breakpoint.
 *
 * ```ts
 * const cols = responsive(viewport.width, { sm: 1, md: 2, lg: 3 }, { sm: 0, md: 640, lg: 1024 })
 * cols.value // 2 when viewport is 800px
 * ```
 */
export function responsive<B extends BreakpointMap, V>(
  width: Signal<number> | Computed<number>,
  values: Record<keyof B & string, V>,
  breakpoints: B,
): Computed<V> {
  const bp = breakpoint(width, breakpoints)
  return computed(() => values[bp.value])
}

// ---------------------------------------------------------------------------
// Common presets
// ---------------------------------------------------------------------------

/** Tailwind-style default breakpoints. */
export const defaultBreakpoints = {
  sm: 0,
  md: 640,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const satisfies BreakpointMap

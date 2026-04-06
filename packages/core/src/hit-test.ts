import type { ComputedLayout } from 'textura'
import type { UIElement, BoxElement, EventHandlers, HitEvent } from './types.js'
import { hasFocusCandidateHandlers } from './focus-candidates.js'
import {
  finiteNumberOrZero,
  layoutBoundsAreFinite,
  pointInInclusiveLayoutRect,
  scrollSafeChildOffsets,
} from './layout-bounds.js'

interface HitTarget {
  layout: ComputedLayout
  handlers: EventHandlers
  element: BoxElement
  absX: number
  absY: number
}

interface ZIndexCacheEntry {
  zValues: number[]
  /** Child indices in paint order: ascending z-index (matches canvas + terminal renderers). */
  asc: number[]
}

const zIndexOrderCache = new WeakMap<BoxElement, ZIndexCacheEntry>()

function zIndexOf(el: UIElement): number {
  return finiteNumberOrZero(el.props.zIndex)
}

function getChildrenByZAsc(boxEl: BoxElement): number[] {
  const kids = boxEl.children
  if (!Array.isArray(kids)) return []
  const n = kids.length
  if (n === 0) return []
  if (n === 1) return [0]

  // Two children: compare z-index without map/sort allocations (common flex rows, label+control pairs).
  if (n === 2) {
    const z0 = zIndexOf(kids[0]!)
    const z1 = zIndexOf(kids[1]!)
    const asc = z0 <= z1 ? [0, 1] : [1, 0]
    const cached = zIndexOrderCache.get(boxEl)
    if (
      cached &&
      cached.zValues.length === 2 &&
      cached.zValues[0] === z0 &&
      cached.zValues[1] === z1
    ) {
      return cached.asc
    }
    const zValues = [z0, z1]
    zIndexOrderCache.set(boxEl, { zValues, asc })
    return asc
  }

  // Three+ children sharing one z-index: stable paint order matches source order; avoid map/sort allocations.
  if (n >= 3) {
    const z0 = zIndexOf(kids[0]!)
    let allEqual = true
    for (let i = 1; i < n; i++) {
      if (zIndexOf(kids[i]!) !== z0) {
        allEqual = false
        break
      }
    }
    if (allEqual) {
      const cached = zIndexOrderCache.get(boxEl)
      if (cached && cached.zValues.length === n) {
        let match = true
        for (let j = 0; j < n; j++) {
          if (cached.zValues[j] !== z0) {
            match = false
            break
          }
        }
        if (match) return cached.asc
      }
      const zValues = new Array<number>(n)
      const asc = new Array<number>(n)
      for (let i = 0; i < n; i++) {
        zValues[i] = z0
        asc[i] = i
      }
      zIndexOrderCache.set(boxEl, { zValues, asc })
      return asc
    }
  }

  const cached = zIndexOrderCache.get(boxEl)
  if (cached && cached.zValues.length === kids.length) {
    let unchanged = true
    for (let i = 0; i < kids.length; i++) {
      if (cached.zValues[i] !== zIndexOf(kids[i]!)) {
        unchanged = false
        break
      }
    }
    if (unchanged) return cached.asc
  }

  const zValues = kids.map(child => zIndexOf(child))
  const asc = kids
    .map((_, i) => i)
    .sort((a, b) => zValues[a]! - zValues[b]!)
  zIndexOrderCache.set(boxEl, { zValues, asc })
  return asc
}

/**
 * Result of routing a hit to {@link EventHandlers} on the deepest matching target.
 * `focusTarget` is only populated for `onClick` (see {@link dispatchHit}).
 */
export interface HitDispatchResult {
  /**
   * True when a handler ran for the requested `eventType` on the deepest matching box (pointer, wheel,
   * `onClick`, or synthetic keyboard/composition routing in tests).
   *
   * False when the point missed, layout was invalid, `pointerEvents: 'none'` blocked the target, or no
   * handler was registered — except for `onClick`, where `focusTarget` may still be set for click-to-focus
   * on a focusable box without an `onClick` handler.
   */
  handled: boolean
  /**
   * Present only when `dispatchHit` was called with `'onClick'`: the deepest focusable box under the point
   * (`onClick`, `onKeyDown` / `onKeyUp`, or composition handlers). Set after a successful
   * `onClick` handler **or** via click-to-focus when the box has no `onClick` but should
   * still receive keyboard/composition input (`handled` may be `false`). Omitted for all
   * other event types.
   */
  focusTarget?: { element: BoxElement; layout: ComputedLayout }
}

/** Walk the element tree + computed layout in parallel to find hit targets at (x, y). */
function collectHits(
  element: UIElement,
  layout: ComputedLayout,
  x: number,
  y: number,
  offsetX: number,
  offsetY: number,
  results: HitTarget[],
): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  if (!layoutBoundsAreFinite(layout)) return

  const absX = offsetX + layout.x
  const absY = offsetY + layout.y

  if (!pointInInclusiveLayoutRect(x, y, absX, absY, layout.width, layout.height)) return

  if (element.kind !== 'box') return

  const boxEl = element
  const childOrigin = scrollSafeChildOffsets(absX, absY, boxEl.props.scrollX, boxEl.props.scrollY)

  const passThrough = boxEl.props.pointerEvents === 'none'
  if (boxEl.handlers && !passThrough) {
    results.push({ layout, handlers: boxEl.handlers, element: boxEl, absX, absY })
  }

  if (childOrigin) {
    for (const i of getChildrenByZAsc(boxEl)) {
      const childLayout = layout.children[i]
      if (childLayout) {
        collectHits(boxEl.children[i]!, childLayout, x, y, childOrigin.ox, childOrigin.oy, results)
      }
    }
  }
}

function dispatchHitRecursive(
  element: UIElement,
  layout: ComputedLayout,
  eventType: keyof EventHandlers,
  x: number,
  y: number,
  offsetX: number,
  offsetY: number,
  extra: Record<string, unknown> | undefined,
): HitDispatchResult {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { handled: false }
  if (!layoutBoundsAreFinite(layout)) return { handled: false }
  if (element.kind !== 'box') return { handled: false }

  const boxEl = element
  const absX = offsetX + layout.x
  const absY = offsetY + layout.y

  const { scrollX, scrollY } = boxEl.props
  if (!pointInInclusiveLayoutRect(x, y, absX, absY, layout.width, layout.height)) {
    return { handled: false }
  }

  let focusTarget: HitDispatchResult['focusTarget']
  const childOrigin = scrollSafeChildOffsets(absX, absY, scrollX, scrollY)
  const asc = getChildrenByZAsc(boxEl)

  if (childOrigin) {
    for (let k = asc.length - 1; k >= 0; k--) {
      const i = asc[k]!
      const childLayout = layout.children[i]
      if (!childLayout) continue
      const childResult = dispatchHitRecursive(
        boxEl.children[i]!,
        childLayout,
        eventType,
        x,
        y,
        childOrigin.ox,
        childOrigin.oy,
        extra,
      )
      if (childResult.handled) return childResult
      if (eventType === 'onClick' && !focusTarget && childResult.focusTarget) {
        focusTarget = childResult.focusTarget
      }
    }
  }

  if (boxEl.props.pointerEvents === 'none') {
    return focusTarget ? { handled: false, focusTarget } : { handled: false }
  }

  const handlers = boxEl.handlers
  const handler = handlers?.[eventType]
  if (handler) {
    const event: HitEvent = {
      ...(extra ?? {}),
      x,
      y,
      localX: x - absX,
      localY: y - absY,
      target: layout,
    }
    ;(handler as (e: HitEvent) => void)(event)
    return {
      handled: true,
      focusTarget:
        eventType === 'onClick' && hasFocusCandidateHandlers(handlers)
          ? { element: boxEl, layout }
          : undefined,
    }
  }

  if (eventType === 'onClick' && !focusTarget && hasFocusCandidateHandlers(handlers)) {
    focusTarget = { element: boxEl, layout }
  }

  return focusTarget ? { handled: false, focusTarget } : { handled: false }
}

/**
 * Dispatch a **pointer-space** hit at `(x, y)` against the element tree for the given handler key.
 * Intended slots: `onClick`, `onPointerDown` / `Up` / `Move`, and `onWheel` (same coordinate rules as
 * {@link hitPathAtPoint}). The deepest hit with a matching handler runs first; only one handler runs per call.
 *
 * {@link import('./types.js').EventHandlers} also lists keyboard and composition keys. For **real** apps,
 * those should go to the **focused** element via {@link import('./keyboard.js').dispatchKeyboardEvent} and
 * {@link import('./keyboard.js').dispatchCompositionEvent} (or {@link import('./app.js').App.dispatchKey} /
 * {@link import('./app.js').App.dispatchComposition} from `createApp`) — not pointer-based routing.
 * For **synthetic** hosts, tests, or tooling, `eventType` may still be any `keyof EventHandlers`: the deepest
 * box under `(x, y)` with that slot set runs once, and `extra` is merged into the same event object as pointer
 * dispatch (`x`, `y`, `localX`, `localY`, `target` always win after `extra`). `focusTarget` is only populated
 * for `onClick` (keyboard/composition keys never set it).
 *
 * Optional `extra` is shallow-merged first; `x`, `y`, `localX`, `localY`, and `target` are then
 * set from the hit so corrupt or mistaken keys in `extra` cannot override pointer geometry or layout.
 * Use `extra` for modifier keys, `button`, wheel deltas, and other renderer-specific metadata.
 * For `onClick` only, the return value may include `focusTarget` for focus routing
 * (including click-to-focus when there is no `onClick` handler).
 * Non-box roots (`text`, `image`, `scene3d`) always return `{ handled: false }` — attach pointer handlers to a parent {@link import('./types.js').BoxElement}.
 * Pointer `x` / `y` must be finite numbers: anything that fails `Number.isFinite` (including
 * non-numbers at runtime) returns `{ handled: false }` without invoking handlers.
 * Layout bounds must be finite and non-negative on `width` and `height`; otherwise the node is
 * skipped for hit-testing (corrupt geometry from Yoga or a bad snapshot).
 *
 * Optional `offsetX` / `offsetY` shift the root layout origin in the same coordinate space as `(x, y)` —
 * use the same values as {@link hitPathAtPoint} and {@link getCursorAtPoint} when the tree is painted
 * inside a translated or clipped surface (e.g. nested canvas, CSS transform). Defaults are `0`.
 * Non-finite or non-number offsets are treated as `0` (same rule as scroll offsets on boxes).
 * Event `x` / `y` remain the caller coordinates; `localX` / `localY` are relative to the hit target’s abs rect.
 *
 * @param element - Root of the UI tree (typically a `box`).
 * @param layout - Computed layout node parallel to `element` (same shape as Yoga/Textura output).
 * @param eventType - Which handler slot to dispatch (`onClick`, pointer/wheel keys, or — for synthetic routing —
 *   keyboard/composition keys from {@link import('./types.js').EventHandlers}).
 * @param x - Pointer X in the same space as `layout` (after root offsets).
 * @param y - Pointer Y in the same space as `layout` (after root offsets).
 * @param extra - Optional fields shallow-merged onto the {@link HitEvent} after `x`, `y`, `localX`, `localY`, and `target`.
 * @param offsetX - Added to the root layout origin; non-finite values become `0`.
 * @param offsetY - Added to the root layout origin; non-finite values become `0`.
 * @returns Whether a handler ran, and optional `focusTarget` for `onClick` only.
 * @see {@link getCursorAtPoint} for resolving `cursor` at the same logical hit region.
 */
export function dispatchHit(
  element: UIElement,
  layout: ComputedLayout,
  eventType: keyof EventHandlers,
  x: number,
  y: number,
  extra?: Record<string, unknown>,
  offsetX = 0,
  offsetY = 0,
): HitDispatchResult {
  return dispatchHitRecursive(
    element,
    layout,
    eventType,
    x,
    y,
    finiteNumberOrZero(offsetX),
    finiteNumberOrZero(offsetY),
    extra,
  )
}

/**
 * True when the point is over an element that participates in pointer hit-testing
 * (`onClick`, `onPointerDown` / `Up` / `Move`, `onWheel`). Keyboard and composition
 * handlers alone do not count — use this for hover / pointer-capture style checks.
 *
 * Non-finite or non-number `x` / `y` return `false` (same `Number.isFinite` guard as {@link dispatchHit}).
 *
 * Optional `offsetX` / `offsetY` match {@link hitPathAtPoint} / {@link dispatchHit} for rooted coordinate transforms.
 * Non-finite or non-number offsets are treated as `0`.
 *
 * @param element - Root of the UI tree.
 * @param layout - Computed layout parallel to `element`.
 * @param x - Pointer X (must be a finite number at runtime).
 * @param y - Pointer Y (must be a finite number at runtime).
 * @param offsetX - Root origin shift; non-finite values become `0`.
 * @param offsetY - Root origin shift; non-finite values become `0`.
 * @returns `true` when the deepest qualifying hit stack entry has a pointer or wheel handler.
 */
export function hasInteractiveHitAtPoint(
  element: UIElement,
  layout: ComputedLayout,
  x: number,
  y: number,
  offsetX = 0,
  offsetY = 0,
): boolean {
  const hits: HitTarget[] = []
  collectHits(element, layout, x, y, finiteNumberOrZero(offsetX), finiteNumberOrZero(offsetY), hits)
  for (let i = hits.length - 1; i >= 0; i--) {
    const handlers = hits[i]!.handlers
    if (
      handlers.onClick ||
      handlers.onPointerDown ||
      handlers.onPointerUp ||
      handlers.onPointerMove ||
      handlers.onWheel
    ) {
      return true
    }
  }
  return false
}

/**
 * Root-anchored containment for {@link hitPathAtPoint} and {@link getCursorAtPoint}: finite pointer coords,
 * finite layout bounds, then the same inclusive rect test as {@link collectHits} (parent layout rect per
 * level; child coordinates subtract this box’s `scrollX`/`scrollY` in the recursive walk).
 * Returns the node’s absolute origin `(absX, absY)` when the point hits the layout rect.
 */
function rootedLayoutPointContainment(
  layout: ComputedLayout,
  x: number,
  y: number,
  offsetX: unknown,
  offsetY: unknown,
): { absX: number; absY: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (!layoutBoundsAreFinite(layout)) return null

  const ox = finiteNumberOrZero(offsetX)
  const oy = finiteNumberOrZero(offsetY)
  const absX = ox + layout.x
  const absY = oy + layout.y

  if (!pointInInclusiveLayoutRect(x, y, absX, absY, layout.width, layout.height)) return null
  return { absX, absY }
}

/**
 * Child indices from root to the deepest box under (x, y). Among overlapping siblings, prefers higher z-index (topmost);
 * non-finite or non-number `zIndex` values match `dispatchHit` / paint order (treated as `0`).
 * Boxes with `pointerEvents: 'none'` are skipped for path segments; if the deepest matching geometry is only such a box
 * (no deeper box under the point), returns `null` (same as missing the interactive stack).
 * Non-finite or non-number `x` / `y` return `null` (same `Number.isFinite` guard as {@link dispatchHit}).
 * Returns `null` when the point misses the tree, when the root is not a `box` (text/image/scene3d roots have no index path),
 * or in the `pointerEvents: 'none'` deepest-only case above. Returns `[]` when the point hits a box root or leaf box with
 * no deeper box under the point.
 * Root `offsetX` / `offsetY` follow {@link dispatchHit}: non-finite or non-number values are treated as `0`.
 *
 * @param element - Root of the UI tree.
 * @param layout - Computed layout parallel to `element`.
 * @param x - Pointer X (must be a finite number at runtime).
 * @param y - Pointer Y (must be a finite number at runtime).
 * @param offsetX - Root origin shift for child recursion; non-finite values become `0`.
 * @param offsetY - Root origin shift for child recursion; non-finite values become `0`.
 * @returns Index path, empty array for a hit leaf box, or `null` when there is no path.
 */
export function hitPathAtPoint(
  element: UIElement,
  layout: ComputedLayout,
  x: number,
  y: number,
  offsetX = 0,
  offsetY = 0,
): number[] | null {
  const hit = rootedLayoutPointContainment(layout, x, y, offsetX, offsetY)
  if (!hit) return null
  const { absX, absY } = hit

  if (element.kind !== 'box') return null

  const boxEl = element
  const childOrigin = scrollSafeChildOffsets(absX, absY, boxEl.props.scrollX, boxEl.props.scrollY)

  const asc = getChildrenByZAsc(boxEl)
  if (childOrigin) {
    for (let k = asc.length - 1; k >= 0; k--) {
      const i = asc[k]!
      const childLayout = layout.children[i]
      if (!childLayout) continue
      const sub = hitPathAtPoint(boxEl.children[i]!, childLayout, x, y, childOrigin.ox, childOrigin.oy)
      if (sub !== null) return [i, ...sub]
    }
  }
  if (boxEl.props.pointerEvents === 'none') return null
  return []
}

/**
 * Resolve the deepest `cursor` style at `(x, y)`.
 *
 * Walk follows the same parent-bounds and scroll-offset rules as {@link dispatchHit}. {@link hitPathAtPoint} only
 * returns box index paths, but cursor resolution also considers `text`, `image`, and `scene3d` nodes: when the point is inside
 * such a leaf’s layout and it is not `pointerEvents: 'none'`, its {@link import('./types.js').StyleProps.cursor}
 * is used (including a lone `text` / `image` / `scene3d` tree root). Boxes and leaves with `pointerEvents: 'none'` are skipped so hits
 * fall through to geometry behind, matching {@link hitPathAtPoint}.
 *
 * Root `offsetX` / `offsetY` follow {@link dispatchHit}: non-finite or non-number values are treated as `0`.
 * Non-finite or non-number `x` / `y` return `null`.
 *
 * An empty-string `cursor` on a nested box does not stop the walk (child results are checked with truthiness),
 * so the nearest ancestor with a non-empty `cursor` wins. A root hit on a lone box with `cursor: ''` still
 * yields `''`. The same applies to lone `text` / `image` / `scene3d` roots: `cursor: ''` yields `''`, while
 * omitting `cursor` yields `null` (host/renderer default).
 *
 * @param element - Root of the UI tree.
 * @param layout - Computed layout parallel to `element`.
 * @param x - Pointer X (must be a finite number at runtime).
 * @param y - Pointer Y (must be a finite number at runtime).
 * @param offsetX - Root origin shift; non-finite values become `0`.
 * @param offsetY - Root origin shift; non-finite values become `0`.
 * @returns Deepest resolved `cursor` string, `''` when explicitly set empty, or `null` for default / miss.
 */
export function getCursorAtPoint(
  element: UIElement,
  layout: ComputedLayout,
  x: number,
  y: number,
  offsetX = 0,
  offsetY = 0,
): string | null {
  const hit = rootedLayoutPointContainment(layout, x, y, offsetX, offsetY)
  if (!hit) return null
  const { absX, absY } = hit

  // Check children (deepest first via recursion)
  if (element.kind === 'box') {
    const childOrigin = scrollSafeChildOffsets(absX, absY, element.props.scrollX, element.props.scrollY)

    const asc = getChildrenByZAsc(element)
    if (childOrigin) {
      for (let k = asc.length - 1; k >= 0; k--) {
        const i = asc[k]!
        const childLayout = layout.children[i]
        if (childLayout) {
          const childCursor = getCursorAtPoint(
            element.children[i]!,
            childLayout,
            x,
            y,
            childOrigin.ox,
            childOrigin.oy,
          )
          if (childCursor) return childCursor
        }
      }
    }
  }

  if (element.props.pointerEvents === 'none') return null

  return element.props.cursor ?? null
}

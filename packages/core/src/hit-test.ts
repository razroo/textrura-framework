import type { ComputedLayout } from 'textura'
import type { UIElement, BoxElement, EventHandlers, HitEvent } from './types.js'
import { hasFocusCandidateHandlers } from './focus-candidates.js'
import { finiteNumberOrZero, layoutBoundsAreFinite } from './layout-bounds.js'

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
  const z = el.props.zIndex
  return typeof z === 'number' && Number.isFinite(z) ? z : 0
}

function getChildrenByZAsc(boxEl: BoxElement): number[] {
  const n = boxEl.children.length
  if (n === 0) return []
  if (n === 1) return [0]

  const cached = zIndexOrderCache.get(boxEl)
  if (cached && cached.zValues.length === boxEl.children.length) {
    let unchanged = true
    for (let i = 0; i < boxEl.children.length; i++) {
      if (cached.zValues[i] !== zIndexOf(boxEl.children[i]!)) {
        unchanged = false
        break
      }
    }
    if (unchanged) return cached.asc
  }

  const zValues = boxEl.children.map(child => zIndexOf(child))
  const asc = boxEl.children
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

  // Apply scroll offset for scroll containers
  let childOffsetX = absX
  let childOffsetY = absY
  if (element.kind === 'box') {
    const { overflow, scrollX, scrollY } = element.props
    if (overflow === 'hidden' || overflow === 'scroll') {
      // Point must be inside the box to hit children
      if (x < absX || x > absX + layout.width || y < absY || y > absY + layout.height) {
        return
      }
    }
    childOffsetX -= finiteNumberOrZero(scrollX)
    childOffsetY -= finiteNumberOrZero(scrollY)
  }

  const inside =
    x >= absX &&
    x <= absX + layout.width &&
    y >= absY &&
    y <= absY + layout.height

  if (!inside) return

  if (element.kind === 'box') {
    const boxEl = element as BoxElement
    const passThrough = boxEl.props.pointerEvents === 'none'
    if (boxEl.handlers && !passThrough) {
      results.push({ layout, handlers: boxEl.handlers, element: boxEl, absX, absY })
    }

    for (const i of getChildrenByZAsc(boxEl)) {
      const childLayout = layout.children[i]
      if (childLayout) {
        collectHits(boxEl.children[i]!, childLayout, x, y, childOffsetX, childOffsetY, results)
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

  const { overflow, scrollX, scrollY } = boxEl.props
  if (overflow === 'hidden' || overflow === 'scroll') {
    if (x < absX || x > absX + layout.width || y < absY || y > absY + layout.height) {
      return { handled: false }
    }
  }

  const inside =
    x >= absX &&
    x <= absX + layout.width &&
    y >= absY &&
    y <= absY + layout.height

  if (!inside) return { handled: false }

  let focusTarget: HitDispatchResult['focusTarget']
  const childOffsetX = absX - finiteNumberOrZero(scrollX)
  const childOffsetY = absY - finiteNumberOrZero(scrollY)
  const asc = getChildrenByZAsc(boxEl)

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
      childOffsetX,
      childOffsetY,
      extra,
    )
    if (childResult.handled) return childResult
    if (eventType === 'onClick' && !focusTarget && childResult.focusTarget) {
      focusTarget = childResult.focusTarget
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
 * {@link import('./types.js').EventHandlers} also lists keyboard and composition keys for the focused
 * element, but those are **not** routed by `(x, y)` here — use {@link import('./keyboard.js').dispatchKeyboardEvent}
 * and {@link import('./keyboard.js').dispatchCompositionEvent} (or {@link import('./app.js').App.dispatchKey} /
 * {@link import('./app.js').App.dispatchComposition} from `createApp`) so Tab, typing, and IME go to the
 * focused target instead of whatever box lies under the pointer.
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
 * @param eventType - Which handler slot to dispatch (e.g. `onClick`, `onPointerDown`).
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
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (!layoutBoundsAreFinite(layout)) return null

  const ox = finiteNumberOrZero(offsetX)
  const oy = finiteNumberOrZero(offsetY)
  const absX = ox + layout.x
  const absY = oy + layout.y

  if (element.kind === 'box') {
    const { overflow } = element.props
    if (overflow === 'hidden' || overflow === 'scroll') {
      if (x < absX || x > absX + layout.width || y < absY || y > absY + layout.height) {
        return null
      }
    }
  }

  const inside =
    x >= absX &&
    x <= absX + layout.width &&
    y >= absY &&
    y <= absY + layout.height

  if (!inside) return null

  if (element.kind !== 'box') return null

  const boxEl = element as BoxElement
  let childOffsetX = absX
  let childOffsetY = absY
  childOffsetX -= finiteNumberOrZero(boxEl.props.scrollX)
  childOffsetY -= finiteNumberOrZero(boxEl.props.scrollY)

  const asc = getChildrenByZAsc(boxEl)
  for (let k = asc.length - 1; k >= 0; k--) {
    const i = asc[k]!
    const childLayout = layout.children[i]
    if (!childLayout) continue
    const sub = hitPathAtPoint(boxEl.children[i]!, childLayout, x, y, childOffsetX, childOffsetY)
    if (sub !== null) return [i, ...sub]
  }
  if (boxEl.props.pointerEvents === 'none') return null
  return []
}

/**
 * Resolve the deepest `cursor` style at `(x, y)`.
 *
 * Walk follows the same scroll and overflow clipping rules as {@link dispatchHit}. {@link hitPathAtPoint} only
 * returns box index paths, but cursor resolution also considers `text`, `image`, and `scene3d` nodes: when the point is inside
 * such a leaf’s layout and it is not `pointerEvents: 'none'`, its {@link import('./types.js').StyleProps.cursor}
 * is used (including a lone `text` / `image` / `scene3d` tree root). Boxes with `pointerEvents: 'none'` are skipped so hits
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
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (!layoutBoundsAreFinite(layout)) return null

  const ox = finiteNumberOrZero(offsetX)
  const oy = finiteNumberOrZero(offsetY)
  const absX = ox + layout.x
  const absY = oy + layout.y

  if (element.kind === 'box') {
    const { overflow } = element.props
    if (overflow === 'hidden' || overflow === 'scroll') {
      if (x < absX || x > absX + layout.width || y < absY || y > absY + layout.height) {
        return null
      }
    }
  }

  const inside =
    x >= absX && x <= absX + layout.width &&
    y >= absY && y <= absY + layout.height

  if (!inside) return null

  // Check children (deepest first via recursion)
  if (element.kind === 'box') {
    let childOffX = absX
    let childOffY = absY
    childOffX -= finiteNumberOrZero(element.props.scrollX)
    childOffY -= finiteNumberOrZero(element.props.scrollY)

    const asc = getChildrenByZAsc(element)
    for (let k = asc.length - 1; k >= 0; k--) {
      const i = asc[k]!
      const childLayout = layout.children[i]
      if (childLayout) {
        const childCursor = getCursorAtPoint(element.children[i]!, childLayout, x, y, childOffX, childOffY)
        if (childCursor) return childCursor
      }
    }
  }

  if (element.props.pointerEvents === 'none') return null

  return element.props.cursor ?? null
}

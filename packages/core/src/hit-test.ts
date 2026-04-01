import type { ComputedLayout } from 'textura'
import type { UIElement, BoxElement, EventHandlers, HitEvent } from './types.js'

interface HitTarget {
  layout: ComputedLayout
  handlers: EventHandlers
  element: BoxElement
  absX: number
  absY: number
}

interface ZIndexCacheEntry {
  signature: string
  /** Child indices in paint order: ascending z-index (matches canvas + terminal renderers). */
  asc: number[]
}

const zIndexOrderCache = new WeakMap<BoxElement, ZIndexCacheEntry>()

function zIndexOf(el: UIElement): number {
  const z = (el.props as Record<string, unknown>).zIndex
  return typeof z === 'number' && Number.isFinite(z) ? z : 0
}

function getChildrenByZAsc(boxEl: BoxElement): number[] {
  const signature = boxEl.children.map((child, i) => `${i}:${zIndexOf(child)}`).join('|')
  const cached = zIndexOrderCache.get(boxEl)
  if (cached && cached.signature === signature) {
    return cached.asc
  }
  const asc = boxEl.children.map((_, i) => i).sort((a, b) => zIndexOf(boxEl.children[a]!) - zIndexOf(boxEl.children[b]!))
  zIndexOrderCache.set(boxEl, { signature, asc })
  return asc
}

/** Topmost-first sibling order for picking a single path or cursor (reverse of paint order). */
function getChildrenByZDesc(boxEl: BoxElement): number[] {
  return getChildrenByZAsc(boxEl).slice().reverse()
}

/** Result of routing a pointer/keyboard-style hit to handlers. */
export interface HitDispatchResult {
  handled: boolean
  /** Set when a focusable box handled `onClick` (for keyboard focus). */
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
    if (scrollX) childOffsetX -= scrollX
    if (scrollY) childOffsetY -= scrollY
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

/**
 * Dispatch a pointer-style event at (x, y) against the element tree.
 * The deepest hit with a matching handler runs first; only one handler runs per call.
 * Optional `extra` is shallow-merged onto the `HitEvent` after base fields so callers
 * can pass modifier keys, `button`, wheel deltas, and other renderer-specific metadata.
 */
export function dispatchHit(
  element: UIElement,
  layout: ComputedLayout,
  eventType: keyof EventHandlers,
  x: number,
  y: number,
  extra?: Record<string, unknown>,
): HitDispatchResult {
  const hits: HitTarget[] = []
  collectHits(element, layout, x, y, 0, 0, hits)

  // Deepest hit first (last in list = most nested)
  for (let i = hits.length - 1; i >= 0; i--) {
    const hit = hits[i]!
    const handler = hit.handlers[eventType]
    if (handler) {
      const event: HitEvent = {
        x,
        y,
        localX: x - hit.absX,
        localY: y - hit.absY,
        target: hit.layout,
        ...extra,
      }
      ;(handler as (e: HitEvent) => void)(event)
      const focusable = !!(
        hit.handlers.onClick ||
        hit.handlers.onKeyDown ||
        hit.handlers.onKeyUp ||
        hit.handlers.onCompositionStart ||
        hit.handlers.onCompositionUpdate ||
        hit.handlers.onCompositionEnd
      )
      const focusTarget =
        eventType === 'onClick' && focusable
          ? { element: hit.element, layout: hit.layout }
          : undefined
      return { handled: true, focusTarget }
    }
  }
  // Click-to-focus fallback: allow focusable boxes to receive focus on click
  // even when they do not implement an onClick handler.
  if (eventType === 'onClick') {
    for (let i = hits.length - 1; i >= 0; i--) {
      const hit = hits[i]!
      const focusable = !!(
        hit.handlers.onClick ||
        hit.handlers.onKeyDown ||
        hit.handlers.onKeyUp ||
        hit.handlers.onCompositionStart ||
        hit.handlers.onCompositionUpdate ||
        hit.handlers.onCompositionEnd
      )
      if (focusable) {
        return { handled: false, focusTarget: { element: hit.element, layout: hit.layout } }
      }
    }
  }
  return { handled: false }
}

/**
 * True when the point is over an element that participates in pointer hit-testing
 * (`onClick`, `onPointerDown` / `Up` / `Move`, `onWheel`). Keyboard and composition
 * handlers alone do not count — use this for hover / pointer-capture style checks.
 */
export function hasInteractiveHitAtPoint(
  element: UIElement,
  layout: ComputedLayout,
  x: number,
  y: number,
): boolean {
  const hits: HitTarget[] = []
  collectHits(element, layout, x, y, 0, 0, hits)
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
 * Child indices from root to the deepest box under (x, y). Among overlapping siblings, prefers higher z-index (topmost).
 * Boxes with `pointerEvents: 'none'` do not terminate the path when they have no deeper hit (same idea as `getCursorAtPoint` and `collectHits`).
 * Returns `null` when the point misses the tree. Returns `[]` when the point hits the
 * root (or a leaf box) with no deeper box hit.
 */
export function hitPathAtPoint(
  element: UIElement,
  layout: ComputedLayout,
  x: number,
  y: number,
  offsetX = 0,
  offsetY = 0,
): number[] | null {
  const absX = offsetX + layout.x
  const absY = offsetY + layout.y

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
  if (boxEl.props.scrollX) childOffsetX -= boxEl.props.scrollX
  if (boxEl.props.scrollY) childOffsetY -= boxEl.props.scrollY

  for (const i of getChildrenByZDesc(boxEl)) {
    const childLayout = layout.children[i]
    if (!childLayout) continue
    const sub = hitPathAtPoint(boxEl.children[i]!, childLayout, x, y, childOffsetX, childOffsetY)
    if (sub !== null) return [i, ...sub]
  }
  if (boxEl.props.pointerEvents === 'none') return null
  return []
}

/** Get the cursor style at a given point by walking the tree. Returns the deepest element's cursor prop. */
export function getCursorAtPoint(
  element: UIElement,
  layout: ComputedLayout,
  x: number,
  y: number,
  offsetX = 0,
  offsetY = 0,
): string | null {
  const absX = offsetX + layout.x
  const absY = offsetY + layout.y

  const inside =
    x >= absX && x <= absX + layout.width &&
    y >= absY && y <= absY + layout.height

  if (!inside) return null

  // Check children (deepest first via recursion)
  if (element.kind === 'box') {
    let childOffX = absX
    let childOffY = absY
    if (element.props.scrollX) childOffX -= element.props.scrollX
    if (element.props.scrollY) childOffY -= element.props.scrollY

    const indices = getChildrenByZDesc(element)
    for (let ii = 0; ii < indices.length; ii++) {
      const i = indices[ii]!
      const childLayout = layout.children[i]
      if (childLayout) {
        const childCursor = getCursorAtPoint(element.children[i]!, childLayout, x, y, childOffX, childOffY)
        if (childCursor) return childCursor
      }
    }
  }

  if (element.props.pointerEvents === 'none') return null

  // Return this element's cursor
  const cursor = (element.props as Record<string, unknown>).cursor as string | undefined
  return cursor ?? null
}

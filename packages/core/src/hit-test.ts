import type { ComputedLayout } from 'textura'
import type { UIElement, BoxElement, EventHandlers, HitEvent } from './types.js'

interface HitTarget {
  layout: ComputedLayout
  handlers: EventHandlers
  element: BoxElement
}

interface ZIndexCacheEntry {
  signature: string
  desc: number[]
}

const zIndexOrderCache = new WeakMap<BoxElement, ZIndexCacheEntry>()

function zIndexOf(el: UIElement): number {
  return (el.props as Record<string, unknown>).zIndex as number | undefined ?? 0
}

function getChildrenByZDesc(boxEl: BoxElement): number[] {
  const signature = boxEl.children.map((child, i) => `${i}:${zIndexOf(child)}`).join('|')
  const cached = zIndexOrderCache.get(boxEl)
  if (cached && cached.signature === signature) {
    return cached.desc
  }
  const desc = boxEl.children.map((_, i) => i).sort((a, b) => zIndexOf(boxEl.children[b]!) - zIndexOf(boxEl.children[a]!))
  zIndexOrderCache.set(boxEl, { signature, desc })
  return desc
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
    if (boxEl.handlers) {
      results.push({ layout, handlers: boxEl.handlers, element: boxEl })
    }

    for (const i of getChildrenByZDesc(boxEl)) {
      const childLayout = layout.children[i]
      if (childLayout) {
        collectHits(boxEl.children[i]!, childLayout, x, y, childOffsetX, childOffsetY, results)
      }
    }
  }
}

/** Dispatch an event at (x, y) against the element tree. Returns true if any handler fired. */
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
      const event: HitEvent = { x, y, target: hit.layout, ...extra }
      ;(handler as (e: HitEvent) => void)(event)
      const focusable = !!(
        hit.handlers.onClick ||
        hit.handlers.onKeyDown ||
        hit.handlers.onKeyUp
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
        hit.handlers.onKeyUp
      )
      if (focusable) {
        return { handled: false, focusTarget: { element: hit.element, layout: hit.layout } }
      }
    }
  }
  return { handled: false }
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

  // Return this element's cursor
  const cursor = (element.props as Record<string, unknown>).cursor as string | undefined
  return cursor ?? null
}

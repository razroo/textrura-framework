import type { ComputedLayout } from 'textura'
import type { UIElement, BoxElement, EventHandlers, HitEvent } from './types.js'

interface HitTarget {
  layout: ComputedLayout
  handlers: EventHandlers
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

  const inside =
    x >= absX &&
    x <= absX + layout.width &&
    y >= absY &&
    y <= absY + layout.height

  if (!inside) return

  if (element.kind === 'box') {
    const boxEl = element as BoxElement
    if (boxEl.handlers) {
      results.push({ layout, handlers: boxEl.handlers })
    }
    for (let i = 0; i < boxEl.children.length; i++) {
      const childLayout = layout.children[i]
      if (childLayout) {
        collectHits(boxEl.children[i]!, childLayout, x, y, absX, absY, results)
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
): boolean {
  const hits: HitTarget[] = []
  collectHits(element, layout, x, y, 0, 0, hits)

  // Deepest hit first (last in list = most nested)
  for (let i = hits.length - 1; i >= 0; i--) {
    const hit = hits[i]!
    const handler = hit.handlers[eventType]
    if (handler) {
      const event: HitEvent = { x, y, target: hit.layout }
      handler(event)
      return true
    }
  }
  return false
}

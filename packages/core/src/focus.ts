import type { ComputedLayout } from 'textura'
import type { UIElement, BoxElement } from './types.js'
import { layoutBoundsAreFinite } from './layout-bounds.js'
import { signal } from './signals.js'
import type { Signal } from './signals.js'

export interface FocusTarget {
  element: BoxElement
  layout: ComputedLayout
  focusIndex?: number
}

/** Signal tracking the currently focused element. */
export const focusedElement: Signal<FocusTarget | null> = signal<FocusTarget | null>(null)

/** Set focus to an element. */
export function setFocus(element: BoxElement, layout: ComputedLayout): void {
  focusedElement.set({ element, layout })
}

/** Clear the current focus. */
export function clearFocus(): void {
  focusedElement.set(null)
}

/**
 * Document-order focusable elements (Tab order). Useful for inspector overlays.
 *
 * A box is focusable when it defines any of `onClick`, `onKeyDown`, `onKeyUp`,
 * `onCompositionStart`, `onCompositionUpdate`, or `onCompositionEnd`.
 * Skips boxes whose layout bounds are non-finite or have negative width/height, and does not walk
 * their subtrees — same rule as hit-testing so corrupt geometry cannot enter focus order.
 */
export function collectFocusOrder(
  element: UIElement,
  layout: ComputedLayout,
): FocusTarget[] {
  const results: FocusTarget[] = []
  collectFocusable(element, layout, results)
  return results
}

/** Collect all focusable elements (click, key, or composition handlers) in document order. */
function collectFocusable(
  element: UIElement,
  layout: ComputedLayout,
  results: FocusTarget[],
): void {
  if (!layoutBoundsAreFinite(layout)) return
  if (element.kind === 'box') {
    if (
      element.handlers?.onKeyDown ||
      element.handlers?.onKeyUp ||
      element.handlers?.onCompositionStart ||
      element.handlers?.onCompositionUpdate ||
      element.handlers?.onCompositionEnd ||
      element.handlers?.onClick
    ) {
      results.push({ element, layout })
    }
    for (let i = 0; i < element.children.length; i++) {
      const childLayout = layout.children[i]
      if (childLayout) {
        collectFocusable(element.children[i]!, childLayout, results)
      }
    }
  }
}

function sameBounds(a: ComputedLayout, b: ComputedLayout): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function findTargetIndex(targets: FocusTarget[], current: FocusTarget): number {
  const byIdentity = targets.findIndex(t => t.element === current.element)
  if (byIdentity !== -1) return byIdentity
  return targets.findIndex(t => sameBounds(t.layout, current.layout))
}

/** Resolve currently focused target against the latest tree/layout after rerenders. */
export function resolveFocusedTarget(tree: UIElement, layout: ComputedLayout): FocusTarget | null {
  const current = focusedElement.peek()
  if (!current) return null

  const targets: FocusTarget[] = []
  collectFocusable(tree, layout, targets)
  if (targets.length === 0) return null

  const indexed = current.focusIndex
  const idx = indexed !== undefined && indexed >= 0 && indexed < targets.length
    ? indexed
    : findTargetIndex(targets, current)
  if (idx === -1) return null

  const resolved = { ...targets[idx]!, focusIndex: idx }
  if (resolved.element !== current.element || !sameBounds(resolved.layout, current.layout)) {
    focusedElement.set(resolved)
  }
  return resolved
}

/** Move focus to the next focusable element. */
export function focusNext(tree: UIElement, layout: ComputedLayout): void {
  const targets: FocusTarget[] = []
  collectFocusable(tree, layout, targets)
  if (targets.length === 0) return

  const current = focusedElement.peek()
  if (!current) {
    focusedElement.set({ ...targets[0]!, focusIndex: 0 })
    return
  }

  const idx = current.focusIndex ?? findTargetIndex(targets, current)
  const safeIdx = idx >= 0 ? idx : 0
  const nextIndex = (safeIdx + 1) % targets.length
  const next = targets[nextIndex]!
  focusedElement.set({ ...next, focusIndex: nextIndex })
}

/** Move focus to the previous focusable element. */
export function focusPrev(tree: UIElement, layout: ComputedLayout): void {
  const targets: FocusTarget[] = []
  collectFocusable(tree, layout, targets)
  if (targets.length === 0) return

  const current = focusedElement.peek()
  if (!current) {
    const lastIndex = targets.length - 1
    focusedElement.set({ ...targets[lastIndex]!, focusIndex: lastIndex })
    return
  }

  const idx = current.focusIndex ?? findTargetIndex(targets, current)
  const safeIdx = idx >= 0 ? idx : 0
  const prevIndex = (safeIdx - 1 + targets.length) % targets.length
  const prev = targets[prevIndex]!
  focusedElement.set({ ...prev, focusIndex: prevIndex })
}

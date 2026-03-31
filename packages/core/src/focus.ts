import type { ComputedLayout } from 'textura'
import type { UIElement, BoxElement } from './types.js'
import { signal } from './signals.js'
import type { Signal } from './signals.js'

interface FocusTarget {
  element: BoxElement
  layout: ComputedLayout
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

/** Collect all focusable elements (those with keyboard or click handlers) in document order. */
function collectFocusable(
  element: UIElement,
  layout: ComputedLayout,
  results: FocusTarget[],
): void {
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

/** Move focus to the next focusable element. */
export function focusNext(tree: UIElement, layout: ComputedLayout): void {
  const targets: FocusTarget[] = []
  collectFocusable(tree, layout, targets)
  if (targets.length === 0) return

  const current = focusedElement.peek()
  if (!current) {
    focusedElement.set(targets[0]!)
    return
  }

  const idx = targets.findIndex(t => t.element === current.element)
  const next = targets[(idx + 1) % targets.length]!
  focusedElement.set(next)
}

/** Move focus to the previous focusable element. */
export function focusPrev(tree: UIElement, layout: ComputedLayout): void {
  const targets: FocusTarget[] = []
  collectFocusable(tree, layout, targets)
  if (targets.length === 0) return

  const current = focusedElement.peek()
  if (!current) {
    focusedElement.set(targets[targets.length - 1]!)
    return
  }

  const idx = targets.findIndex(t => t.element === current.element)
  const prev = targets[(idx - 1 + targets.length) % targets.length]!
  focusedElement.set(prev)
}

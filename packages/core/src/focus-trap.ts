import type { ComputedLayout } from 'textura'
import type { UIElement, BoxElement } from './types.js'
import { focusedElement, setFocus } from './focus.js'
import { layoutBoundsAreFinite } from './layout-bounds.js'

interface FocusTarget {
  element: BoxElement
  layout: ComputedLayout
}

function collectFocusable(element: UIElement, layout: ComputedLayout, out: FocusTarget[]): void {
  if (!layoutBoundsAreFinite(layout)) return
  if (element.kind !== 'box') return
  if (
    element.handlers?.onClick ||
    element.handlers?.onKeyDown ||
    element.handlers?.onKeyUp ||
    element.handlers?.onCompositionStart ||
    element.handlers?.onCompositionUpdate ||
    element.handlers?.onCompositionEnd
  ) {
    out.push({ element, layout })
  }
  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i]
    const childLayout = layout.children[i]
    if (child && childLayout) collectFocusable(child, childLayout, out)
  }
}

function resolveSubtree(
  tree: UIElement,
  layout: ComputedLayout,
  path: number[],
): FocusTarget | null {
  let el: UIElement = tree
  let lo: ComputedLayout = layout
  for (const idx of path) {
    if (el.kind !== 'box') return null
    const nextEl = el.children[idx]
    const nextLo = lo.children[idx]
    if (!nextEl || !nextLo) return null
    el = nextEl
    lo = nextLo
  }
  if (el.kind !== 'box') return null
  return { element: el, layout: lo }
}

/**
 * Move focus to the next or previous focusable box inside a subtree (modal / overlay trap).
 *
 * Focusables are boxes with any of `onClick`, `onKeyDown`, `onKeyUp`, or composition handlers,
 * in tree order (same rule as {@link collectFocusOrder}, including skipping corrupt layout bounds).
 *
 * When the current {@link focusedElement} is missing or not inside the trap list, `'next'`
 * jumps to the first focusable and `'prev'` to the last — so focus can enter the trap from
 * outside without clearing focus first.
 *
 * @param scopePath — Indices from the tree root to the trap root box (inclusive). Invalid
 *   paths (out-of-range index, non-box node, or empty focusable list under the subtree) yield `false`.
 * @returns `true` if focus was moved, `false` if the scope is invalid or contains no focusables.
 */
export function trapFocusStep(
  tree: UIElement,
  layout: ComputedLayout,
  scopePath: number[],
  direction: 'next' | 'prev' = 'next',
): boolean {
  const scope = resolveSubtree(tree, layout, scopePath)
  if (!scope) return false
  const targets: FocusTarget[] = []
  collectFocusable(scope.element, scope.layout, targets)
  if (targets.length === 0) return false

  const current = focusedElement.peek()
  let idx = current ? targets.findIndex(t => t.element === current.element) : -1
  if (idx < 0) idx = direction === 'next' ? -1 : 0
  const nextIdx = direction === 'next'
    ? (idx + 1) % targets.length
    : (idx - 1 + targets.length) % targets.length
  const next = targets[nextIdx]!
  setFocus(next.element, next.layout)
  return true
}

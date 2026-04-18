import type { ComputedLayout } from 'textura'
import type { UIElement, BoxElement } from './types.js'
import { hasFocusCandidateHandlers } from './focus-candidates.js'
import { focusedElement, setFocus } from './focus.js'
import { layoutBoundsAreFinite } from './layout-bounds.js'

interface FocusTarget {
  element: BoxElement
  layout: ComputedLayout
}

function collectFocusable(element: UIElement, layout: ComputedLayout, out: FocusTarget[]): void {
  if (!layoutBoundsAreFinite(layout)) return
  if (element.kind !== 'box') return
  if (hasFocusCandidateHandlers(element.handlers)) {
    out.push({ element, layout })
  }
  const kids = element.children
  const n = Array.isArray(kids) ? kids.length : 0
  for (let i = 0; i < n; i++) {
    const child = kids[i]
    const childLayout = layout.children[i]
    if (child && childLayout) collectFocusable(child, childLayout, out)
  }
}

function isValidScopeIndex(idx: unknown): idx is number {
  return typeof idx === 'number' && Number.isInteger(idx) && idx >= 0
}

function resolveSubtree(
  tree: UIElement,
  layout: ComputedLayout,
  path: number[],
): FocusTarget | null {
  let el: UIElement = tree
  let lo: ComputedLayout = layout
  for (const idx of path) {
    if (!isValidScopeIndex(idx)) return null
    if (el.kind !== 'box') return null
    const kids = el.children
    if (!Array.isArray(kids)) return null
    const nextEl = kids[idx]
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
 * Focusables are boxes with any of `onClick`, `onKeyDown`, `onKeyUp`,
 * `onCompositionStart`, `onCompositionUpdate`, or `onCompositionEnd`, in tree order (same rule as
 * {@link collectFocusOrder}, including skipping corrupt layout bounds and treating non-array
 * `children` as empty).
 *
 * When the current {@link focusedElement} is missing or not inside the trap list, `'next'`
 * jumps to the first focusable and `'prev'` to the last — so focus can enter the trap from
 * outside without clearing focus first.
 *
 * @param tree — UI root that contains the trap subtree (same tree passed to layout and hit-testing).
 *   When `scopePath` is an empty array, this node **is** the trap root: it must be a
 *   {@link import('./types.js').BoxElement} or `trapFocusStep` returns `false` (text/image/scene3d roots cannot host a trap).
 * @param layout — Computed layout parallel to `tree` from Textura/Yoga.
 * @param scopePath — Indices from the tree root to the trap root box (inclusive). Each segment must be a
 *   non-negative integer (`typeof idx === 'number'` and {@link Number.isInteger}); strings, booleans,
 *   `NaN`, `±Infinity`, and fractions are rejected. Pass `[]` to use
 *   `tree` / `layout` as the trap scope (cycle every focusable under that subtree). Invalid
 *   paths (out-of-range index, non-box node, non-array `children` on a box along the path, or empty
 *   focusable list under the subtree) yield `false`. The resolved scope root’s layout must satisfy
 *   {@link import('./layout-bounds.js').layoutBoundsAreFinite}; otherwise no focusables are collected.
 * @param direction — `'next'` for forward cycling (Tab-like), `'prev'` for backward (Shift+Tab-like); default `'next'`.
 *   At runtime only exact `'prev'` selects backward; any other value (including typos from untyped callers) is treated
 *   as `'next'` so accidental strings do not flip traversal direction.
 * @returns `true` if focus was moved, `false` if the scope is invalid or contains no focusables.
 */
export function trapFocusStep(
  tree: UIElement,
  layout: ComputedLayout,
  scopePath: number[],
  direction: 'next' | 'prev' = 'next',
): boolean {
  const step: 'next' | 'prev' = direction === 'prev' ? 'prev' : 'next'
  const scope = resolveSubtree(tree, layout, scopePath)
  if (!scope) return false
  const targets: FocusTarget[] = []
  collectFocusable(scope.element, scope.layout, targets)
  if (targets.length === 0) return false

  const current = focusedElement.peek()
  let idx = current ? targets.findIndex(t => t.element === current.element) : -1
  if (idx < 0) idx = step === 'next' ? -1 : 0
  const nextIdx = step === 'next'
    ? (idx + 1) % targets.length
    : (idx - 1 + targets.length) % targets.length
  const next = targets[nextIdx]!
  setFocus(next.element, next.layout)
  return true
}

/**
 * Move focus to the first focusable box inside a subtree. Companion to
 * {@link trapFocusStep}: call this on mount of a modal / overlay to seed focus,
 * then use `trapFocusStep` on Tab / Shift+Tab to contain it.
 *
 * Follows the same rules as `trapFocusStep` for resolving the scope (invalid
 * path → `false`, corrupt layout bounds skipped, non-array `children` treated
 * as empty). Returns `true` if focus was moved, `false` if the scope is invalid
 * or contains no focusables.
 *
 * @param tree — UI root containing the trap subtree.
 * @param layout — Computed layout parallel to `tree`.
 * @param scopePath — Indices from `tree` to the scope root. `[]` uses `tree` as the scope.
 */
export function focusFirstInside(
  tree: UIElement,
  layout: ComputedLayout,
  scopePath: number[],
): boolean {
  const scope = resolveSubtree(tree, layout, scopePath)
  if (!scope) return false
  const targets: FocusTarget[] = []
  collectFocusable(scope.element, scope.layout, targets)
  if (targets.length === 0) return false
  const first = targets[0]!
  setFocus(first.element, first.layout)
  return true
}

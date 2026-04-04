import type { ComputedLayout } from 'textura'
import type { UIElement, KeyboardHitEvent, CompositionHitEvent } from './types.js'
import { focusNext, focusPrev, resolveFocusedTarget } from './focus.js'

/**
 * Dispatch keyboard events to the focused element.
 *
 * Tab / Shift+Tab runs only on `'onKeyDown'` (not `'onKeyUp'`). Detection uses **strict** string
 * equality with `partialEvent.key === 'Tab'` (capital T), matching typical `KeyboardEvent.key` from
 * browsers; values such as `'tab'` do not trigger traversal and are handled like any other key below.
 *
 * On Tab keydown, the function always returns `true` and runs focus traversal (`focusNext` /
 * `focusPrev` from `./focus.js`); when the tree has no focusable boxes, those calls no-op and focus
 * stays unset.
 *
 * For other keys, returns `true` only when a resolved focus target exists and its handler for
 * `eventType` runs; otherwise `false`.
 *
 * @param tree - Root of the UI tree (same as composition dispatch).
 * @param layout - Computed layout parallel to `tree`.
 * @param eventType - `onKeyDown` or `onKeyUp`. Tab traversal runs only on `onKeyDown`.
 * @param partialEvent - Keyboard fields merged before `target` is set on the dispatched event; must not rely on a pre-set `target`.
 * @returns `true` when `partialEvent.key` is `'Tab'` and `eventType` is `'onKeyDown'` (traversal is
 *   always attempted, even when the tree has no focusables), or when a resolved focus target exists
 *   and its handler for `eventType` runs (including `'Tab'` on `'onKeyUp'` when `onKeyUp` is set —
 *   traversal remains keydown-only). `false` when there is no resolved focus target or no matching
 *   handler.
 */
export function dispatchKeyboardEvent(
  tree: UIElement,
  layout: ComputedLayout,
  eventType: 'onKeyDown' | 'onKeyUp',
  partialEvent: Omit<KeyboardHitEvent, 'target'>,
): boolean {
  if (partialEvent.key === 'Tab' && eventType === 'onKeyDown') {
    if (partialEvent.shiftKey) {
      focusPrev(tree, layout)
    } else {
      focusNext(tree, layout)
    }
    return true
  }

  const focused = resolveFocusedTarget(tree, layout)
  if (!focused) return false

  const handler = focused.element.handlers?.[eventType]
  if (handler) {
    const event: KeyboardHitEvent = { ...partialEvent, target: focused.layout }
    handler(event)
    return true
  }

  return false
}

/**
 * Dispatch IME composition events to the focused element.
 *
 * Uses the same {@link import('./focus.js').resolveFocusedTarget} resolution as
 * {@link dispatchKeyboardEvent} (non-Tab keys): there must be a current focus target whose layout
 * passes {@link import('./layout-bounds.js').layoutBoundsAreFinite} along the path from the tree root.
 *
 * The handler receives a full {@link CompositionHitEvent}: `target` is always the focused box’s
 * {@link ComputedLayout}, regardless of fields present on `partialEvent` (only `data` is taken from
 * the partial event today, but callers should omit `target` and let this function set it).
 *
 * @param tree - Root of the UI tree (same as keyboard dispatch).
 * @param layout - Computed layout parallel to `tree`.
 * @param eventType - `onCompositionStart`, `onCompositionUpdate`, or `onCompositionEnd`.
 * @param partialEvent - Fields merged before `target` is set; must not rely on a pre-set `target`.
 * @returns `true` when the focused target has a handler for `eventType` and it runs; `false` when
 * there is no resolved focus target or no matching composition handler.
 */
export function dispatchCompositionEvent(
  tree: UIElement,
  layout: ComputedLayout,
  eventType: 'onCompositionStart' | 'onCompositionUpdate' | 'onCompositionEnd',
  partialEvent: Omit<CompositionHitEvent, 'target'>,
): boolean {
  const focused = resolveFocusedTarget(tree, layout)
  if (!focused) return false
  const handler = focused.element.handlers?.[eventType]
  if (!handler) return false
  const event: CompositionHitEvent = { ...partialEvent, target: focused.layout }
  handler(event)
  return true
}


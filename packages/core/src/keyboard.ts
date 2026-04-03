import type { ComputedLayout } from 'textura'
import type { UIElement, KeyboardHitEvent, CompositionHitEvent } from './types.js'
import { focusNext, focusPrev, resolveFocusedTarget } from './focus.js'

/**
 * Dispatch keyboard events to the focused element.
 *
 * Tab / Shift+Tab runs only on `'onKeyDown'` (not `'onKeyUp'`). On keydown, Tab always returns
 * `true` and runs focus traversal (`focusNext` / `focusPrev` from `./focus.js`); when the tree has
 * no focusable boxes, those calls no-op and focus stays unset.
 *
 * For other keys, returns `true` only when a resolved focus target exists and its handler for
 * `eventType` runs; otherwise `false`.
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


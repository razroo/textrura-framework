import type { ComputedLayout } from 'textura'
import type { UIElement, KeyboardHitEvent, CompositionHitEvent } from './types.js'
import { focusedElement, focusNext, focusPrev } from './focus.js'

/**
 * Dispatch keyboard events to the focused element.
 * Also handles Tab/Shift+Tab focus traversal.
 */
export function dispatchKeyboardEvent(
  tree: UIElement,
  layout: ComputedLayout,
  eventType: 'onKeyDown' | 'onKeyUp',
  partialEvent: Omit<KeyboardHitEvent, 'target'>,
): boolean {
  const focused = focusedElement.peek()
  if (!focused) {
    if (partialEvent.key === 'Tab') {
      if (partialEvent.shiftKey) {
        focusPrev(tree, layout)
      } else {
        focusNext(tree, layout)
      }
      return true
    }
    return false
  }

  const handler = focused.element.handlers?.[eventType]
  if (handler) {
    const event: KeyboardHitEvent = { ...partialEvent, target: focused.layout }
    handler(event)
    return true
  }

  if (partialEvent.key === 'Tab') {
    if (partialEvent.shiftKey) {
      focusPrev(tree, layout)
    } else {
      focusNext(tree, layout)
    }
    return true
  }

  return false
}

/** Dispatch IME composition events to the focused element. */
export function dispatchCompositionEvent(
  _tree: UIElement,
  _layout: ComputedLayout,
  eventType: 'onCompositionStart' | 'onCompositionUpdate' | 'onCompositionEnd',
  partialEvent: Omit<CompositionHitEvent, 'target'>,
): boolean {
  const focused = focusedElement.peek()
  if (!focused) return false
  const handler = focused.element.handlers?.[eventType]
  if (!handler) return false
  const event: CompositionHitEvent = { ...partialEvent, target: focused.layout }
  handler(event)
  return true
}


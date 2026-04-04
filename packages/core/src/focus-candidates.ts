import type { EventHandlers } from './types.js'

/**
 * True when a box’s {@link EventHandlers} participate in Tab order and click-to-focus routing.
 * Keep in sync with `collectFocusOrder` / `trapFocusStep` and `dispatchHit`’s `onClick` `focusTarget`
 * rule (deepest box with any of these handlers).
 */
export function hasFocusCandidateHandlers(handlers: EventHandlers | undefined): boolean {
  return !!(
    handlers?.onClick ||
    handlers?.onKeyDown ||
    handlers?.onKeyUp ||
    handlers?.onCompositionStart ||
    handlers?.onCompositionUpdate ||
    handlers?.onCompositionEnd
  )
}

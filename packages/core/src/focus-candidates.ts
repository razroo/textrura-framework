import type { EventHandlers } from './types.js'

/**
 * True when a box’s {@link EventHandlers} participate in **Tab order**, **focus traps**, and
 * **click-to-focus** (`dispatchHit` → `focusTarget`, which only runs for `onClick`).
 *
 * Counts: `onClick`, `onKeyDown`, `onKeyUp`, `onCompositionStart`, `onCompositionUpdate`, `onCompositionEnd`.
 *
 * **Does not** look at `onPointerDown`, `onPointerUp`, `onPointerMove`, or `onWheel` — those drive pointer
 * dispatch and {@link import('./hit-test.js').hasInteractiveHitAtPoint} hover semantics only; a box that
 * only handles pointer events is not keyboard-focusable and does not receive `focusTarget` on click.
 *
 * Keep in sync with {@link import('./focus.js').collectFocusOrder}, {@link import('./focus-trap.js').trapFocusStep},
 * and `dispatchHit`’s `focusTarget` rule (deepest matching handler for the event type).
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

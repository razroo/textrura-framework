import type { TextInputState, TextInputEditResult } from './text-input.js'

export interface TextInputHistoryState {
  past: TextInputState[]
  present: TextInputState
  future: TextInputState[]
}

function cloneState(state: TextInputState): TextInputState {
  return {
    nodes: [...state.nodes],
    selection: { ...state.selection },
  }
}

/**
 * Create a history container for editable text state.
 * Undo/redo stacks are empty; {@link pushTextInputHistory} appends the previous `present` to `past`.
 */
export function createTextInputHistory(initial: TextInputState): TextInputHistoryState {
  return {
    past: [],
    present: cloneState(initial),
    future: [],
  }
}

/**
 * Push a new edit state and clear the redo stack (`future`).
 * If `next` matches `present` (same joined text and identical selection anchors), returns `history` unchanged.
 *
 * @param maxPast — Maximum prior states kept in `past` after this push; older entries are dropped from the front.
 *   Use `0` to disable undo (each push yields an empty `past`).
 */
export function pushTextInputHistory(
  history: TextInputHistoryState,
  next: TextInputState | TextInputEditResult,
  maxPast = 100,
): TextInputHistoryState {
  const present = cloneState(history.present)
  const incoming = cloneState({
    nodes: [...next.nodes],
    selection: { ...next.selection },
  })
  if (
    present.nodes.join('\n') === incoming.nodes.join('\n') &&
    present.selection.anchorNode === incoming.selection.anchorNode &&
    present.selection.anchorOffset === incoming.selection.anchorOffset &&
    present.selection.focusNode === incoming.selection.focusNode &&
    present.selection.focusOffset === incoming.selection.focusOffset
  ) {
    return history
  }

  const past = [...history.past, present]
  if (past.length > maxPast) {
    past.splice(0, past.length - maxPast)
  }
  return {
    past,
    present: incoming,
    future: [],
  }
}

/** Move `present` to `future`, restore the latest `past` entry as `present`, or no-op if `past` is empty. */
export function undoTextInputHistory(history: TextInputHistoryState): TextInputHistoryState {
  if (history.past.length === 0) return history
  const past = [...history.past]
  const prev = past.pop()!
  return {
    past,
    present: cloneState(prev),
    future: [cloneState(history.present), ...history.future],
  }
}

/** Move `present` to `past`, restore the next `future` entry as `present`, or no-op if `future` is empty. */
export function redoTextInputHistory(history: TextInputHistoryState): TextInputHistoryState {
  if (history.future.length === 0) return history
  const [next, ...future] = history.future
  return {
    past: [...history.past, cloneState(history.present)],
    present: cloneState(next!),
    future: future.map(cloneState),
  }
}


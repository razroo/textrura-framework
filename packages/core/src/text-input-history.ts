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

/** Create a history container for editable text state. */
export function createTextInputHistory(initial: TextInputState): TextInputHistoryState {
  return {
    past: [],
    present: cloneState(initial),
    future: [],
  }
}

/** Push a new edit state and clear redo stack. */
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

/** Undo one step, if available. */
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

/** Redo one step, if available. */
export function redoTextInputHistory(history: TextInputHistoryState): TextInputHistoryState {
  if (history.future.length === 0) return history
  const [next, ...future] = history.future
  return {
    past: [...history.past, cloneState(history.present)],
    present: cloneState(next!),
    future: future.map(cloneState),
  }
}


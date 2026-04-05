import type { TextInputState, TextInputEditResult } from './text-input.js'

export interface TextInputHistoryState {
  past: TextInputState[]
  present: TextInputState
  future: TextInputState[]
}

function cloneState(state: TextInputState): TextInputState {
  const out: TextInputState = {
    nodes: [...state.nodes],
    selection: { ...state.selection },
  }
  if (state.caretColumnIntent !== undefined) {
    out.caretColumnIntent = state.caretColumnIntent
  }
  return out
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
 * If `next` matches `present` (same joined text, identical selection anchors, and same `caretColumnIntent`), returns `history` unchanged.
 *
 * @param maxPast — Maximum prior states kept in `past` after this push; older entries are dropped from the front.
 *   Use `0` to disable undo (each push yields an empty `past`). `NaN` falls back to `100`; `+Infinity`
 *   uses {@link Number.MAX_SAFE_INTEGER} as the cap (unbounded in practice; still finite so trimming stays
 *   safe if the stack ever grew that large). Other non-finite values fall back to `100`. Negative finite values clamp to `0`.
 */
export function pushTextInputHistory(
  history: TextInputHistoryState,
  next: TextInputState | TextInputEditResult,
  maxPast = 100,
): TextInputHistoryState {
  let maxPastCap: number
  if (typeof maxPast !== 'number' || Number.isNaN(maxPast)) {
    maxPastCap = 100
  } else if (Number.isFinite(maxPast)) {
    maxPastCap = Math.max(0, Math.floor(maxPast))
  } else if (maxPast === Number.POSITIVE_INFINITY) {
    maxPastCap = Number.MAX_SAFE_INTEGER
  } else {
    maxPastCap = 100
  }

  const present = cloneState(history.present)
  const incoming = cloneState({
    nodes: [...next.nodes],
    selection: { ...next.selection },
    caretColumnIntent: next.caretColumnIntent,
  })
  if (
    present.nodes.join('\n') === incoming.nodes.join('\n') &&
    present.selection.anchorNode === incoming.selection.anchorNode &&
    present.selection.anchorOffset === incoming.selection.anchorOffset &&
    present.selection.focusNode === incoming.selection.focusNode &&
    present.selection.focusOffset === incoming.selection.focusOffset &&
    present.caretColumnIntent === incoming.caretColumnIntent
  ) {
    return history
  }

  const past = [...history.past, present]
  if (past.length > maxPastCap) {
    past.splice(0, past.length - maxPastCap)
  }
  return {
    past,
    present: incoming,
    future: [],
  }
}

/**
 * Move `present` onto `future`, restore the latest `past` entry as `present`, or return `history` unchanged if `past` is empty.
 *
 * @param history — Current stacks; `present` and popped `past` entries are cloned so callers can mutate the returned `present` without corrupting the stacks.
 * @returns A new {@link TextInputHistoryState} with one fewer `past` entry, or the same reference when `past` is empty.
 */
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

/**
 * Move `present` onto `past`, restore the next `future` entry as `present`, or return `history` unchanged if `future` is empty.
 *
 * @param history — Current stacks; restored `present` and remaining `future` entries are cloned.
 * @returns A new {@link TextInputHistoryState} with one fewer `future` entry, or the same reference when `future` is empty.
 */
export function redoTextInputHistory(history: TextInputHistoryState): TextInputHistoryState {
  if (history.future.length === 0) return history
  const [next, ...future] = history.future
  return {
    past: [...history.past, cloneState(history.present)],
    present: cloneState(next!),
    future: future.map(cloneState),
  }
}


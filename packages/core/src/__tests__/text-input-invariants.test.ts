import { describe, it, expect } from 'vitest'
import {
  backspaceInput,
  deleteInput,
  insertInputText,
  moveInputCaret,
  moveInputCaretByWord,
  moveInputCaretToLineBoundary,
  type TextInputState,
} from '../text-input.js'

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function assertStateInvariants(state: TextInputState): void {
  expect(state.nodes.length).toBeGreaterThan(0)

  const maxNode = state.nodes.length - 1
  expect(state.selection.anchorNode).toBeGreaterThanOrEqual(0)
  expect(state.selection.anchorNode).toBeLessThanOrEqual(maxNode)
  expect(state.selection.focusNode).toBeGreaterThanOrEqual(0)
  expect(state.selection.focusNode).toBeLessThanOrEqual(maxNode)

  const anchorText = state.nodes[state.selection.anchorNode] ?? ''
  const focusText = state.nodes[state.selection.focusNode] ?? ''
  expect(state.selection.anchorOffset).toBeGreaterThanOrEqual(0)
  expect(state.selection.anchorOffset).toBeLessThanOrEqual(anchorText.length)
  expect(state.selection.focusOffset).toBeGreaterThanOrEqual(0)
  expect(state.selection.focusOffset).toBeLessThanOrEqual(focusText.length)
}

describe('text-input invariants', () => {
  it('preserves valid selection bounds across randomized edit sequences', () => {
    const rand = seeded(1337)
    let state: TextInputState = {
      nodes: ['hello', 'world'],
      selection: { anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 0 },
    }

    const inserts = ['a', 'Z', ' ', '\n', 'に']

    for (let i = 0; i < 750; i++) {
      const op = Math.floor(rand() * 9)
      switch (op) {
        case 0:
          state = insertInputText(state, inserts[Math.floor(rand() * inserts.length)]!)
          break
        case 1:
          state = backspaceInput(state)
          break
        case 2:
          state = deleteInput(state)
          break
        case 3:
          state = moveInputCaret(state, 'left', rand() > 0.65)
          break
        case 4:
          state = moveInputCaret(state, 'right', rand() > 0.65)
          break
        case 5:
          state = moveInputCaret(state, 'up', rand() > 0.65)
          break
        case 6:
          state = moveInputCaret(state, 'down', rand() > 0.65)
          break
        case 7:
          state = moveInputCaretByWord(state, rand() > 0.5 ? 'left' : 'right', rand() > 0.7)
          break
        case 8:
          state = moveInputCaretToLineBoundary(state, rand() > 0.5 ? 'start' : 'end', rand() > 0.7)
          break
      }
      assertStateInvariants(state)
    }
  })

  it('clamps corrupt BigInt selection fields without throwing (deserialized / plain-JS payloads)', () => {
    const corrupt: TextInputState = {
      nodes: ['ab', 'cd'],
      selection: {
        anchorNode: 1n as unknown as number,
        anchorOffset: 99n as unknown as number,
        focusNode: 0n as unknown as number,
        focusOffset: 3n as unknown as number,
      },
    }

    assertStateInvariants(insertInputText(corrupt, 'x'))
    assertStateInvariants(backspaceInput(corrupt))
    assertStateInvariants(deleteInput(corrupt))
    assertStateInvariants(moveInputCaret(corrupt, 'left', false))
    assertStateInvariants(moveInputCaret(corrupt, 'right', true))
    assertStateInvariants(moveInputCaretByWord(corrupt, 'left', false))
    assertStateInvariants(moveInputCaretToLineBoundary(corrupt, 'start', false))
  })
})

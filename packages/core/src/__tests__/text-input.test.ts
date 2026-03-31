import { describe, it, expect } from 'vitest'
import {
  isCollapsedSelection,
  getInputSelectionText,
  insertInputText,
  replaceInputSelection,
  backspaceInput,
  deleteInput,
  moveInputCaret,
  type TextInputState,
} from '../text-input.js'

describe('text-input foundation', () => {
  it('detects collapsed selection', () => {
    expect(isCollapsedSelection({ anchorNode: 0, anchorOffset: 2, focusNode: 0, focusOffset: 2 })).toBe(true)
    expect(isCollapsedSelection({ anchorNode: 0, anchorOffset: 1, focusNode: 0, focusOffset: 2 })).toBe(false)
  })

  it('extracts selection text across nodes', () => {
    const text = getInputSelectionText(['Hello world', 'Second line'], {
      anchorNode: 0,
      anchorOffset: 6,
      focusNode: 1,
      focusOffset: 6,
    })
    expect(text).toBe('world\nSecond')
  })

  it('replaces selection with multi-line text', () => {
    const result = replaceInputSelection(
      ['abcDEF', 'ghi'],
      { anchorNode: 0, anchorOffset: 3, focusNode: 1, focusOffset: 1 },
      'X\nY',
    )
    expect(result.nodes).toEqual(['abcX', 'Yhi'])
    expect(result.selection).toEqual({ anchorNode: 1, anchorOffset: 1, focusNode: 1, focusOffset: 1 })
  })

  it('inserts text at caret', () => {
    const state: TextInputState = {
      nodes: ['Hello'],
      selection: { anchorNode: 0, anchorOffset: 5, focusNode: 0, focusOffset: 5 },
    }
    const result = insertInputText(state, '!')
    expect(result.nodes).toEqual(['Hello!'])
    expect(result.selection.anchorOffset).toBe(6)
  })

  it('backspace deletes previous character', () => {
    const state: TextInputState = {
      nodes: ['Hello'],
      selection: { anchorNode: 0, anchorOffset: 5, focusNode: 0, focusOffset: 5 },
    }
    const result = backspaceInput(state)
    expect(result.nodes).toEqual(['Hell'])
    expect(result.selection.anchorOffset).toBe(4)
  })

  it('backspace merges with previous node at boundary', () => {
    const state: TextInputState = {
      nodes: ['abc', 'def'],
      selection: { anchorNode: 1, anchorOffset: 0, focusNode: 1, focusOffset: 0 },
    }
    const result = backspaceInput(state)
    expect(result.nodes).toEqual(['abcdef'])
    expect(result.selection).toEqual({ anchorNode: 0, anchorOffset: 3, focusNode: 0, focusOffset: 3 })
  })

  it('delete-forward removes next character', () => {
    const state: TextInputState = {
      nodes: ['abc'],
      selection: { anchorNode: 0, anchorOffset: 1, focusNode: 0, focusOffset: 1 },
    }
    const result = deleteInput(state)
    expect(result.nodes).toEqual(['ac'])
    expect(result.selection.anchorOffset).toBe(1)
  })

  it('delete-forward merges with next node at boundary', () => {
    const state: TextInputState = {
      nodes: ['abc', 'def'],
      selection: { anchorNode: 0, anchorOffset: 3, focusNode: 0, focusOffset: 3 },
    }
    const result = deleteInput(state)
    expect(result.nodes).toEqual(['abcdef'])
    expect(result.selection).toEqual({ anchorNode: 0, anchorOffset: 3, focusNode: 0, focusOffset: 3 })
  })

  it('moves caret and can extend selection', () => {
    const base: TextInputState = {
      nodes: ['ab', 'cd'],
      selection: { anchorNode: 0, anchorOffset: 2, focusNode: 0, focusOffset: 2 },
    }
    const right = moveInputCaret(base, 'right')
    expect(right.selection).toEqual({ anchorNode: 1, anchorOffset: 0, focusNode: 1, focusOffset: 0 })

    const extend = moveInputCaret(right, 'right', true)
    expect(extend.selection).toEqual({ anchorNode: 1, anchorOffset: 0, focusNode: 1, focusOffset: 1 })
  })
})


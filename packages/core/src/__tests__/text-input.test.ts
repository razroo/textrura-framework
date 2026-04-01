import { describe, it, expect } from 'vitest'
import {
  isCollapsedSelection,
  getInputSelectionText,
  insertInputText,
  replaceInputSelection,
  backspaceInput,
  deleteInput,
  moveInputCaret,
  moveInputCaretByWord,
  moveInputCaretToLineBoundary,
  getInputCaretGeometry,
  type TextInputState,
} from '../text-input.js'
import type { TextNodeInfo } from '../selection.js'
import {
  createTextInputHistory,
  pushTextInputHistory,
  undoTextInputHistory,
  redoTextInputHistory,
} from '../text-input-history.js'

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

  it('replaces reversed cross-node selection before backspace/delete operations', () => {
    const reversed: TextInputState = {
      nodes: ['abc', 'def'],
      selection: { anchorNode: 1, anchorOffset: 1, focusNode: 0, focusOffset: 2 },
    }

    const backspaced = backspaceInput(reversed)
    const deleted = deleteInput(reversed)

    expect(backspaced.nodes).toEqual(['abef'])
    expect(backspaced.selection).toEqual({ anchorNode: 0, anchorOffset: 2, focusNode: 0, focusOffset: 2 })
    expect(deleted.nodes).toEqual(['abef'])
    expect(deleted.selection).toEqual({ anchorNode: 0, anchorOffset: 2, focusNode: 0, focusOffset: 2 })
  })

  it('keeps caret stable at document edges for backspace/delete', () => {
    const atStart: TextInputState = {
      nodes: ['abc'],
      selection: { anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 0 },
    }
    const atEnd: TextInputState = {
      nodes: ['abc'],
      selection: { anchorNode: 0, anchorOffset: 3, focusNode: 0, focusOffset: 3 },
    }

    const unchangedBackspace = backspaceInput(atStart)
    const unchangedDelete = deleteInput(atEnd)

    expect(unchangedBackspace.nodes).toEqual(['abc'])
    expect(unchangedBackspace.selection).toEqual(atStart.selection)
    expect(unchangedDelete.nodes).toEqual(['abc'])
    expect(unchangedDelete.selection).toEqual(atEnd.selection)
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

  it('maps ArrowLeft/ArrowRight against rtl reading direction', () => {
    const base: TextInputState = {
      nodes: ['abcd'],
      selection: { anchorNode: 0, anchorOffset: 2, focusNode: 0, focusOffset: 2 },
    }
    const rtlLeft = moveInputCaret(base, 'left', false, undefined, 'rtl')
    const rtlRight = moveInputCaret(base, 'right', false, undefined, 'rtl')

    expect(rtlLeft.selection).toEqual({ anchorNode: 0, anchorOffset: 3, focusNode: 0, focusOffset: 3 })
    expect(rtlRight.selection).toEqual({ anchorNode: 0, anchorOffset: 1, focusNode: 0, focusOffset: 1 })
  })

  it('supports word-jump movement left/right', () => {
    const base: TextInputState = {
      nodes: ['hello, brave new world'],
      selection: { anchorNode: 0, anchorOffset: 22, focusNode: 0, focusOffset: 22 },
    }
    const left = moveInputCaretByWord(base, 'left')
    expect(left.selection.focusOffset).toBe(17)
    const left2 = moveInputCaretByWord({ nodes: left.nodes, selection: left.selection }, 'left')
    expect(left2.selection.focusOffset).toBe(13)
    const right = moveInputCaretByWord(left2, 'right')
    expect(right.selection.focusOffset).toBe(16)
  })

  it('maps word-jump movement for rtl reading direction', () => {
    const base: TextInputState = {
      nodes: ['hello brave world'],
      selection: { anchorNode: 0, anchorOffset: 6, focusNode: 0, focusOffset: 6 },
    }
    const rtlLeft = moveInputCaretByWord(base, 'left', false, 'rtl')
    const rtlRight = moveInputCaretByWord(base, 'right', false, 'rtl')

    expect(rtlLeft.selection.focusOffset).toBe(11)
    expect(rtlRight.selection.focusOffset).toBe(0)
  })

  it('supports line boundary movement (Home/End semantics)', () => {
    const base: TextInputState = {
      nodes: ['abcd', 'efghij'],
      selection: { anchorNode: 1, anchorOffset: 3, focusNode: 1, focusOffset: 3 },
    }
    const home = moveInputCaretToLineBoundary(base, 'start')
    expect(home.selection).toEqual({ anchorNode: 1, anchorOffset: 0, focusNode: 1, focusOffset: 0 })

    const end = moveInputCaretToLineBoundary(home, 'end')
    expect(end.selection).toEqual({ anchorNode: 1, anchorOffset: 6, focusNode: 1, focusOffset: 6 })
  })

  it('maps Home/End semantics for rtl reading direction', () => {
    const base: TextInputState = {
      nodes: ['abcdef'],
      selection: { anchorNode: 0, anchorOffset: 3, focusNode: 0, focusOffset: 3 },
    }
    const rtlHome = moveInputCaretToLineBoundary(base, 'start', false, 'rtl')
    const rtlEnd = moveInputCaretToLineBoundary(base, 'end', false, 'rtl')

    expect(rtlHome.selection).toEqual({ anchorNode: 0, anchorOffset: 6, focusNode: 0, focusOffset: 6 })
    expect(rtlEnd.selection).toEqual({ anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 0 })
  })

  it('moves caret vertically with stable column intent across uneven lines', () => {
    const base: TextInputState = {
      nodes: ['abcdefghij', 'xy', 'abcdefghijkl'],
      selection: { anchorNode: 0, anchorOffset: 8, focusNode: 0, focusOffset: 8 },
    }

    const downToShort = moveInputCaret(base, 'down', false)
    expect(downToShort.selection).toEqual({ anchorNode: 1, anchorOffset: 2, focusNode: 1, focusOffset: 2 })
    expect(downToShort.caretColumnIntent).toBe(8)

    const downToLong = moveInputCaret(
      { nodes: downToShort.nodes, selection: downToShort.selection },
      'down',
      false,
      downToShort.caretColumnIntent,
    )
    expect(downToLong.selection).toEqual({ anchorNode: 2, anchorOffset: 8, focusNode: 2, focusOffset: 8 })
    expect(downToLong.caretColumnIntent).toBe(8)
  })

  it('extends selection vertically with preserved anchor and column intent', () => {
    const base: TextInputState = {
      nodes: ['abcd', 'abcdefghijkl'],
      selection: { anchorNode: 0, anchorOffset: 3, focusNode: 0, focusOffset: 3 },
    }
    const extended = moveInputCaret(base, 'down', true)
    expect(extended.selection).toEqual({ anchorNode: 0, anchorOffset: 3, focusNode: 1, focusOffset: 3 })
    expect(extended.caretColumnIntent).toBe(3)
  })

  it('computes caret geometry from measured lines', () => {
    const caret = getInputCaretGeometry([
      {
        element: { kind: 'text', props: { text: 'hello', font: '14px Inter', lineHeight: 20 } },
        direction: 'ltr',
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        index: 0,
        lines: [
          { text: 'hello', x: 10, y: 30, charOffsets: [0, 5, 10, 15, 20], charWidths: [5, 5, 5, 5, 5] },
        ],
      },
    ] satisfies TextNodeInfo[], {
      anchorNode: 0,
      anchorOffset: 3,
      focusNode: 0,
      focusOffset: 3,
    })

    expect(caret).not.toBeNull()
    expect(caret?.x).toBe(25)
    expect(caret?.y).toBe(30)
    expect(caret?.height).toBe(20)
  })

  it('computes caret geometry across multiline boundaries and clamps edges', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text', props: { text: 'abcd', font: '14px Inter', lineHeight: 18 } },
        direction: 'ltr',
        x: 0,
        y: 0,
        width: 100,
        height: 36,
        index: 0,
        lines: [
          { text: 'ab', x: 10, y: 20, charOffsets: [0, 6], charWidths: [6, 6] },
          { text: 'cd', x: 10, y: 38, charOffsets: [0, 7], charWidths: [7, 7] },
        ],
      },
    ]

    const firstLineStart = getInputCaretGeometry(textNodes, {
      anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 0,
    })
    const secondLineOffset = getInputCaretGeometry(textNodes, {
      anchorNode: 0, anchorOffset: 3, focusNode: 0, focusOffset: 3,
    })
    const clampedEnd = getInputCaretGeometry(textNodes, {
      anchorNode: 0, anchorOffset: 99, focusNode: 0, focusOffset: 99,
    })

    expect(firstLineStart?.x).toBe(10)
    expect(firstLineStart?.y).toBe(20)
    expect(secondLineOffset?.x).toBe(17)
    expect(secondLineOffset?.y).toBe(38)
    expect(clampedEnd?.x).toBe(24)
    expect(clampedEnd?.y).toBe(38)
    expect(clampedEnd?.offset).toBe(4)
  })

  it('computes caret geometry with rtl direction-aware x mapping', () => {
    const textNodes: TextNodeInfo[] = [
      {
        element: { kind: 'text', props: { text: 'abcd', font: '14px Inter', lineHeight: 18, dir: 'rtl' } },
        direction: 'rtl',
        x: 0,
        y: 0,
        width: 40,
        height: 18,
        index: 0,
        lines: [
          { text: 'abcd', x: 10, y: 20, charOffsets: [0, 10, 20, 30], charWidths: [10, 10, 10, 10] },
        ],
      },
    ]

    const atStart = getInputCaretGeometry(textNodes, {
      anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 0,
    })
    const atMiddle = getInputCaretGeometry(textNodes, {
      anchorNode: 0, anchorOffset: 2, focusNode: 0, focusOffset: 2,
    })
    const atEnd = getInputCaretGeometry(textNodes, {
      anchorNode: 0, anchorOffset: 4, focusNode: 0, focusOffset: 4,
    })

    expect(atStart?.x).toBe(50)
    expect(atMiddle?.x).toBe(30)
    expect(atEnd?.x).toBe(10)
  })

  it('supports undo/redo history for edits', () => {
    let history = createTextInputHistory({
      nodes: ['hello'],
      selection: { anchorNode: 0, anchorOffset: 5, focusNode: 0, focusOffset: 5 },
    })

    history = pushTextInputHistory(history, {
      nodes: ['hello!'],
      selection: { anchorNode: 0, anchorOffset: 6, focusNode: 0, focusOffset: 6 },
    })
    history = pushTextInputHistory(history, {
      nodes: ['hello!?'],
      selection: { anchorNode: 0, anchorOffset: 7, focusNode: 0, focusOffset: 7 },
    })

    history = undoTextInputHistory(history)
    expect(history.present.nodes).toEqual(['hello!'])

    history = undoTextInputHistory(history)
    expect(history.present.nodes).toEqual(['hello'])

    history = redoTextInputHistory(history)
    expect(history.present.nodes).toEqual(['hello!'])
  })

  it('supports copy/cut/paste flow with selection and history', () => {
    let history = createTextInputHistory({
      nodes: ['hello world'],
      selection: { anchorNode: 0, anchorOffset: 6, focusNode: 0, focusOffset: 11 },
    })

    const copied = getInputSelectionText(history.present.nodes, history.present.selection)
    expect(copied).toBe('world')

    const cut = replaceInputSelection(history.present.nodes, history.present.selection, '')
    history = pushTextInputHistory(history, cut)
    expect(history.present.nodes).toEqual(['hello '])

    const pasted = insertInputText(
      {
        nodes: history.present.nodes,
        selection: { anchorNode: 0, anchorOffset: 6, focusNode: 0, focusOffset: 6 },
      },
      copied,
    )
    history = pushTextInputHistory(history, pasted)
    expect(history.present.nodes).toEqual(['hello world'])

    history = undoTextInputHistory(history)
    expect(history.present.nodes).toEqual(['hello '])
    history = undoTextInputHistory(history)
    expect(history.present.nodes).toEqual(['hello world'])
  })
})

import { describe, expect, it } from 'vitest'
import {
  createTextInputHistory,
  pushTextInputHistory,
  redoTextInputHistory,
  undoTextInputHistory,
} from '../text-input-history.js'

const sel = (node: number, offset: number) => ({
  anchorNode: node,
  anchorOffset: offset,
  focusNode: node,
  focusOffset: offset,
})

describe('text input history', () => {
  it('does not alias the initial state: mutating the caller object after create leaves history unchanged', () => {
    const initial = { nodes: ['a'], selection: sel(0, 1) }
    const h = createTextInputHistory(initial)
    initial.nodes[0] = 'mutated'
    initial.selection.anchorOffset = 99
    expect(h.present.nodes).toEqual(['a'])
    expect(h.present.selection).toEqual(sel(0, 1))
  })

  it('does not alias pushed state: mutating the caller object after push leaves stored present unchanged', () => {
    let h = createTextInputHistory({ nodes: ['a'], selection: sel(0, 1) })
    const next = { nodes: ['ab'], selection: sel(0, 2) }
    h = pushTextInputHistory(h, next)
    next.nodes[0] = 'ZZZ'
    next.selection.anchorOffset = 0
    expect(h.present.nodes).toEqual(['ab'])
    expect(h.present.selection).toEqual(sel(0, 2))
  })

  it('returns the same history reference when push would not change content or selection', () => {
    const initial = createTextInputHistory({ nodes: ['a'], selection: sel(0, 1) })
    const again = pushTextInputHistory(initial, {
      nodes: ['a'],
      selection: sel(0, 1),
    })
    expect(again).toBe(initial)
  })

  it('records a new step when text is unchanged but selection differs', () => {
    let h = createTextInputHistory({ nodes: ['hello'], selection: sel(0, 0) })
    h = pushTextInputHistory(h, { nodes: ['hello'], selection: sel(0, 5) })
    expect(h.past).toHaveLength(1)
    expect(h.present.selection).toEqual(sel(0, 5))
  })

  it('records a new step when nodes and selection match but caretColumnIntent differs', () => {
    let h = createTextInputHistory({ nodes: ['ab', 'cdef'], selection: sel(1, 2) })
    h = pushTextInputHistory(h, { nodes: ['ab', 'cdef'], selection: sel(1, 2), caretColumnIntent: 8 })
    expect(h.past).toHaveLength(1)
    expect(h.present.caretColumnIntent).toBe(8)
  })

  it('preserves caretColumnIntent on the stack and restores it on undo', () => {
    let h = createTextInputHistory({
      nodes: ['short', 'muchlongerline'],
      selection: sel(0, 5),
    })
    h = pushTextInputHistory(h, {
      nodes: ['short', 'muchlongerline'],
      selection: { anchorNode: 1, anchorOffset: 5, focusNode: 1, focusOffset: 5 },
      caretColumnIntent: 8,
    })
    expect(h.present.caretColumnIntent).toBe(8)
    h = pushTextInputHistory(h, {
      nodes: ['short', 'muchlongerlinex'],
      selection: { anchorNode: 1, anchorOffset: 6, focusNode: 1, focusOffset: 6 },
    })
    expect(h.present.caretColumnIntent).toBeUndefined()
    h = undoTextInputHistory(h)
    expect(h.present.nodes).toEqual(['short', 'muchlongerline'])
    expect(h.present.selection).toEqual({
      anchorNode: 1,
      anchorOffset: 5,
      focusNode: 1,
      focusOffset: 5,
    })
    expect(h.present.caretColumnIntent).toBe(8)
  })

  it('records a new step when caret stays put but selection becomes a non-collapsed range', () => {
    let h = createTextInputHistory({ nodes: ['hello'], selection: sel(0, 1) })
    h = pushTextInputHistory(h, {
      nodes: ['hello'],
      selection: {
        anchorNode: 0,
        anchorOffset: 1,
        focusNode: 0,
        focusOffset: 4,
      },
    })
    expect(h.past).toHaveLength(1)
    expect(h.present.selection.focusOffset).toBe(4)
  })

  it('with maxPast 0, past stays empty and undo remains a no-op after edits', () => {
    let h = createTextInputHistory({ nodes: ['a'], selection: sel(0, 1) })
    h = pushTextInputHistory(h, { nodes: ['ab'], selection: sel(0, 2) }, 0)
    expect(h.past).toHaveLength(0)
    expect(h.present.nodes).toEqual(['ab'])
    h = pushTextInputHistory(h, { nodes: ['abc'], selection: sel(0, 3) }, 0)
    expect(h.past).toHaveLength(0)
    expect(undoTextInputHistory(h)).toBe(h)
  })

  it('clamps negative maxPast to 0 (same as disabling undo stack)', () => {
    let h = createTextInputHistory({ nodes: ['a'], selection: sel(0, 1) })
    h = pushTextInputHistory(h, { nodes: ['ab'], selection: sel(0, 2) }, -5)
    expect(h.past).toHaveLength(0)
    expect(h.present.nodes).toEqual(['ab'])
    expect(undoTextInputHistory(h)).toBe(h)
  })

  it('with maxPast +Infinity, past is not trimmed', () => {
    let h = createTextInputHistory({ nodes: ['0'], selection: sel(0, 1) })
    for (let i = 1; i <= 120; i++) {
      h = pushTextInputHistory(
        h,
        { nodes: [String(i)], selection: sel(0, 1) },
        Number.POSITIVE_INFINITY,
      )
    }
    expect(h.past).toHaveLength(120)
    expect(h.present.nodes).toEqual(['120'])
  })

  it('treats non-finite maxPast as default 100', () => {
    let h = createTextInputHistory({ nodes: ['0'], selection: sel(0, 1) })
    for (let i = 1; i <= 5; i++) {
      h = pushTextInputHistory(
        h,
        { nodes: [String(i)], selection: sel(0, 1) },
        Number.NaN,
      )
    }
    expect(h.past).toHaveLength(5)
    expect(h.past.map(p => p.nodes.join('\n'))).toEqual(['0', '1', '2', '3', '4'])
    expect(h.present.nodes).toEqual(['5'])
  })

  it('treats -Infinity maxPast as default 100', () => {
    let h = createTextInputHistory({ nodes: ['0'], selection: sel(0, 1) })
    for (let i = 1; i <= 5; i++) {
      h = pushTextInputHistory(
        h,
        { nodes: [String(i)], selection: sel(0, 1) },
        Number.NEGATIVE_INFINITY,
      )
    }
    expect(h.past).toHaveLength(5)
    expect(h.past.map(p => p.nodes.join('\n'))).toEqual(['0', '1', '2', '3', '4'])
    expect(h.present.nodes).toEqual(['5'])
  })

  it('treats non-number maxPast as default 100', () => {
    let h = createTextInputHistory({ nodes: ['0'], selection: sel(0, 1) })
    for (let i = 1; i <= 5; i++) {
      h = pushTextInputHistory(
        h,
        { nodes: [String(i)], selection: sel(0, 1) },
        'oops' as unknown as number,
      )
    }
    expect(h.past).toHaveLength(5)
    expect(h.past.map(p => p.nodes.join('\n'))).toEqual(['0', '1', '2', '3', '4'])
    expect(h.present.nodes).toEqual(['5'])
  })

  it('treats equivalent multi-line text as unchanged when selection fields match (node split only)', () => {
    const h = createTextInputHistory({ nodes: ['x', 'y'], selection: sel(0, 1) })
    const sameJoin = pushTextInputHistory(h, { nodes: ['x\ny'], selection: sel(0, 1) })
    expect(sameJoin).toBe(h)
  })

  it('floors fractional maxPast when trimming past', () => {
    let h = createTextInputHistory({ nodes: ['0'], selection: sel(0, 1) })
    for (let i = 1; i <= 4; i++) {
      h = pushTextInputHistory(
        h,
        { nodes: [String(i)], selection: sel(0, 1) },
        2.9,
      )
    }
    expect(h.past).toHaveLength(2)
    expect(h.past.map(p => p.nodes.join('\n'))).toEqual(['2', '3'])
    expect(h.present.nodes).toEqual(['4'])
  })

  it('trims past entries beyond maxPast, keeping the most recent states', () => {
    let h = createTextInputHistory({ nodes: ['0'], selection: sel(0, 1) })
    for (let i = 1; i <= 5; i++) {
      h = pushTextInputHistory(
        h,
        { nodes: [String(i)], selection: sel(0, 1) },
        3,
      )
    }
    expect(h.past).toHaveLength(3)
    expect(h.past.map(p => p.nodes.join('\n'))).toEqual(['2', '3', '4'])
    expect(h.present.nodes).toEqual(['5'])
  })

  it('clears redo stack when pushing after an undo', () => {
    let h = createTextInputHistory({ nodes: ['a'], selection: sel(0, 1) })
    h = pushTextInputHistory(h, { nodes: ['ab'], selection: sel(0, 2) })
    h = undoTextInputHistory(h)
    expect(h.future).toHaveLength(1)
    h = pushTextInputHistory(h, { nodes: ['ac'], selection: sel(0, 2) })
    expect(h.future).toHaveLength(0)
    expect(h.present.nodes).toEqual(['ac'])
  })

  it('is a no-op when undo is called with empty past', () => {
    const h = createTextInputHistory({ nodes: ['x'], selection: sel(0, 1) })
    expect(undoTextInputHistory(h)).toBe(h)
  })

  it('is a no-op when redo is called with empty future', () => {
    const h = createTextInputHistory({ nodes: ['x'], selection: sel(0, 1) })
    expect(redoTextInputHistory(h)).toBe(h)
  })

  it('supports multiple redo steps after multiple undos', () => {
    let h = createTextInputHistory({ nodes: ['0'], selection: sel(0, 1) })
    h = pushTextInputHistory(h, { nodes: ['1'], selection: sel(0, 1) })
    h = pushTextInputHistory(h, { nodes: ['2'], selection: sel(0, 1) })
    h = undoTextInputHistory(h)
    h = undoTextInputHistory(h)
    expect(h.present.nodes).toEqual(['0'])
    h = redoTextInputHistory(h)
    expect(h.present.nodes).toEqual(['1'])
    h = redoTextInputHistory(h)
    expect(h.present.nodes).toEqual(['2'])
    expect(h.future).toHaveLength(0)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { box } from '../elements.js'
import { dispatchKeyboardEvent, dispatchCompositionEvent } from '../keyboard.js'
import { clearFocus, collectFocusOrder, focusedElement, setFocus } from '../focus.js'
import { insertInputText, moveInputCaret } from '../text-input.js'
import type { TextInputState } from '../text-input.js'

describe('dispatchKeyboardEvent', () => {
  beforeEach(() => {
    clearFocus()
  })

  it('dispatches to focused element handler', () => {
    let pressed = ''
    const tree = box({ onKeyDown: (e) => { pressed = e.key } }, [])
    const layout = { x: 0, y: 0, width: 200, height: 100, children: [] }
    // Tab focuses the first focusable item
    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    const handled = dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'a',
      code: 'KeyA',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(handled).toBe(true)
    expect(pressed).toBe('a')
  })

  it('dispatches keyup only to focused target', () => {
    let released = ''
    const tree = box({ onKeyUp: (e) => { released = e.key } }, [])
    const layout = { x: 0, y: 0, width: 200, height: 100, children: [] }

    const ignored = dispatchKeyboardEvent(tree, layout, 'onKeyUp', {
      key: 'a',
      code: 'KeyA',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(ignored).toBe(false)

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    const handled = dispatchKeyboardEvent(tree, layout, 'onKeyUp', {
      key: 'a',
      code: 'KeyA',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(handled).toBe(true)
    expect(released).toBe('a')
  })

  it('tab/shift+tab move focus between focusable boxes', () => {
    const tree = box({}, [
      box({ onClick: () => undefined }, []),
      box({ onClick: () => undefined }, []),
    ])
    const layout = {
      x: 0, y: 0, width: 300, height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 100, children: [] },
        { x: 120, y: 0, width: 100, height: 100, children: [] },
      ],
    }

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const first = focusedElement.peek()

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const second = focusedElement.peek()

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const back = focusedElement.peek()

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(second?.element).not.toBe(first?.element)
    expect(back?.element).toBe(first?.element)
  })

  it('tab on keyup does not traverse focus (only keydown moves)', () => {
    const tree = box({}, [
      box({ onClick: () => undefined }, []),
      box({ onClick: () => undefined }, []),
    ])
    const layout = {
      x: 0,
      y: 0,
      width: 300,
      height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 100, children: [] },
        { x: 120, y: 0, width: 100, height: 100, children: [] },
      ],
    }

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const afterKeyDown = focusedElement.peek()

    dispatchKeyboardEvent(tree, layout, 'onKeyUp', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const afterKeyUp = focusedElement.peek()

    expect(afterKeyDown).not.toBeNull()
    expect(afterKeyUp?.element).toBe(afterKeyDown?.element)
  })

  it('shift+tab on keyup does not traverse focus (only keydown moves)', () => {
    const tree = box({}, [
      box({ onClick: () => undefined }, []),
      box({ onClick: () => undefined }, []),
    ])
    const layout = {
      x: 0,
      y: 0,
      width: 300,
      height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 100, children: [] },
        { x: 120, y: 0, width: 100, height: 100, children: [] },
      ],
    }

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const afterSecondForward = focusedElement.peek()

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const afterShiftTabDown = focusedElement.peek()

    dispatchKeyboardEvent(tree, layout, 'onKeyUp', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const afterShiftTabUp = focusedElement.peek()

    expect(afterSecondForward).not.toBeNull()
    expect(afterShiftTabDown).not.toBeNull()
    expect(afterShiftTabDown?.element).not.toBe(afterSecondForward?.element)
    expect(afterShiftTabUp?.element).toBe(afterShiftTabDown?.element)
  })

  it('tab traversal works even when focused element has onKeyDown', () => {
    const tree = box({}, [
      box({ onKeyDown: () => undefined }, []),
      box({ onKeyDown: () => undefined }, []),
    ])
    const layout = {
      x: 0, y: 0, width: 300, height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 100, children: [] },
        { x: 120, y: 0, width: 100, height: 100, children: [] },
      ],
    }

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const first = focusedElement.peek()

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const second = focusedElement.peek()

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(second?.element).not.toBe(first?.element)
  })

  it('tab traversal advances from stale focused identity after rerender', () => {
    const staleFocused = box({ onKeyDown: () => undefined }, [])
    const tree = box({}, [
      box({ onKeyDown: () => undefined }, []),
      box({ onKeyDown: () => undefined }, []),
    ])
    const layout = {
      x: 0, y: 0, width: 300, height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 100, children: [] },
        { x: 120, y: 0, width: 100, height: 100, children: [] },
      ],
    }
    setFocus(staleFocused, { x: 0, y: 0, width: 100, height: 100, children: [] })

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const focused = focusedElement.peek()

    expect(focused).not.toBeNull()
    expect(focused?.layout.x).toBe(120)
  })

  it('dispatches composition events to focused element', () => {
    let value = ''
    const tree = box({ onCompositionUpdate: (e) => { value = e.data } }, [])
    const layout = { x: 0, y: 0, width: 200, height: 100, children: [] }

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    const handled = dispatchCompositionEvent(tree, layout, 'onCompositionUpdate', { data: 'に' })
    expect(handled).toBe(true)
    expect(value).toBe('に')
  })

  it('returns false for composition dispatch when nothing is focused', () => {
    clearFocus()
    const tree = box({ onCompositionUpdate: () => undefined }, [])
    const layout = { x: 0, y: 0, width: 200, height: 100, children: [] }
    expect(
      dispatchCompositionEvent(tree, layout, 'onCompositionUpdate', { data: 'に' }),
    ).toBe(false)
  })

  it('returns false when focused element has no handler for that composition phase', () => {
    const tree = box({ onKeyDown: () => undefined }, [])
    const layout = { x: 0, y: 0, width: 200, height: 100, children: [] }
    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(focusedElement.peek()).not.toBeNull()
    expect(
      dispatchCompositionEvent(tree, layout, 'onCompositionUpdate', { data: 'に' }),
    ).toBe(false)
  })

  it('routes composition start/update/end lifecycle and commits draft', () => {
    let state: TextInputState = {
      nodes: ['ab'],
      selection: { anchorNode: 0, anchorOffset: 2, focusNode: 0, focusOffset: 2 },
    }
    let draft = ''
    let compSelection: TextInputState['selection'] | null = null

    const tree = box({
      onCompositionStart: () => {
        compSelection = { ...state.selection }
        draft = ''
      },
      onCompositionUpdate: (e) => {
        draft = e.data
      },
      onCompositionEnd: (e) => {
        draft = ''
        if (!e.data) return
        const baseSelection = compSelection ?? state.selection
        compSelection = null
        state = insertInputText({ nodes: state.nodes, selection: baseSelection }, e.data)
      },
    }, [])
    const layout = { x: 0, y: 0, width: 200, height: 80, children: [] }

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const started = dispatchCompositionEvent(tree, layout, 'onCompositionStart', { data: '' })
    const updated = dispatchCompositionEvent(tree, layout, 'onCompositionUpdate', { data: 'に' })
    const ended = dispatchCompositionEvent(tree, layout, 'onCompositionEnd', { data: 'に' })

    expect(started).toBe(true)
    expect(updated).toBe(true)
    expect(ended).toBe(true)
    expect(draft).toBe('')
    expect(state.nodes[0]).toBe('abに')
    expect(state.selection.focusOffset).toBe(3)
  })

  it('keeps composition insertion anchored when caret moves mid-composition', () => {
    let state: TextInputState = {
      nodes: ['ab'],
      selection: { anchorNode: 0, anchorOffset: 2, focusNode: 0, focusOffset: 2 },
    }
    let compSelection: TextInputState['selection'] | null = null

    const tree = box({
      onKeyDown: (e) => {
        if (e.key === 'ArrowLeft') {
          state = moveInputCaret(state, 'left', false)
        }
      },
      onCompositionStart: () => {
        compSelection = { ...state.selection }
      },
      onCompositionEnd: (e) => {
        if (!e.data) return
        const baseSelection = compSelection ?? state.selection
        compSelection = null
        state = insertInputText({ nodes: state.nodes, selection: baseSelection }, e.data)
      },
    }, [])
    const layout = { x: 0, y: 0, width: 200, height: 80, children: [] }

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    dispatchCompositionEvent(tree, layout, 'onCompositionStart', { data: '' })
    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    dispatchCompositionEvent(tree, layout, 'onCompositionEnd', { data: 'に' })

    expect(state.nodes[0]).toBe('abに')
    expect(state.selection.focusOffset).toBe(3)
  })

  it('does not leak composition events after focus switches', () => {
    let firstUpdates = 0
    let secondUpdates = 0

    const tree = box({}, [
      box({
        onCompositionUpdate: () => {
          firstUpdates++
        },
      }, []),
      box({
        onCompositionUpdate: () => {
          secondUpdates++
        },
      }, []),
    ])
    const layout = {
      x: 0, y: 0, width: 300, height: 80,
      children: [
        { x: 0, y: 0, width: 140, height: 80, children: [] },
        { x: 160, y: 0, width: 140, height: 80, children: [] },
      ],
    }

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    dispatchCompositionEvent(tree, layout, 'onCompositionUpdate', { data: 'に' })

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    dispatchCompositionEvent(tree, layout, 'onCompositionUpdate', { data: 'ほ' })

    expect(firstUpdates).toBe(1)
    expect(secondUpdates).toBe(1)
  })

  it('handles rapid composition updates and cancellation without stale commit', () => {
    let draft = ''
    let committed = ''

    const tree = box({
      onCompositionStart: () => {
        draft = ''
      },
      onCompositionUpdate: (e) => {
        draft = e.data
      },
      onCompositionEnd: (e) => {
        if (e.data) committed = e.data
        draft = ''
      },
    }, [])
    const layout = { x: 0, y: 0, width: 200, height: 80, children: [] }

    dispatchKeyboardEvent(tree, layout, 'onKeyDown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    dispatchCompositionEvent(tree, layout, 'onCompositionStart', { data: '' })
    dispatchCompositionEvent(tree, layout, 'onCompositionUpdate', { data: 'k' })
    dispatchCompositionEvent(tree, layout, 'onCompositionUpdate', { data: 'ka' })
    dispatchCompositionEvent(tree, layout, 'onCompositionUpdate', { data: 'かな' })
    dispatchCompositionEvent(tree, layout, 'onCompositionEnd', { data: '' })

    expect(draft).toBe('')
    expect(committed).toBe('')
  })
})

describe('collectFocusOrder', () => {
  it('returns focusable boxes in document order', () => {
    const a = box({ width: 10, height: 10, onClick: () => {} })
    const b = box({ width: 10, height: 10, onKeyDown: () => {} })
    const root = box({ width: 100, height: 100 }, [a, b])
    const layout = {
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { x: 0, y: 0, width: 10, height: 10, children: [] },
        { x: 0, y: 0, width: 10, height: 10, children: [] },
      ],
    }
    const order = collectFocusOrder(root, layout)
    expect(order.length).toBe(2)
    expect(order[0]?.element).toBe(a)
    expect(order[1]?.element).toBe(b)
  })
})


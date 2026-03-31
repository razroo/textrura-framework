import { describe, it, expect, beforeEach } from 'vitest'
import { box } from '../elements.js'
import { dispatchKeyboardEvent, dispatchCompositionEvent } from '../keyboard.js'
import { clearFocus, focusedElement, setFocus } from '../focus.js'

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
})


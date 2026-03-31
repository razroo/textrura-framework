import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from '../app.js'
import { box } from '../elements.js'
import { clearFocus } from '../focus.js'
import { signal } from '../signals.js'
import { backspaceInput, insertInputText, moveInputCaret } from '../text-input.js'
import type { Renderer, UIElement } from '../types.js'
import type { TextInputState } from '../text-input.js'

class TestRenderer implements Renderer {
  render(_layout: unknown, _tree: UIElement): void {
    // no-op
  }
  destroy(): void {
    // no-op
  }
}

describe('app input focus routing', () => {
  beforeEach(() => {
    clearFocus()
  })

  it('click focuses key-driven input even without onClick', async () => {
    let typed = ''
    const app = await createApp(
      () =>
        box(
          { width: 220, height: 120 },
          [
            box(
              {
                width: 180,
                height: 40,
                onKeyDown: (e) => {
                  if (e.key.length === 1) typed += e.key
                },
              },
              [],
            ),
          ],
        ),
      new TestRenderer(),
      { width: 220, height: 120 },
    )

    // Click inside the input box (child at 0,0 with 180x40).
    const click = app.dispatch('onClick', 10, 10)
    expect(click).toBe(false)

    const keyHandled = app.dispatchKey('onKeyDown', {
      key: 'a',
      code: 'KeyA',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(keyHandled).toBe(true)
    expect(typed).toBe('a')

    app.destroy()
  })

  it('click-focused input receives composition lifecycle and commits text', async () => {
    let committed = ''
    let draft = ''

    const app = await createApp(
      () =>
        box(
          { width: 220, height: 120 },
          [
            box(
              {
                width: 180,
                height: 40,
                onCompositionStart: () => {
                  draft = ''
                },
                onCompositionUpdate: (e) => {
                  draft = e.data
                },
                onCompositionEnd: (e) => {
                  if (e.data) committed += e.data
                  draft = ''
                },
              },
              [],
            ),
          ],
        ),
      new TestRenderer(),
      { width: 220, height: 120 },
    )

    app.dispatch('onClick', 10, 10)

    const started = app.dispatchComposition('onCompositionStart', { data: '' })
    const updated = app.dispatchComposition('onCompositionUpdate', { data: 'に' })
    const ended = app.dispatchComposition('onCompositionEnd', { data: 'に' })

    expect(started).toBe(true)
    expect(updated).toBe(true)
    expect(ended).toBe(true)
    expect(draft).toBe('')
    expect(committed).toBe('に')

    app.destroy()
  })

  it('routes focus and key events to the clicked target among multiple inputs', async () => {
    let leftTyped = ''
    let rightTyped = ''

    const app = await createApp(
      () =>
        box(
          { width: 300, height: 120, flexDirection: 'row' },
          [
            box(
              {
                width: 120,
                height: 40,
                onKeyDown: (e) => {
                  if (e.key.length === 1) leftTyped += e.key
                },
              },
              [],
            ),
            box({ width: 20, height: 40 }, []),
            box(
              {
                width: 120,
                height: 40,
                onKeyDown: (e) => {
                  if (e.key.length === 1) rightTyped += e.key
                },
              },
              [],
            ),
          ],
        ),
      new TestRenderer(),
      { width: 300, height: 120 },
    )

    // Click left target and type.
    app.dispatch('onClick', 10, 10)
    app.dispatchKey('onKeyDown', {
      key: 'l',
      code: 'KeyL',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    // Click right target and type.
    app.dispatch('onClick', 170, 10)
    app.dispatchKey('onKeyDown', {
      key: 'r',
      code: 'KeyR',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(leftTyped).toBe('l')
    expect(rightTyped).toBe('r')
    app.destroy()
  })

  it('pressing Enter inserts a newline and moves caret to next line', async () => {
    let state: TextInputState = {
      nodes: ['hello'],
      selection: { anchorNode: 0, anchorOffset: 5, focusNode: 0, focusOffset: 5 },
    }

    const app = await createApp(
      () =>
        box(
          { width: 220, height: 120 },
          [
            box(
              {
                width: 180,
                height: 40,
                onKeyDown: (e) => {
                  if (e.key === 'Enter') {
                    state = insertInputText(state, '\n')
                    return
                  }
                  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                    state = insertInputText(state, e.key)
                  }
                },
              },
              [],
            ),
          ],
        ),
      new TestRenderer(),
      { width: 220, height: 120 },
    )

    app.dispatch('onClick', 10, 10)
    const enterHandled = app.dispatchKey('onKeyDown', {
      key: 'Enter',
      code: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    const charHandled = app.dispatchKey('onKeyDown', {
      key: 'x',
      code: 'KeyX',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(enterHandled).toBe(true)
    expect(charHandled).toBe(true)
    expect(state.nodes).toEqual(['hello', 'x'])
    expect(state.selection).toEqual({ anchorNode: 1, anchorOffset: 1, focusNode: 1, focusOffset: 1 })
    app.destroy()
  })

  it('keeps focused key handlers fresh across rerenders for controlled inputs', async () => {
    const value = signal('')

    const app = await createApp(
      () => {
        const current = value.value
        return box(
          { width: 240, height: 120 },
          [
            box(
              {
                width: 200,
                height: 40,
                onKeyDown: (e) => {
                  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                    value.set(current + e.key)
                  }
                },
              },
              [],
            ),
          ],
        )
      },
      new TestRenderer(),
      { width: 240, height: 120 },
    )

    app.dispatch('onClick', 10, 10)
    app.dispatchKey('onKeyDown', { key: 'a', code: 'KeyA', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })
    app.dispatchKey('onKeyDown', { key: 'b', code: 'KeyB', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })
    app.dispatchKey('onKeyDown', { key: 'c', code: 'KeyC', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })

    expect(value.peek()).toBe('abc')
    app.destroy()
  })

  it('supports controlled typing sequence with backspace across rerenders', async () => {
    const value = signal('')

    const app = await createApp(
      () => {
        const current = value.value
        return box(
          { width: 240, height: 120 },
          [
            box(
              {
                width: 200,
                height: 40,
                onKeyDown: (e) => {
                  if (e.key === 'Backspace') {
                    value.set(current.slice(0, -1))
                    return
                  }
                  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                    value.set(current + e.key)
                  }
                },
              },
              [],
            ),
          ],
        )
      },
      new TestRenderer(),
      { width: 240, height: 120 },
    )

    app.dispatch('onClick', 10, 10)
    app.dispatchKey('onKeyDown', { key: 'a', code: 'KeyA', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })
    app.dispatchKey('onKeyDown', { key: 'b', code: 'KeyB', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })
    app.dispatchKey('onKeyDown', { key: 'c', code: 'KeyC', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })
    app.dispatchKey('onKeyDown', { key: 'Backspace', code: 'Backspace', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })
    app.dispatchKey('onKeyDown', { key: 'd', code: 'KeyD', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })

    expect(value.peek()).toBe('abd')
    app.destroy()
  })

  it('keeps focused dispatch stable during unrelated rerenders', async () => {
    const value = signal('')
    const tick = signal(0)

    const app = await createApp(
      () => {
        const current = value.value
        void tick.value
        return box(
          { width: 240, height: 120 },
          [
            box(
              {
                width: 200,
                height: 40,
                onKeyDown: (e) => {
                  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                    value.set(current + e.key)
                  }
                },
              },
              [],
            ),
          ],
        )
      },
      new TestRenderer(),
      { width: 240, height: 120 },
    )

    app.dispatch('onClick', 10, 10)
    tick.set(1)
    tick.set(2)
    app.dispatchKey('onKeyDown', { key: 'a', code: 'KeyA', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })
    app.dispatchKey('onKeyDown', { key: 'b', code: 'KeyB', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })

    expect(value.peek()).toBe('ab')
    app.destroy()
  })

  it('switches focus between controlled inputs without value crossover', async () => {
    const left = signal('')
    const right = signal('')

    const app = await createApp(
      () =>
        box(
          { width: 320, height: 120, flexDirection: 'row' },
          [
            box(
              {
                width: 140,
                height: 40,
                onKeyDown: (e) => {
                  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                    left.set(left.value + e.key)
                  }
                },
              },
              [],
            ),
            box({ width: 20, height: 40 }, []),
            box(
              {
                width: 140,
                height: 40,
                onKeyDown: (e) => {
                  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                    right.set(right.value + e.key)
                  }
                },
              },
              [],
            ),
          ],
        ),
      new TestRenderer(),
      { width: 320, height: 120 },
    )

    app.dispatch('onClick', 10, 10)
    app.dispatchKey('onKeyDown', { key: 'a', code: 'KeyA', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })
    app.dispatchKey('onKeyDown', { key: 'b', code: 'KeyB', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })

    app.dispatch('onClick', 190, 10)
    app.dispatchKey('onKeyDown', { key: 'x', code: 'KeyX', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })
    app.dispatchKey('onKeyDown', { key: 'y', code: 'KeyY', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })

    app.dispatch('onClick', 10, 10)
    app.dispatchKey('onKeyDown', { key: 'c', code: 'KeyC', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })

    expect(left.peek()).toBe('abc')
    expect(right.peek()).toBe('xy')
    app.destroy()
  })

  it('routes composition commits correctly across controlled rerenders', async () => {
    const value = signal('')

    const app = await createApp(
      () => {
        const current = value.value
        return box(
          { width: 240, height: 120 },
          [
            box(
              {
                width: 200,
                height: 40,
                onCompositionEnd: (e) => {
                  if (!e.data) return
                  value.set(current + e.data)
                },
              },
              [],
            ),
          ],
        )
      },
      new TestRenderer(),
      { width: 240, height: 120 },
    )

    app.dispatch('onClick', 10, 10)
    app.dispatchComposition('onCompositionStart', { data: '' })
    app.dispatchComposition('onCompositionUpdate', { data: 'に' })
    app.dispatchComposition('onCompositionEnd', { data: 'に' })
    app.dispatchComposition('onCompositionStart', { data: '' })
    app.dispatchComposition('onCompositionUpdate', { data: 'ほ' })
    app.dispatchComposition('onCompositionEnd', { data: 'ほ' })

    expect(value.peek()).toBe('にほ')
    app.destroy()
  })

  it('handles Enter and cross-line backspace boundary operations in controlled state', async () => {
    let state: TextInputState = {
      nodes: ['ab'],
      selection: { anchorNode: 0, anchorOffset: 2, focusNode: 0, focusOffset: 2 },
    }

    const app = await createApp(
      () =>
        box(
          { width: 260, height: 140 },
          [
            box(
              {
                width: 220,
                height: 60,
                onKeyDown: (e) => {
                  if (e.key === 'Enter') {
                    state = insertInputText(state, '\n')
                    return
                  }
                  if (e.key === 'ArrowLeft') {
                    state = moveInputCaret(state, 'left')
                    return
                  }
                  if (e.key === 'Backspace') {
                    state = backspaceInput(state)
                    return
                  }
                  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                    state = insertInputText(state, e.key)
                  }
                },
              },
              [],
            ),
          ],
        ),
      new TestRenderer(),
      { width: 260, height: 140 },
    )

    app.dispatch('onClick', 10, 10)
    app.dispatchKey('onKeyDown', { key: 'Enter', code: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })
    app.dispatchKey('onKeyDown', { key: 'c', code: 'KeyC', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })
    app.dispatchKey('onKeyDown', { key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })
    app.dispatchKey('onKeyDown', { key: 'Backspace', code: 'Backspace', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })

    expect(state.nodes).toEqual(['abc'])
    expect(state.selection).toEqual({ anchorNode: 0, anchorOffset: 2, focusNode: 0, focusOffset: 2 })
    app.destroy()
  })
})

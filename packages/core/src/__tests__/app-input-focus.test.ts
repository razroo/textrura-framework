import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from '../app.js'
import { box } from '../elements.js'
import { clearFocus } from '../focus.js'
import type { Renderer, UIElement } from '../types.js'

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
})

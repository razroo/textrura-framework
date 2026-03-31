import { describe, it, expect } from 'vitest'
import type { ComputedLayout } from 'textura'
import type { Renderer, UIElement } from '@geometra/core'
import { applyServerMessage } from '../client.js'

function layout(x = 0, y = 0, width = 100, height = 50): ComputedLayout {
  return { x, y, width, height, children: [] } as ComputedLayout
}

function tree(): UIElement {
  return {
    kind: 'box',
    props: {},
    children: [],
  }
}

function createRendererSpy() {
  const renders: Array<{ layout: ComputedLayout; tree: UIElement }> = []
  const renderer: Renderer = {
    render: (nextLayout, nextTree) => {
      renders.push({ layout: nextLayout, tree: nextTree })
    },
    destroy: () => {},
  }
  return { renderer, renders }
}

describe('applyServerMessage', () => {
  it('surfaces server errors and recovers on subsequent frame', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []

    applyServerMessage(state, renderer, { type: 'error', message: 'server exploded' }, (err) => {
      errors.push(String(err))
    })
    expect(errors[0]).toContain('server exploded')
    expect(renders.length).toBe(0)

    const nextLayout = layout(10, 20, 120, 40)
    const nextTree = tree()
    applyServerMessage(state, renderer, { type: 'frame', layout: nextLayout, tree: nextTree })

    expect(state.layout).toEqual(nextLayout)
    expect(state.tree).toEqual(nextTree)
    expect(renders.length).toBe(1)
  })

  it('surfaces protocol mismatch and ignores incompatible frame', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []

    applyServerMessage(
      state,
      renderer,
      { type: 'frame', layout: layout(), tree: tree(), protocolVersion: 999 },
      (err) => errors.push(String(err)),
    )

    expect(errors[0]).toContain('newer than client protocol')
    expect(state.layout).toBeNull()
    expect(renders.length).toBe(0)
  })
})

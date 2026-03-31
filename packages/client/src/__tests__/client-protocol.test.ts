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

  it('ignores delayed patch before first frame and recovers on frame', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }

    applyServerMessage(state, renderer, {
      type: 'patch',
      patches: [{ path: [], x: 99 }],
      protocolVersion: 1,
    })
    expect(state.layout).toBeNull()
    expect(renders.length).toBe(0)

    applyServerMessage(state, renderer, {
      type: 'frame',
      layout: layout(1, 2, 30, 40),
      tree: tree(),
      protocolVersion: 1,
    })
    expect(state.layout?.x).toBe(1)
    expect(renders.length).toBe(1)
  })

  it('handles duplicate frames idempotently and applies duplicate patches deterministically', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }

    const frame = {
      type: 'frame' as const,
      layout: layout(0, 0, 100, 50),
      tree: tree(),
      protocolVersion: 1,
    }
    applyServerMessage(state, renderer, frame)
    applyServerMessage(state, renderer, frame)
    expect(state.layout?.width).toBe(100)

    const patch = {
      type: 'patch' as const,
      patches: [{ path: [], width: 120 }],
      protocolVersion: 1,
    }
    applyServerMessage(state, renderer, patch)
    applyServerMessage(state, renderer, patch)

    expect(state.layout?.width).toBe(120)
    expect(renders.length).toBe(4)
  })

  it('emits frame metrics for frame and patch processing', () => {
    const { renderer } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const metrics: Array<{ messageType: string; decodeMs: number; applyMs: number; renderMs: number; patchCount?: number }> = []

    applyServerMessage(
      state,
      renderer,
      { type: 'frame', layout: layout(), tree: tree(), protocolVersion: 1 },
      undefined,
      (m) => metrics.push(m),
      { decodeMs: 0.25, encoding: 'json', bytesReceived: 10 },
    )
    applyServerMessage(
      state,
      renderer,
      { type: 'patch', patches: [{ path: [], width: 200 }], protocolVersion: 1 },
      undefined,
      (m) => metrics.push(m),
      { decodeMs: 0.1, encoding: 'binary', bytesReceived: 64 },
    )

    expect(metrics).toHaveLength(2)
    expect(metrics[0]?.messageType).toBe('frame')
    expect(metrics[0]?.decodeMs).toBe(0.25)
    expect(metrics[0]?.encoding).toBe('json')
    expect(metrics[0]?.bytesReceived).toBe(10)
    expect(metrics[0]?.renderMs).toBeGreaterThanOrEqual(0)
    expect(metrics[1]?.messageType).toBe('patch')
    expect(metrics[1]?.patchCount).toBe(1)
    expect(metrics[1]?.encoding).toBe('binary')
    expect(metrics[1]?.bytesReceived).toBe(64)
  })
})

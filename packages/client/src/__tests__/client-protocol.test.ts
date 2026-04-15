import { describe, it, expect } from 'vitest'
import type { ComputedLayout } from 'textura'
import type { Renderer, UIElement } from '@geometra/core'
import { applyServerMessage, type ClientFrameMetrics } from '../client.js'
import { GEOM_DATA_CHANNEL_TRACKER_SNAPSHOT } from '../data-channels.js'

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

  it('rejects server error payloads when protocolVersion is newer than client (protocol guard before onError)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const metrics: ClientFrameMetrics[] = []

    applyServerMessage(
      state,
      renderer,
      { type: 'error', message: 'server exploded', protocolVersion: 999 },
      e => errors.push(String(e)),
      m => metrics.push(m),
    )

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('newer than client protocol')
    expect(errors[0]).not.toContain('server exploded')
    expect(metrics).toHaveLength(0)
    expect(renders.length).toBe(0)
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

  it('accepts frame and patch when protocolVersion is omitted (optional on the wire)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []

    applyServerMessage(
      state,
      renderer,
      { type: 'frame', layout: layout(5, 6, 80, 90), tree: tree() },
      err => errors.push(String(err)),
    )
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(state.layout?.width).toBe(80)

    applyServerMessage(
      state,
      renderer,
      { type: 'patch', patches: [{ path: [], width: 77 }] },
      err => errors.push(String(err)),
    )
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(2)
    expect(state.layout?.width).toBe(77)
  })

  it('accepts patch dimensions as IEEE −0 (same non-negative rule as layoutBoundsAreFinite / server protocol)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const wNeg0 = -0
    const hNeg0 = -0
    expect(Object.is(wNeg0, 0)).toBe(false)

    applyServerMessage(
      state,
      renderer,
      { type: 'frame', layout: layout(0, 0, 100, 50), tree: tree(), protocolVersion: 1 },
      err => errors.push(String(err)),
    )
    expect(errors).toHaveLength(0)

    applyServerMessage(
      state,
      renderer,
      {
        type: 'patch',
        patches: [{ path: [], width: wNeg0, height: hNeg0 }],
        protocolVersion: 1,
      },
      err => errors.push(String(err)),
    )
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(2)
    expect(state.layout).not.toBeNull()
    expect(Object.is(state.layout!.width, -0)).toBe(true)
    expect(Object.is(state.layout!.height, -0)).toBe(true)
  })

  it('accepts finite protocolVersion at or below client (including 0 and negative)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []

    applyServerMessage(
      state,
      renderer,
      { type: 'frame', layout: layout(1, 2, 33, 44), tree: tree(), protocolVersion: 0 },
      err => errors.push(String(err)),
    )
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(state.layout?.width).toBe(33)

    applyServerMessage(
      state,
      renderer,
      { type: 'frame', layout: layout(0, 0, 55, 66), tree: tree(), protocolVersion: -42 },
      err => errors.push(String(err)),
    )
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(2)
    expect(state.layout?.width).toBe(55)
  })

  it('accepts fractional protocolVersion when still <= client cap (JSON number semantics)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []

    applyServerMessage(
      state,
      renderer,
      { type: 'frame', layout: layout(0, 0, 88, 77), tree: tree(), protocolVersion: 0.5 },
      err => errors.push(String(err)),
    )
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(state.layout?.width).toBe(88)
  })

  it('rejects fractional protocolVersion when above client cap (treated as newer wire revision)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []

    applyServerMessage(
      state,
      renderer,
      { type: 'frame', layout: layout(), tree: tree(), protocolVersion: 1.0001 },
      err => errors.push(String(err)),
    )
    expect(errors[0]).toContain('newer than client protocol')
    expect(state.layout).toBeNull()
    expect(renders).toHaveLength(0)
  })

  it('rejects non-finite protocolVersion on frame (fail closed; no render)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    applyServerMessage(
      state,
      renderer,
      { type: 'frame', layout: layout(), tree: tree(), protocolVersion: Number.NaN } as unknown as Msg,
      (err) => errors.push(String(err)),
    )
    expect(errors[0]).toContain('protocolVersion must be a finite number')
    expect(state.layout).toBeNull()
    expect(renders.length).toBe(0)

    applyServerMessage(
      state,
      renderer,
      {
        type: 'frame',
        layout: layout(),
        tree: tree(),
        protocolVersion: Number.POSITIVE_INFINITY,
      } as unknown as Msg,
      (err) => errors.push(String(err)),
    )
    expect(errors[1]).toContain('protocolVersion must be a finite number')
    expect(renders.length).toBe(0)
  })

  it('rejects protocolVersion when value is not a plain finite number (string, bigint, boxed Number)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    applyServerMessage(
      state,
      renderer,
      {
        type: 'frame',
        layout: layout(),
        tree: tree(),
        protocolVersion: '1',
      } as unknown as Msg,
      (err) => errors.push(String(err)),
    )
    expect(errors[0]).toContain('protocolVersion must be a finite number')
    expect(state.layout).toBeNull()
    expect(renders.length).toBe(0)

    applyServerMessage(
      state,
      renderer,
      {
        type: 'frame',
        layout: layout(),
        tree: tree(),
        protocolVersion: BigInt(1),
      } as unknown as Msg,
      (err) => errors.push(String(err)),
    )
    expect(errors[1]).toContain('protocolVersion must be a finite number')
    expect(renders.length).toBe(0)

    const boxed = Object(1)
    expect(typeof boxed).toBe('object')
    applyServerMessage(
      state,
      renderer,
      {
        type: 'frame',
        layout: layout(),
        tree: tree(),
        protocolVersion: boxed as unknown as number,
      } as unknown as Msg,
      (err) => errors.push(String(err)),
    )
    expect(errors[2]).toContain('protocolVersion must be a finite number')
    expect(renders.length).toBe(0)
  })

  it('surfaces protocol mismatch on patch and leaves layout untouched (no extra render)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []

    applyServerMessage(state, renderer, {
      type: 'frame',
      layout: layout(0, 0, 100, 50),
      tree: tree(),
      protocolVersion: 1,
    })
    expect(renders.length).toBe(1)

    const layoutBefore = state.layout
    applyServerMessage(
      state,
      renderer,
      {
        type: 'patch',
        patches: [{ path: [], width: 999 }],
        protocolVersion: 42,
      },
      (err) => errors.push(String(err)),
    )

    expect(errors[0]).toContain('newer than client protocol')
    expect(state.layout).toBe(layoutBefore)
    expect(state.layout?.width).toBe(100)
    expect(renders.length).toBe(1)
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

  it('re-renders on a well-formed patch with an empty patches array (no geometry mutation)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }

    applyServerMessage(state, renderer, {
      type: 'frame',
      layout: layout(0, 0, 100, 50),
      tree: tree(),
      protocolVersion: 1,
    })
    expect(renders).toHaveLength(1)

    applyServerMessage(state, renderer, {
      type: 'patch',
      patches: [],
      protocolVersion: 1,
    })
    expect(renders).toHaveLength(2)
    expect(state.layout?.width).toBe(100)
  })

  it('still emits onFrameMetrics for a patch before the first frame (no render, patchCount set)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const metrics: ClientFrameMetrics[] = []

    applyServerMessage(
      state,
      renderer,
      {
        type: 'patch',
        patches: [{ path: [], x: 1 }],
        protocolVersion: 1,
      },
      undefined,
      m => metrics.push(m),
    )

    expect(state.layout).toBeNull()
    expect(renders).toHaveLength(0)
    expect(metrics).toHaveLength(1)
    expect(metrics[0]?.messageType).toBe('patch')
    expect(metrics[0]?.patchCount).toBe(1)
    expect(metrics[0]?.renderMs).toBe(0)
  })

  it('applies patches along a path into nested layout nodes', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const deepLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      children: [
        {
          x: 1,
          y: 2,
          width: 10,
          height: 20,
          children: [{ x: 3, y: 4, width: 5, height: 6, children: [] }],
        },
      ],
    } as ComputedLayout

    applyServerMessage(state, renderer, {
      type: 'frame',
      layout: deepLayout,
      tree: tree(),
      protocolVersion: 1,
    })

    applyServerMessage(state, renderer, {
      type: 'patch',
      patches: [{ path: [0, 0], width: 99, height: 88 }],
      protocolVersion: 1,
    })

    expect(renders.length).toBe(2)
    const inner = state.layout!.children[0]!.children[0]!
    expect(inner.width).toBe(99)
    expect(inner.height).toBe(88)
    expect(state.layout!.children[0]!.width).toBe(10)
  })

  it('ignores patches when a path segment is missing', () => {
    const { renderer } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    applyServerMessage(state, renderer, {
      type: 'frame',
      layout: layout(0, 0, 100, 50),
      tree: tree(),
      protocolVersion: 1,
    })

    applyServerMessage(state, renderer, {
      type: 'patch',
      patches: [{ path: [99], x: 7, width: 200 }],
      protocolVersion: 1,
    })

    expect(state.layout!.x).toBe(0)
    expect(state.layout!.width).toBe(100)
  })

  it('ignores patches when an intermediate path exists but a deeper segment is missing', () => {
    const { renderer } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const deepLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      children: [{ x: 1, y: 2, width: 10, height: 20, children: [] }],
    } as ComputedLayout

    applyServerMessage(state, renderer, {
      type: 'frame',
      layout: deepLayout,
      tree: tree(),
      protocolVersion: 1,
    })

    applyServerMessage(state, renderer, {
      type: 'patch',
      patches: [{ path: [0, 5], x: 99, width: 55 }],
      protocolVersion: 1,
    })

    expect(state.layout!.x).toBe(0)
    expect(state.layout!.children[0]!.x).toBe(1)
    expect(state.layout!.children[0]!.width).toBe(10)
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

  it('emits onFrameMetrics for a well-formed server error (onError fires, no render)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const metrics: ClientFrameMetrics[] = []

    applyServerMessage(
      state,
      renderer,
      { type: 'error', message: 'rate limited', protocolVersion: 1 },
      (e) => errors.push(String(e)),
      (m) => metrics.push(m),
      { decodeMs: 0.5, encoding: 'json', bytesReceived: 48 },
    )

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('rate limited')
    expect(renders).toHaveLength(0)
    expect(metrics).toHaveLength(1)
    expect(metrics[0]?.messageType).toBe('error')
    expect(metrics[0]?.decodeMs).toBe(0.5)
    expect(metrics[0]?.encoding).toBe('json')
    expect(metrics[0]?.bytesReceived).toBe(48)
    expect(metrics[0]?.renderMs).toBe(0)
    expect(metrics[0]?.patchCount).toBeUndefined()
  })

  it('rejects non-object, incomplete frame, and bad patch shape without render or metrics', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const metrics: unknown[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    const onErr = (e: unknown) => errors.push(String(e))
    const onMetrics = () => metrics.push(1)

    applyServerMessage(state, renderer, null as unknown as Msg, onErr, onMetrics)
    expect(errors[0]).toContain('expected a JSON object')
    expect(renders).toHaveLength(0)
    expect(metrics).toHaveLength(0)

    applyServerMessage(state, renderer, [] as unknown as Msg, onErr, onMetrics)
    expect(errors[1]).toContain('expected a JSON object')
    expect(renders).toHaveLength(0)
    expect(metrics).toHaveLength(0)

    applyServerMessage(state, renderer, {} as unknown as Msg, onErr, onMetrics)
    expect(errors[2]).toContain('Invalid server message')
    expect(renders).toHaveLength(0)
    expect(metrics).toHaveLength(0)

    applyServerMessage(
      state,
      renderer,
      { type: 'frame', layout: layout(), protocolVersion: 1 } as unknown as Msg,
      onErr,
      onMetrics,
    )
    expect(errors[3]).toContain('Invalid server message')
    expect(renders).toHaveLength(0)
    expect(metrics).toHaveLength(0)

    applyServerMessage(
      state,
      renderer,
      { type: 'patch', patches: 'nope', protocolVersion: 1 } as unknown as Msg,
      onErr,
      onMetrics,
    )
    expect(errors[4]).toContain('Invalid server message')
    expect(renders).toHaveLength(0)
    expect(metrics).toHaveLength(0)

    applyServerMessage(
      state,
      renderer,
      { type: 'error', message: 1 as unknown as string, protocolVersion: 1 } as unknown as Msg,
      onErr,
      onMetrics,
    )
    expect(errors[5]).toContain('Invalid server message')
    expect(renders).toHaveLength(0)
    expect(metrics).toHaveLength(0)
  })

  it('rejects frame when root layout.children is missing or not an array, or tree is not a JSON-plain object', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const metrics: unknown[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]
    const onErr = (e: unknown) => errors.push(String(e))
    const onMetrics = () => metrics.push(1)

    const layoutNoChildren = { x: 0, y: 0, width: 10, height: 10 } as unknown as ComputedLayout
    const layoutChildrenObject = {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      children: {} as unknown as ComputedLayout[],
    } as unknown as ComputedLayout

    const layoutNullProto = Object.assign(Object.create(null), {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      children: [],
    }) as unknown as ComputedLayout
    const treeNullProto = Object.assign(Object.create(null), {
      kind: 'box',
      props: {},
      children: [],
    }) as unknown as UIElement

    const badFrames: Msg[] = [
      { type: 'frame', layout: null as unknown as ComputedLayout, tree: tree(), protocolVersion: 1 } as Msg,
      { type: 'frame', layout: layoutNoChildren, tree: tree(), protocolVersion: 1 } as Msg,
      { type: 'frame', layout: layoutChildrenObject, tree: tree(), protocolVersion: 1 } as Msg,
      { type: 'frame', layout: layoutNullProto, tree: tree(), protocolVersion: 1 } as Msg,
      { type: 'frame', layout: layout(), tree: treeNullProto, protocolVersion: 1 } as Msg,
      { type: 'frame', layout: layout(), tree: [] as unknown as UIElement, protocolVersion: 1 } as Msg,
      { type: 'frame', layout: layout(), tree: null as unknown as UIElement, protocolVersion: 1 } as Msg,
    ]

    for (const msg of badFrames) {
      applyServerMessage(state, renderer, msg, onErr, onMetrics)
    }

    expect(errors).toHaveLength(badFrames.length)
    for (const err of errors) {
      expect(err).toContain('Invalid server message')
    }
    expect(renders).toHaveLength(0)
    expect(metrics).toHaveLength(0)
    expect(state.layout).toBeNull()
  })

  it('rejects patch entries with bad path or geometry fields after a frame (no render, layout unchanged)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const metrics: unknown[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]
    const onErr = (e: unknown) => errors.push(String(e))
    const onMetrics = () => metrics.push(1)

    const initialLayout = layout(0, 0, 100, 50)
    const initialTree = tree()
    applyServerMessage(
      state,
      renderer,
      { type: 'frame', layout: initialLayout, tree: initialTree, protocolVersion: 1 },
      onErr,
      onMetrics,
    )
    expect(renders).toHaveLength(1)
    expect(metrics).toHaveLength(1)
    const layoutRef = state.layout

    const badPatches: Msg[] = [
      { type: 'patch', patches: [{}], protocolVersion: 1 } as unknown as Msg,
      { type: 'patch', patches: [{ path: null }], protocolVersion: 1 } as unknown as Msg,
      { type: 'patch', patches: [{ path: '0' }], protocolVersion: 1 } as unknown as Msg,
      { type: 'patch', patches: [{ path: [0, Number.NaN] }], protocolVersion: 1 } as unknown as Msg,
      { type: 'patch', patches: [{ path: [-1] }], protocolVersion: 1 } as unknown as Msg,
      { type: 'patch', patches: [{ path: [0.5] }], protocolVersion: 1 } as unknown as Msg,
      { type: 'patch', patches: [{ path: [], width: Number.NaN }], protocolVersion: 1 } as unknown as Msg,
      { type: 'patch', patches: [{ path: [], width: -1 }], protocolVersion: 1 } as unknown as Msg,
      { type: 'patch', patches: [{ path: [], height: -0.001 }], protocolVersion: 1 } as unknown as Msg,
      { type: 'patch', patches: [{ path: [], x: Number.POSITIVE_INFINITY }], protocolVersion: 1 } as unknown as Msg,
      {
        type: 'patch',
        patches: [{ path: [], y: BigInt(1) as unknown as number }],
        protocolVersion: 1,
      } as unknown as Msg,
      {
        type: 'patch',
        patches: [{ path: [], height: '10' as unknown as number }],
        protocolVersion: 1,
      } as unknown as Msg,
      {
        type: 'patch',
        patches: [Object.assign(Object.create(null), { path: [] })],
        protocolVersion: 1,
      } as unknown as Msg,
      { type: 'patch', patches: [[{ path: [] }]], protocolVersion: 1 } as unknown as Msg,
    ]

    for (const msg of badPatches) {
      applyServerMessage(state, renderer, msg, onErr, onMetrics)
    }

    expect(errors).toHaveLength(badPatches.length)
    for (const err of errors) {
      expect(err).toContain('Invalid server message')
    }
    expect(renders).toHaveLength(1)
    expect(metrics).toHaveLength(1)
    expect(state.layout).toBe(layoutRef)
    expect(state.layout?.width).toBe(100)
  })

  it('rejects frame when root layout bounds fail layoutBoundsAreFinite (no state, render, or metrics)', () => {
    type Msg = Parameters<typeof applyServerMessage>[2]
    const b = 1n as unknown as number
    const negSub = -Number.MIN_VALUE
    expect(negSub).toBeLessThan(0)
    const posOverflow = Number.parseFloat('1e400')
    expect(posOverflow).toBe(Infinity)
    const badLayouts = [
      { x: Number.NaN, y: 0, width: 10, height: 10, children: [] },
      { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 10, children: [] },
      { x: 0, y: Number.NEGATIVE_INFINITY, width: 10, height: 10, children: [] },
      { x: 0, y: 0, width: 10, height: -1, children: [] },
      { x: 0, y: 0, width: b, height: 10, children: [] },
      { x: 0, y: 0, width: negSub, height: 10, children: [] },
      { x: 0, y: 0, width: 10, height: '10' as unknown as number, children: [] },
      { x: Object(0) as unknown as number, y: 0, width: 10, height: 10, children: [] },
      { x: 0, y: 0, height: 10, children: [] },
      { x: 0, y: 0, width: 10, children: [] },
      { x: 0, y: 0, width: posOverflow, height: 10, children: [] },
    ] as unknown as ComputedLayout[]

    for (const badLayout of badLayouts) {
      const { renderer, renders } = createRendererSpy()
      const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
      const errors: string[] = []
      const metrics: ClientFrameMetrics[] = []

      applyServerMessage(
        state,
        renderer,
        { type: 'frame', layout: badLayout, tree: tree(), protocolVersion: 1 } as Msg,
        e => errors.push(String(e)),
        m => metrics.push(m),
      )

      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain('root layout')
      expect(renders).toHaveLength(0)
      expect(metrics).toHaveLength(0)
      expect(state.layout).toBeNull()
    }
  })

  it('recovers with a valid frame after a malformed JSON object message', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    applyServerMessage(state, renderer, { type: 'nope' } as unknown as Msg, e => errors.push(String(e)))
    expect(errors).toHaveLength(1)

    const nextLayout = layout(1, 2, 80, 90)
    const nextTree = tree()
    applyServerMessage(state, renderer, { type: 'frame', layout: nextLayout, tree: nextTree })

    expect(state.layout).toEqual(nextLayout)
    expect(renders).toHaveLength(1)
  })

  it('rejects non-string type discriminants without metrics (corrupt wire JSON)', () => {
    type Msg = Parameters<typeof applyServerMessage>[2]
    const bad = [
      { type: 1, layout: layout(), tree: tree(), protocolVersion: 1 },
      { type: true, layout: layout(), tree: tree(), protocolVersion: 1 },
      { type: [], layout: layout(), tree: tree(), protocolVersion: 1 },
      { type: {}, layout: layout(), tree: tree(), protocolVersion: 1 },
      { type: null, layout: layout(), tree: tree(), protocolVersion: 1 },
    ] as unknown as Msg[]

    for (const msg of bad) {
      const { renderer, renders } = createRendererSpy()
      const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
      const errors: string[] = []
      const metrics: ClientFrameMetrics[] = []

      applyServerMessage(state, renderer, msg, e => errors.push(String(e)), m => metrics.push(m))

      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain('Invalid server message')
      expect(errors[0]).toContain('expected type frame')
      expect(renders).toHaveLength(0)
      expect(metrics).toHaveLength(0)
      expect(state.layout).toBeNull()
    }
  })

  it('applies data messages via onData without rendering', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const dataCalls: Array<{ channel: string; payload: unknown }> = []
    const metrics: ClientFrameMetrics[] = []

    applyServerMessage(
      state,
      renderer,
      {
        type: 'data',
        channel: 'geom.tracker.snapshot',
        payload: { ok: true, nested: { x: 1 } },
        protocolVersion: 1,
      },
      undefined,
      m => metrics.push(m),
      { decodeMs: 0 },
      (ch, pl) => dataCalls.push({ channel: ch, payload: pl }),
    )

    expect(dataCalls).toEqual([{ channel: 'geom.tracker.snapshot', payload: { ok: true, nested: { x: 1 } } }])
    expect(renders).toHaveLength(0)
    expect(metrics).toHaveLength(1)
    expect(metrics[0]!.messageType).toBe('data')
    expect(metrics[0]!.renderMs).toBe(0)
  })

  it('rejects data messages when protocolVersion is newer than client (no onData, no metrics)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const dataCalls: unknown[] = []
    const metrics: ClientFrameMetrics[] = []

    applyServerMessage(
      state,
      renderer,
      {
        type: 'data',
        channel: 'geom.side',
        payload: { n: 1 },
        protocolVersion: 999,
      },
      e => errors.push(String(e)),
      m => metrics.push(m),
      { decodeMs: 0 },
      () => dataCalls.push(1),
    )

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('newer than client protocol')
    expect(dataCalls).toHaveLength(0)
    expect(metrics).toHaveLength(0)
    expect(renders).toHaveLength(0)
  })

  it('rejects data messages when protocolVersion is non-finite (no onData, no metrics)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const dataCalls: unknown[] = []
    const metrics: ClientFrameMetrics[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    applyServerMessage(
      state,
      renderer,
      {
        type: 'data',
        channel: 'geom.side',
        payload: {},
        protocolVersion: Number.NaN,
      } as unknown as Msg,
      e => errors.push(String(e)),
      m => metrics.push(m),
      { decodeMs: 0 },
      () => dataCalls.push(1),
    )

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('protocolVersion must be a finite number')
    expect(dataCalls).toHaveLength(0)
    expect(metrics).toHaveLength(0)
    expect(renders).toHaveLength(0)
  })

  it('accepts data messages with null, empty array, or primitive array payloads (JSON-serializable)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const dataCalls: Array<{ channel: string; payload: unknown }> = []
    const metrics: ClientFrameMetrics[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    const payloads: unknown[] = [null, [], [1, 2, 'x'], ['nested', [true, false]]]
    for (let i = 0; i < payloads.length; i++) {
      applyServerMessage(
        state,
        renderer,
        {
          type: 'data',
          channel: `geom.payload.shape.${i}`,
          payload: payloads[i],
          protocolVersion: 1,
        } as unknown as Msg,
        undefined,
        m => metrics.push(m),
        { decodeMs: 0 },
        (ch, pl) => dataCalls.push({ channel: ch, payload: pl }),
      )
    }

    expect(dataCalls).toEqual([
      { channel: 'geom.payload.shape.0', payload: null },
      { channel: 'geom.payload.shape.1', payload: [] },
      { channel: 'geom.payload.shape.2', payload: [1, 2, 'x'] },
      { channel: 'geom.payload.shape.3', payload: ['nested', [true, false]] },
    ])
    expect(renders).toHaveLength(0)
    expect(metrics).toHaveLength(payloads.length)
    expect(metrics.every(m => m.messageType === 'data' && m.renderMs === 0)).toBe(true)
  })

  it('rejects data with empty channel', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    applyServerMessage(
      state,
      renderer,
      { type: 'data', channel: '   ', payload: {} } as unknown as Msg,
      e => errors.push(String(e)),
    )

    expect(errors.length).toBeGreaterThan(0)
    expect(renders).toHaveLength(0)
  })

  it('rejects data with missing, empty, or non-string channel (no onData, no metrics)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const dataCalls: unknown[] = []
    const metrics: ClientFrameMetrics[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    const bad: Msg[] = [
      { type: 'data', payload: {} } as unknown as Msg,
      { type: 'data', channel: '', payload: {} } as unknown as Msg,
      { type: 'data', channel: null, payload: {} } as unknown as Msg,
      { type: 'data', channel: 1, payload: {} } as unknown as Msg,
    ]

    for (const msg of bad) {
      applyServerMessage(
        state,
        renderer,
        msg,
        e => errors.push(String(e)),
        m => metrics.push(m),
        { decodeMs: 0 },
        () => dataCalls.push(1),
      )
    }

    expect(errors).toHaveLength(bad.length)
    for (const err of errors) {
      expect(err).toContain('Invalid server message')
    }
    expect(dataCalls).toHaveLength(0)
    expect(metrics).toHaveLength(0)
    expect(renders).toHaveLength(0)
  })

  it('rejects data messages when payload is missing or undefined (no onData, no metrics)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const dataCalls: unknown[] = []
    const metrics: ClientFrameMetrics[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    const bad: Msg[] = [
      { type: 'data', channel: 'geom.missing' } as unknown as Msg,
      { type: 'data', channel: 'geom.explicit', payload: undefined } as unknown as Msg,
    ]

    for (const msg of bad) {
      applyServerMessage(
        state,
        renderer,
        msg,
        e => errors.push(String(e)),
        m => metrics.push(m),
        { decodeMs: 0 },
        () => dataCalls.push(1),
      )
    }

    expect(errors).toHaveLength(bad.length)
    for (const err of errors) {
      expect(err).toContain('Invalid server message')
    }
    expect(dataCalls).toHaveLength(0)
    expect(metrics).toHaveLength(0)
    expect(renders).toHaveLength(0)
  })

  it('accepts data when channel is non-empty after trim and passes the original string to onData', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const dataCalls: Array<{ channel: string; payload: unknown }> = []
    const metrics: ClientFrameMetrics[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    applyServerMessage(
      state,
      renderer,
      {
        type: 'data',
        channel: '  geom.padded  ',
        payload: { n: 1 },
        protocolVersion: 1,
      } as unknown as Msg,
      undefined,
      m => metrics.push(m),
      { decodeMs: 0 },
      (ch, pl) => dataCalls.push({ channel: ch, payload: pl }),
    )

    expect(dataCalls).toEqual([{ channel: '  geom.padded  ', payload: { n: 1 } }])
    expect(renders).toHaveLength(0)
    expect(metrics).toHaveLength(1)
    expect(metrics[0]!.messageType).toBe('data')
  })

  it('rejects data messages whose payload is not JSON-serializable plain data (no render, onData not called)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const dataCalls: unknown[] = []
    const metrics: ClientFrameMetrics[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    const badPayloads: unknown[] = [
      { nested: undefined },
      { d: new Date(0) },
      { m: new Map([['a', 1]]) },
      Object.create(null),
      { n: 1n },
      { nested: Object.assign(Object.create(null), { x: 1 }) },
      { boxedNum: Object(3) },
      { boxedStr: Object('x') },
      { r: /x/ },
      { e: new Error('x') },
      { u8: new Uint8Array([1, 2]) },
    ]

    for (const payload of badPayloads) {
      applyServerMessage(
        state,
        renderer,
        { type: 'data', channel: 'geom.test', payload, protocolVersion: 1 } as unknown as Msg,
        e => errors.push(String(e)),
        m => metrics.push(m),
        { decodeMs: 0 },
        () => dataCalls.push(payload),
      )
    }

    expect(errors).toHaveLength(badPayloads.length)
    for (const err of errors) {
      expect(err).toContain('Invalid server message')
    }
    expect(dataCalls).toHaveLength(0)
    expect(metrics).toHaveLength(0)
    expect(renders).toHaveLength(0)
  })

  it('rejects data messages with cyclic object or array payloads (no stack overflow; no onData)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const dataCalls: unknown[] = []
    const metrics: ClientFrameMetrics[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    const cyclicObject = { n: 1 } as Record<string, unknown>
    cyclicObject.self = cyclicObject

    const cyclicArray: unknown[] = []
    cyclicArray.push(cyclicArray)

    const cyclicMixed: Record<string, unknown> = { arr: [] as unknown[] }
    ;(cyclicMixed.arr as unknown[]).push(cyclicMixed)

    for (const payload of [cyclicObject, cyclicArray, cyclicMixed]) {
      applyServerMessage(
        state,
        renderer,
        { type: 'data', channel: 'geom.cycle', payload, protocolVersion: 1 } as unknown as Msg,
        e => errors.push(String(e)),
        m => metrics.push(m),
        { decodeMs: 0 },
        () => dataCalls.push(payload),
      )
    }

    expect(errors).toHaveLength(3)
    for (const err of errors) {
      expect(err).toContain('Invalid server message')
    }
    expect(dataCalls).toHaveLength(0)
    expect(metrics).toHaveLength(0)
    expect(renders).toHaveLength(0)
  })

  it('accepts data messages that reuse the same plain object under multiple keys (acyclic DAG)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const dataCalls: Array<{ channel: string; payload: unknown }> = []
    const metrics: ClientFrameMetrics[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    const shared = { x: 1 }
    const payload = { left: shared, right: shared }

    applyServerMessage(
      state,
      renderer,
      { type: 'data', channel: 'geom.shared', payload, protocolVersion: 1 } as unknown as Msg,
      undefined,
      m => metrics.push(m),
      { decodeMs: 0 },
      (ch, pl) => dataCalls.push({ channel: ch, payload: pl }),
    )

    expect(dataCalls).toEqual([{ channel: 'geom.shared', payload }])
    expect(metrics).toHaveLength(1)
    expect(metrics[0]!.messageType).toBe('data')
    expect(renders).toHaveLength(0)
  })

  it('rejects primitive decoded values (custom transport must pass a plain object; no metrics)', () => {
    const { renderer, renders } = createRendererSpy()
    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    const errors: string[] = []
    const metrics: ClientFrameMetrics[] = []
    type Msg = Parameters<typeof applyServerMessage>[2]

    const badValues: unknown[] = ['not-an-object', 0, true, false, undefined, 1n, Symbol('x')]

    for (const bad of badValues) {
      applyServerMessage(state, renderer, bad as Msg, e => errors.push(String(e)), m => metrics.push(m))
    }

    expect(errors).toHaveLength(badValues.length)
    for (const e of errors) {
      expect(e).toContain('expected a JSON object')
    }
    expect(metrics).toHaveLength(0)
    expect(renders).toHaveLength(0)
  })
})

describe('GEOM data channel ids', () => {
  it('keeps tracker snapshot channel stable for server/client and renderer-three re-exports', () => {
    expect(GEOM_DATA_CHANNEL_TRACKER_SNAPSHOT).toBe('geom.tracker.snapshot')
  })
})

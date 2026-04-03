import { afterEach, describe, expect, it } from 'vitest'
import type { Renderer, UIElement } from '@geometra/core'
import type { ComputedLayout } from 'textura'
import { createClient, type ClientFrameMetrics } from '../client.js'

/** Build a v1 GEOM binary envelope with UTF-8 JSON payload (matches server/client frame layout). */
function encodeGeomV1JsonPayload(json: string): ArrayBuffer {
  const payload = new TextEncoder().encode(json)
  const buf = new ArrayBuffer(9 + payload.byteLength)
  const u8 = new Uint8Array(buf)
  u8[0] = 0x47
  u8[1] = 0x45
  u8[2] = 0x4f
  u8[3] = 0x4d
  u8[4] = 1
  new DataView(buf).setUint32(5, payload.byteLength, true)
  u8.set(payload, 9)
  return buf
}

const origWebSocket = globalThis.WebSocket

function installMockWebSocket(sockets: Array<{ emit(type: string, event?: unknown): void }>) {
  class MockWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    readyState = MockWebSocket.OPEN
    private listeners = new Map<string, Array<(event?: unknown) => void>>()

    constructor(_url: string) {
      sockets.push(this)
      queueMicrotask(() => this.emit('open'))
    }

    addEventListener(type: string, cb: (event?: unknown) => void) {
      const current = this.listeners.get(type) ?? []
      current.push(cb)
      this.listeners.set(type, current)
    }

    send(_data: string) {}

    close() {
      this.readyState = MockWebSocket.CLOSED
    }

    emit(type: string, event: unknown = {}) {
      for (const cb of this.listeners.get(type) ?? []) cb(event)
    }
  }

  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
}

describe('createClient WebSocket message parse errors', () => {
  afterEach(() => {
    globalThis.WebSocket = origWebSocket
  })

  it('decodes JSON text frames when binaryFraming is true (mixed transport / negotiation fallback)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const metrics: ClientFrameMetrics[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
      onFrameMetrics: m => metrics.push(m),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const json = JSON.stringify({
      type: 'frame',
      layout: { x: 0, y: 0, width: 71, height: 72, children: [] },
      tree: { kind: 'box', props: {}, children: [] },
      protocolVersion: 1,
    })
    sockets[0]!.emit('message', { data: json })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(71)
    expect(metrics).toHaveLength(1)
    expect(metrics[0]?.encoding).toBe('json')
    expect(metrics[0]?.bytesReceived).toBe(new TextEncoder().encode(json).length)
  })

  it('decodes GEOM v1 binary frames when binaryFraming is disabled (non-string event.data still uses binary decode)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const buf = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 55, height: 66, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    sockets[0]!.emit('message', { data: buf })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(55)
  })

  it('reports onFrameMetrics.bytesReceived as the Uint8Array subview length for embedded binary frames', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const metrics: ClientFrameMetrics[] = []
    const renderer: Renderer = {
      render: () => {},
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
      onFrameMetrics: m => metrics.push(m),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const buf = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 1, height: 2, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    const frame = new Uint8Array(buf)
    const prefix = 19
    const combined = new Uint8Array(prefix + frame.byteLength + 11)
    combined.set(frame, prefix)
    const view = combined.subarray(prefix, prefix + frame.byteLength)

    sockets[0]!.emit('message', { data: view })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    expect(errors).toHaveLength(0)
    expect(metrics).toHaveLength(1)
    expect(metrics[0]?.encoding).toBe('binary')
    expect(metrics[0]?.bytesReceived).toBe(view.byteLength)
    expect(metrics[0]?.bytesReceived).toBeLessThan(combined.byteLength)
  })

  it('invokes onError when frame root layout fails layoutBoundsAreFinite, then accepts a valid frame', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: -1, height: 10, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('root layout')

    const validFrame = {
      type: 'frame',
      layout: { x: 0, y: 0, width: 50, height: 51, children: [] },
      tree: { kind: 'box', props: {}, children: [] } satisfies UIElement,
      protocolVersion: 1,
    }
    sockets[0]!.emit('message', { data: JSON.stringify(validFrame) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(50)
    expect(client.layout?.width).toBe(50)
  })

  it('invokes onError when frame root layout has NaN bounds, then accepts a valid frame', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: Number.NaN, height: 10, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('root layout')
    expect(renders).toHaveLength(0)
    expect(client.layout).toBeNull()

    const validFrame = {
      type: 'frame',
      layout: { x: 0, y: 0, width: 52, height: 53, children: [] },
      tree: { kind: 'box', props: {}, children: [] } satisfies UIElement,
      protocolVersion: 1,
    }
    sockets[0]!.emit('message', { data: JSON.stringify(validFrame) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(52)
    expect(client.layout?.width).toBe(52)
  })

  it('invokes onError when frame root layout overflows to non-finite numbers (JSON exponent), then accepts a valid frame', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', {
      data: '{"type":"frame","layout":{"x":0,"y":0,"width":1e309,"height":10,"children":[]},"tree":{"kind":"box","props":{},"children":[]},"protocolVersion":1}',
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('root layout')
    expect(renders).toHaveLength(0)
    expect(client.layout).toBeNull()

    const validFrame = {
      type: 'frame',
      layout: { x: 0, y: 0, width: 58, height: 59, children: [] },
      tree: { kind: 'box', props: {}, children: [] } satisfies UIElement,
      protocolVersion: 1,
    }
    sockets[0]!.emit('message', { data: JSON.stringify(validFrame) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(58)
    expect(client.layout?.width).toBe(58)
  })

  it('invokes onError when frame root layout has string bounds (JSON type confusion), then accepts a valid frame', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: '100', height: 10, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('root layout')
    expect(renders).toHaveLength(0)
    expect(client.layout).toBeNull()

    const validFrame = {
      type: 'frame',
      layout: { x: 0, y: 0, width: 54, height: 55, children: [] },
      tree: { kind: 'box', props: {}, children: [] } satisfies UIElement,
      protocolVersion: 1,
    }
    sockets[0]!.emit('message', { data: JSON.stringify(validFrame) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(54)
    expect(client.layout?.width).toBe(54)
  })

  it('invokes onError when frame root layout has boolean or null bounds (JSON type confusion), then accepts a valid frame', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: true, height: 10, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('root layout')
    expect(renders).toHaveLength(0)
    expect(client.layout).toBeNull()

    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 10, height: null, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(2)
    expect(errors[1]).toBeInstanceOf(Error)
    expect(String((errors[1] as Error).message)).toContain('root layout')
    expect(renders).toHaveLength(0)
    expect(client.layout).toBeNull()

    const validFrame = {
      type: 'frame',
      layout: { x: 0, y: 0, width: 56, height: 57, children: [] },
      tree: { kind: 'box', props: {}, children: [] } satisfies UIElement,
      protocolVersion: 1,
    }
    sockets[0]!.emit('message', { data: JSON.stringify(validFrame) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(56)
    expect(client.layout?.width).toBe(56)
  })

  it('invokes onError when JSON protocolVersion is newer than client, then accepts a valid frame', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 1, height: 1, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 999,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('newer than client protocol')
    expect(renders).toHaveLength(0)
    expect(client.layout).toBeNull()

    const validFrame = {
      type: 'frame',
      layout: { x: 0, y: 0, width: 50, height: 51, children: [] },
      tree: { kind: 'box', props: {}, children: [] } satisfies UIElement,
      protocolVersion: 1,
    }
    sockets[0]!.emit('message', { data: JSON.stringify(validFrame) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(50)
    expect(client.layout?.width).toBe(50)
  })

  it('invokes onError when binary payload protocolVersion is newer than client, then accepts a valid frame', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const tooNew = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 2, height: 3, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 999,
      }),
    )
    sockets[0]!.emit('message', { data: tooNew })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('newer than client protocol')
    expect(renders).toHaveLength(0)
    expect(client.layout).toBeNull()

    const valid = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 60, height: 61, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    sockets[0]!.emit('message', { data: valid })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(60)
    expect(client.layout?.width).toBe(60)
  })

  it('invokes onError for malformed patch messages (non-array patches or negative path index)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renderer: Renderer = {
      render: () => {},
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'patch',
        patches: { not: 'an array' },
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(String((errors[0] as Error).message)).toContain('patch')

    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'patch',
        patches: [{ path: [-1], width: 1 }],
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(2)
    expect(String((errors[1] as Error).message)).toContain('patch')
  })

  it('invokes onError when JSON parses but payload is not a well-formed GEOM v1 message', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renderer: Renderer = {
      render: () => {},
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', { data: '{}' })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('Invalid server message')
  })

  it('invokes onError when frame root layout.children is null (JSON null is not an array), then accepts a valid frame', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 1, height: 1, children: null },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('Invalid server message')
    expect(renders).toHaveLength(0)
    expect(client.layout).toBeNull()

    const validFrame = {
      type: 'frame',
      layout: { x: 0, y: 0, width: 48, height: 49, children: [] },
      tree: { kind: 'box', props: {}, children: [] } satisfies UIElement,
      protocolVersion: 1,
    }
    sockets[0]!.emit('message', { data: JSON.stringify(validFrame) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(48)
    expect(client.layout?.width).toBe(48)
  })

  it('invokes onError when type is frame but layout or tree shape is invalid (array layout/tree, non-array children)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renderer: Renderer = {
      render: () => {},
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: [],
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('frame')

    errors.length = 0
    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 1, height: 1, children: {} },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('frame')

    errors.length = 0
    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 1, height: 1, children: [] },
        tree: [],
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('frame')

    errors.length = 0
    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 1, height: 1 },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(String((errors[0] as Error).message)).toContain('frame')

    errors.length = 0
    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 1, height: 1, children: '[]' },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(String((errors[0] as Error).message)).toContain('frame')
  })

  it('invokes onError when type is error but message is not a string, then accepts a valid frame', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', {
      data: JSON.stringify({ type: 'error', message: 503, protocolVersion: 1 }),
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('Invalid server message')

    const validFrame = {
      type: 'frame',
      layout: { x: 0, y: 0, width: 31, height: 32, children: [] },
      tree: { kind: 'box', props: {}, children: [] } satisfies UIElement,
      protocolVersion: 1,
    }
    sockets[0]!.emit('message', { data: JSON.stringify(validFrame) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(31)
    expect(client.layout?.width).toBe(31)
  })

  it('invokes onError for JSON text null, primitives, and arrays without breaking the socket', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', { data: 'null' })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(String((errors[0] as Error).message)).toContain('expected a JSON object')

    sockets[0]!.emit('message', { data: 'true' })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(2)
    expect(String((errors[1] as Error).message)).toContain('expected a JSON object')

    sockets[0]!.emit('message', { data: '42' })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(3)
    expect(String((errors[2] as Error).message)).toContain('expected a JSON object')

    sockets[0]!.emit('message', { data: '"literal"' })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(4)
    expect(String((errors[3] as Error).message)).toContain('expected a JSON object')

    sockets[0]!.emit('message', { data: '[]' })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(5)
    expect(String((errors[4] as Error).message)).toMatch(/Invalid server message/)

    const validFrame = {
      type: 'frame',
      layout: { x: 0, y: 0, width: 20, height: 21, children: [] },
      tree: { kind: 'box', props: {}, children: [] } satisfies UIElement,
      protocolVersion: 1,
    }
    sockets[0]!.emit('message', { data: JSON.stringify(validFrame) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(20)
    expect(client.layout?.width).toBe(20)
  })

  it('invokes onError for invalid JSON text frames without breaking the socket', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renderer: Renderer = {
      render: () => {},
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(sockets).toHaveLength(1)

    sockets[0]!.emit('message', { data: '' })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(SyntaxError)

    sockets[0]!.emit('message', { data: '   \t\n  ' })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(2)
    expect(errors[1]).toBeInstanceOf(SyntaxError)

    sockets[0]!.emit('message', { data: '{ not json' })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(3)
    expect(errors[2]).toBeInstanceOf(SyntaxError)

    const validFrame = {
      type: 'frame',
      layout: { x: 0, y: 0, width: 10, height: 10, children: [] },
      tree: { kind: 'box', props: {}, children: [] } satisfies UIElement,
      protocolVersion: 1,
    }
    sockets[0]!.emit('message', { data: JSON.stringify(validFrame) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(3)
    expect(client.layout?.width).toBe(10)
  })

  it('invokes onError when binary envelope decodes but JSON.parse fails', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', { data: encodeGeomV1JsonPayload('{broken') })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(SyntaxError)

    const buf = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 1, y: 2, width: 30, height: 40, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    sockets[0]!.emit('message', { data: buf })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(30)
    expect(errors).toHaveLength(1)
  })

  it('invokes onError when binary envelope decodes to JSON null, primitives, or arrays (parity with text frames)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', { data: encodeGeomV1JsonPayload('null') })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(String((errors[0] as Error).message)).toContain('expected a JSON object')

    sockets[0]!.emit('message', { data: encodeGeomV1JsonPayload('true') })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(2)
    expect(String((errors[1] as Error).message)).toContain('expected a JSON object')

    sockets[0]!.emit('message', { data: encodeGeomV1JsonPayload('42') })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(3)
    expect(String((errors[2] as Error).message)).toContain('expected a JSON object')

    sockets[0]!.emit('message', { data: encodeGeomV1JsonPayload('"literal"') })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(4)
    expect(String((errors[3] as Error).message)).toContain('expected a JSON object')

    sockets[0]!.emit('message', { data: encodeGeomV1JsonPayload('[]') })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(5)
    expect(String((errors[4] as Error).message)).toMatch(/Invalid server message/)

    const validFrame = {
      type: 'frame',
      layout: { x: 0, y: 0, width: 20, height: 21, children: [] },
      tree: { kind: 'box', props: {}, children: [] } satisfies UIElement,
      protocolVersion: 1,
    }
    sockets[0]!.emit('message', { data: encodeGeomV1JsonPayload(JSON.stringify(validFrame)) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(20)
    expect(client.layout?.width).toBe(20)
  })

  it('invokes onError when binary frame declares zero-length payload (JSON.parse of empty string)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const emptyJsonPayload = new ArrayBuffer(9)
    const u8 = new Uint8Array(emptyJsonPayload)
    u8.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
    new DataView(emptyJsonPayload).setUint32(5, 0, true)

    sockets[0]!.emit('message', { data: emptyJsonPayload })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(SyntaxError)

    const valid = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 3, height: 4, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    sockets[0]!.emit('message', { data: valid })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(3)
    expect(client.layout?.width).toBe(3)
  })

  it('decodes GEOM v1 binary frames when event.data is a DataView into a larger backing buffer', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const frame = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 99, height: 11, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    const padded = new ArrayBuffer(frame.byteLength + 24)
    new Uint8Array(padded).set(new Uint8Array(frame), 8)
    const view = new DataView(padded, 8, frame.byteLength)

    sockets[0]!.emit('message', { data: view })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(99)
  })

  it('decodes GEOM v1 binary frames when event.data is a Uint8Array subarray into a larger backing buffer', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const frame = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 77, height: 88, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    const padded = new Uint8Array(frame.byteLength + 16)
    padded.set(new Uint8Array(frame), 12)
    const sub = padded.subarray(12, 12 + frame.byteLength)

    sockets[0]!.emit('message', { data: sub })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(77)
  })

  it('decodes GEOM v1 binary frames when event.data is a Uint8Array (ArrayBufferView mocks)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const buf = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 12, height: 34, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    sockets[0]!.emit('message', { data: new Uint8Array(buf) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(12)
  })

  it('decodes GEOM v1 binary frames when event.data is Int8Array (ArrayBufferView parity)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const buf = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 88, height: 99, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    sockets[0]!.emit('message', { data: new Int8Array(buf) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(88)
  })

  it('decodes GEOM v1 binary frames when event.data is Int32Array (4-byte element view)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const frame = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 91, height: 19, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    const alignedLen = Math.ceil(frame.byteLength / 4) * 4
    const aligned = new ArrayBuffer(alignedLen)
    new Uint8Array(aligned).set(new Uint8Array(frame))

    sockets[0]!.emit('message', { data: new Int32Array(aligned) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(91)
  })

  it('decodes GEOM v1 binary frames when event.data is Uint16Array (2-byte element view)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const frame = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 17, height: 18, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    const paddedLen = frame.byteLength % 2 === 0 ? frame.byteLength : frame.byteLength + 1
    const backing = new ArrayBuffer(paddedLen)
    new Uint8Array(backing).set(new Uint8Array(frame))

    sockets[0]!.emit('message', { data: new Uint16Array(backing) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(17)
  })

  it('decodes GEOM v1 binary frames when event.data is Uint8ClampedArray (ArrayBufferView parity)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const buf = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 33, height: 44, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    sockets[0]!.emit('message', { data: new Uint8ClampedArray(buf) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(33)
  })

  it('decodes GEOM v1 binary frames when event.data is Float64Array (8-byte aligned backing)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const frame = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 44, height: 55, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    const alignedLen = Math.ceil(frame.byteLength / 8) * 8
    const aligned = new ArrayBuffer(alignedLen)
    new Uint8Array(aligned).set(new Uint8Array(frame))

    sockets[0]!.emit('message', { data: new Float64Array(aligned) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(44)
  })

  it('decodes GEOM v1 binary frames when event.data is Float32Array (4-byte aligned backing)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const frame = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 61, height: 62, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    const alignedLen = Math.ceil(frame.byteLength / 4) * 4
    const aligned = new ArrayBuffer(alignedLen)
    new Uint8Array(aligned).set(new Uint8Array(frame))

    sockets[0]!.emit('message', { data: new Float32Array(aligned) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(61)
  })

  it('decodes GEOM v1 binary frames when event.data is BigInt64Array (8-byte element view)', async () => {
    if (typeof BigInt64Array === 'undefined') return

    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const frame = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 63, height: 64, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    const alignedLen = Math.ceil(frame.byteLength / 8) * 8
    const aligned = new ArrayBuffer(alignedLen)
    new Uint8Array(aligned).set(new Uint8Array(frame))

    sockets[0]!.emit('message', { data: new BigInt64Array(aligned) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(63)
  })

  it('decodes GEOM v1 binary frames when event.data is BigUint64Array (8-byte element view)', async () => {
    if (typeof BigUint64Array === 'undefined') return

    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const frame = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 65, height: 66, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    const alignedLen = Math.ceil(frame.byteLength / 8) * 8
    const aligned = new ArrayBuffer(alignedLen)
    new Uint8Array(aligned).set(new Uint8Array(frame))

    sockets[0]!.emit('message', { data: new BigUint64Array(aligned) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(65)
  })

  it('invokes onError when binary frame declares a payload longer than the buffer', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const buf = new ArrayBuffer(9)
    const u8 = new Uint8Array(buf)
    u8[0] = 0x47
    u8[1] = 0x45
    u8[2] = 0x4f
    u8[3] = 0x4d
    u8[4] = 1
    new DataView(buf).setUint32(5, 1, true)

    sockets[0]!.emit('message', { data: buf })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('Truncated')

    const valid = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 7, height: 8, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    sockets[0]!.emit('message', { data: valid })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(7)
    expect(errors).toHaveLength(1)
    expect(client.layout?.width).toBe(7)
  })

  it('invokes onError when binary frame declares uint32 max payload length (truncated), then accepts a valid frame', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const malicious = new ArrayBuffer(9)
    const u8 = new Uint8Array(malicious)
    u8.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
    new DataView(malicious).setUint32(5, 0xffff_ffff, true)

    sockets[0]!.emit('message', { data: malicious })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('Truncated')

    const valid = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 11, height: 12, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    sockets[0]!.emit('message', { data: valid })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(11)
    expect(errors).toHaveLength(1)
    expect(client.layout?.width).toBe(11)
  })

  it('invokes onError when binary event.data is a Blob (wrong binaryType / unexpected payload)', async () => {
    if (typeof Blob === 'undefined') return

    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renderer: Renderer = {
      render: () => {},
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', { data: new Blob(['x']) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toMatch(/binaryType/)
  })

  it('invokes onError when binary framing receives a non-buffer payload (not string, not ArrayBufferView)', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renderer: Renderer = {
      render: () => {},
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', { data: null })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toMatch(/arraybuffer/i)

    sockets[0]!.emit('message', { data: new Uint8Array([1, 2, 3]) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(2)
    expect(String((errors[1] as Error).message)).toContain('GEOM')
  })

  it('invokes onError when binary data is not a GEOM v1 frame', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renderer: Renderer = {
      render: () => {},
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    sockets[0]!.emit('message', { data: new ArrayBuffer(4) })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('GEOM')
  })

  it('invokes onError when GEOM magic matches but frame version byte is not v1', async () => {
    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renderer: Renderer = {
      render: () => {},
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const buf = encodeGeomV1JsonPayload('{}')
    new Uint8Array(buf)[4] = 2

    sockets[0]!.emit('message', { data: buf })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(String((errors[0] as Error).message)).toContain('GEOM')
  })

  it('decodes GEOM v1 binary frames when event.data is SharedArrayBuffer', async () => {
    if (typeof SharedArrayBuffer === 'undefined') return

    const sockets: Array<{ emit(type: string, event?: unknown): void }> = []
    installMockWebSocket(sockets)

    const errors: unknown[] = []
    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      binaryFraming: true,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onError: err => errors.push(err),
    })

    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const frame = encodeGeomV1JsonPayload(
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 55, height: 66, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    )
    const sab = new SharedArrayBuffer(frame.byteLength)
    new Uint8Array(sab).set(new Uint8Array(frame))

    sockets[0]!.emit('message', { data: sab })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    expect(errors).toHaveLength(0)
    expect(renders).toHaveLength(1)
    expect(renders[0]?.width).toBe(55)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Renderer, UIElement } from '@geometra/core'
import type { ComputedLayout } from 'textura'
import { createClient, type ClientFrameMetrics } from '../client.js'

const origWebSocket = globalThis.WebSocket

/** Mirrors server v1 envelope layout (see `packages/server/src/binary-frame.ts`). */
function encodeBinaryFrameJsonV1(jsonUtf8: string): ArrayBuffer {
  const payload = new TextEncoder().encode(jsonUtf8)
  const out = new Uint8Array(9 + payload.length)
  out.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
  new DataView(out.buffer).setUint32(5, payload.length, true)
  out.set(payload, 9)
  return out.buffer
}

describe('client reconnect integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.WebSocket = origWebSocket
  })

  it('reconnects and resyncs state after server restart', async () => {
    class MockWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
      readyState = MockWebSocket.OPEN
      private listeners = new Map<string, Array<(event?: unknown) => void>>()

      constructor(_url: string) {
        sockets.push(this)
        setTimeout(() => this.emit('open'), 0)
      }

      addEventListener(type: string, cb: (event?: unknown) => void) {
        const current = this.listeners.get(type) ?? []
        current.push(cb)
        this.listeners.set(type, current)
      }

      removeEventListener(type: string, cb: (event?: unknown) => void) {
        const current = this.listeners.get(type) ?? []
        this.listeners.set(type, current.filter(fn => fn !== cb))
      }

      send(_data: string) {}

      close() {
        this.readyState = MockWebSocket.CLOSED
        this.emit('close')
      }

      emit(type: string, event: unknown = {}) {
        for (const cb of this.listeners.get(type) ?? []) cb(event)
      }
    }

    const sockets: MockWebSocket[] = []
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

    const renders: ComputedLayout[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout, _tree: UIElement) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: true,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
    })

    await vi.runAllTimersAsync()
    expect(sockets).toHaveLength(1)

    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 40, height: 20, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    expect(renders).toHaveLength(1)
    expect(client.layout?.width).toBe(40)

    sockets[0]!.close()

    await vi.advanceTimersByTimeAsync(1000)
    await vi.runAllTimersAsync()
    expect(sockets).toHaveLength(2)

    sockets[1]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 77, height: 33, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    expect(client.layout?.width).toBe(77)
    expect(client.layout?.height).toBe(33)
    expect(renders).toHaveLength(2)

    client.close()
  })

  it('reconnect decodes GEOM v1 binary frames on the new socket when binaryFraming is enabled', async () => {
    class MockWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
      readyState = MockWebSocket.OPEN
      private listeners = new Map<string, Array<(event?: unknown) => void>>()

      constructor(_url: string) {
        sockets.push(this)
        setTimeout(() => this.emit('open'), 0)
      }

      addEventListener(type: string, cb: (event?: unknown) => void) {
        const current = this.listeners.get(type) ?? []
        current.push(cb)
        this.listeners.set(type, current)
      }

      removeEventListener(type: string, cb: (event?: unknown) => void) {
        const current = this.listeners.get(type) ?? []
        this.listeners.set(type, current.filter(fn => fn !== cb))
      }

      send(_data: string) {}

      close() {
        this.readyState = MockWebSocket.CLOSED
        this.emit('close')
      }

      emit(type: string, event: unknown = {}) {
        for (const cb of this.listeners.get(type) ?? []) cb(event)
      }
    }

    const sockets: MockWebSocket[] = []
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

    const renders: ComputedLayout[] = []
    const metrics: ClientFrameMetrics[] = []
    const renderer: Renderer = {
      render: (layout: ComputedLayout, _tree: UIElement) => {
        renders.push({ ...layout, children: layout.children })
      },
      destroy: () => {},
    }

    const frameJson = (w: number, h: number) =>
      JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: w, height: h, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      })

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: true,
      binaryFraming: true,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onFrameMetrics: m => metrics.push(m),
    })

    await vi.runAllTimersAsync()
    expect(sockets).toHaveLength(1)

    sockets[0]!.emit('message', { data: encodeBinaryFrameJsonV1(frameJson(40, 20)) })
    await vi.runAllTimersAsync()
    expect(renders).toHaveLength(1)
    expect(client.layout?.width).toBe(40)
    expect(metrics).toHaveLength(1)
    expect(metrics[0]?.encoding).toBe('binary')

    sockets[0]!.close()
    await vi.advanceTimersByTimeAsync(1000)
    await vi.runAllTimersAsync()
    expect(sockets).toHaveLength(2)

    sockets[1]!.emit('message', { data: encodeBinaryFrameJsonV1(frameJson(88, 44)) })
    await vi.runAllTimersAsync()
    expect(client.layout?.width).toBe(88)
    expect(client.layout?.height).toBe(44)
    expect(renders).toHaveLength(2)
    expect(metrics).toHaveLength(2)
    expect(metrics[1]?.encoding).toBe('binary')

    client.close()
  })
})

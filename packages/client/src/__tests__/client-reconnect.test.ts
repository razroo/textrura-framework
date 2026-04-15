import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Renderer, UIElement } from '@geometra/core'
import type { ComputedLayout } from 'textura'
import { createClient, type ClientFrameMetrics } from '../client.js'
import { encodeBinaryFrameJson } from '../binary-frame.js'

const origWebSocket = globalThis.WebSocket

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

  it('close() is idempotent (renderer.destroy runs once; no double cleanup)', async () => {
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
        this.emit('close', { code: 1000 })
      }

      emit(type: string, event: unknown = {}) {
        for (const cb of this.listeners.get(type) ?? []) cb(event)
      }
    }

    const sockets: MockWebSocket[] = []
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

    const destroy = vi.fn()
    const renderer: Renderer = {
      render: () => {},
      destroy,
    }

    const client = createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: false,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
    })

    await vi.runAllTimersAsync()
    expect(sockets).toHaveLength(1)

    client.close()
    client.close()
    client.close()

    expect(destroy).toHaveBeenCalledTimes(1)
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

    sockets[0]!.emit('message', { data: encodeBinaryFrameJson(frameJson(40, 20)) })
    await vi.runAllTimersAsync()
    expect(renders).toHaveLength(1)
    expect(client.layout?.width).toBe(40)
    expect(metrics).toHaveLength(1)
    expect(metrics[0]?.encoding).toBe('binary')

    sockets[0]!.close()
    await vi.advanceTimersByTimeAsync(1000)
    await vi.runAllTimersAsync()
    expect(sockets).toHaveLength(2)

    sockets[1]!.emit('message', { data: encodeBinaryFrameJson(frameJson(88, 44)) })
    await vi.runAllTimersAsync()
    expect(client.layout?.width).toBe(88)
    expect(client.layout?.height).toBe(44)
    expect(renders).toHaveLength(2)
    expect(metrics).toHaveLength(2)
    expect(metrics[1]?.encoding).toBe('binary')

    client.close()
  })
})

describe('createClient WebSocket binary decode failures', () => {
  afterEach(() => {
    globalThis.WebSocket = origWebSocket
  })

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

  it('invokes onError when a binary message is not a GEOM v1 envelope', async () => {
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
    sockets[0]!.emit('message', { data: new Uint8Array([0x01, 0x02, 0x03]).buffer })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect((errors[0] as Error).message).toContain('Not a GEOM binary frame')
  })

  it('invokes onError when a GEOM v1 binary frame declares a payload longer than the buffer', async () => {
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

    const headerOnly = new Uint8Array(9)
    headerOnly.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
    new DataView(headerOnly.buffer).setUint32(5, 64, true)
    sockets[0]!.emit('message', { data: headerOnly.buffer })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect((errors[0] as Error).message).toContain('Truncated binary frame payload')
  })
})

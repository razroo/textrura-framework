import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Renderer, UIElement } from '@geometra/core'
import type { ComputedLayout } from 'textura'
import { createClient } from '../client.js'

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
})

import { describe, it, expect } from 'vitest'
import type { Renderer, UIElement } from '@geometra/core'
import type { ComputedLayout } from 'textura'
import { createClient } from '../client.js'

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

describe('client reconnect integration', () => {
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
    ;(globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket as unknown

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

    await waitFor(() => sockets.length === 1, 2000, 'first socket')
    sockets[0]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 40, height: 20, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    await waitFor(() => renders.length > 0, 4000, 'initial frame')
    expect(client.layout?.width).toBe(40)

    sockets[0]!.close()

    await waitFor(() => sockets.length === 2, 4000, 'reconnect socket')
    sockets[1]!.emit('message', {
      data: JSON.stringify({
        type: 'frame',
        layout: { x: 0, y: 0, width: 77, height: 33, children: [] },
        tree: { kind: 'box', props: {}, children: [] },
        protocolVersion: 1,
      }),
    })
    await waitFor(() => client.layout?.width === 77 && client.layout?.height === 33, 6000, 'reconnect resync frame')

    client.close()
  }, 20000)
})

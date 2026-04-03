import { describe, it, expect, vi } from 'vitest'
import type { Renderer, UIElement } from '@geometra/core'
import type { ComputedLayout } from 'textura'
import { createClient } from '../client.js'

describe('client auth close (4001)', () => {
  it('does not reconnect and invokes onClose when server rejects auth', async () => {
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

      removeEventListener(_type: string, _cb: (event?: unknown) => void) {}

      send(_data: string) {}

      close() {
        this.readyState = MockWebSocket.CLOSED
        this.emit('close', { code: 4001, reason: '' })
      }

      emit(type: string, event: unknown = {}) {
        for (const cb of this.listeners.get(type) ?? []) cb(event)
      }
    }

    const sockets: MockWebSocket[] = []
    ;(globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket as unknown

    const onClose = vi.fn()
    const renderer: Renderer = {
      render: (_layout: ComputedLayout, _tree: UIElement) => {},
      destroy: () => {},
    }

    createClient({
      url: 'ws://mock.test',
      renderer,
      reconnect: true,
      forwardKeyboard: false,
      forwardComposition: false,
      forwardResize: false,
      keyboardTarget: {} as Document,
      onClose,
    })

    await new Promise(resolve => setTimeout(resolve, 30))
    expect(sockets.length).toBe(1)
    sockets[0]!.close()

    await new Promise(resolve => setTimeout(resolve, 500))
    expect(sockets.length).toBe(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect((onClose.mock.calls[0]![0] as { code: number }).code).toBe(4001)
  })
})

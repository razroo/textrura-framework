import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'

const mockState = vi.hoisted(() => ({
  startEmbeddedGeometraProxy: vi.fn(),
  spawnGeometraProxy: vi.fn(),
}))

vi.mock('../proxy-spawn.js', () => ({
  startEmbeddedGeometraProxy: mockState.startEmbeddedGeometraProxy,
  spawnGeometraProxy: mockState.spawnGeometraProxy,
}))

const { connectThroughProxy, disconnect } = await import('../session.js')

function frame(pageUrl: string) {
  return {
    type: 'frame',
    layout: { x: 0, y: 0, width: 1280, height: 720, children: [] },
    tree: {
      kind: 'box',
      props: {},
      semantic: {
        tag: 'body',
        role: 'group',
        pageUrl,
      },
      children: [],
    },
  }
}

async function createProxyPeer(options?: {
  pageUrl: string
  onNavigate?: (ws: WebSocket, msg: { requestId?: string; url?: string }) => void
}) {
  const wss = new WebSocketServer({ port: 0 })
  wss.on('connection', ws => {
    ws.send(JSON.stringify(frame(options?.pageUrl ?? 'https://jobs.example.com/original')))

    ws.on('message', raw => {
      const msg = JSON.parse(String(raw)) as { type?: string; requestId?: string; url?: string }
      if (msg.type === 'navigate') {
        options?.onNavigate?.(ws, msg)
      }
    })
  })

  const port = await new Promise<number>((resolve, reject) => {
    wss.once('listening', () => {
      const address = wss.address()
      if (typeof address === 'object' && address) resolve(address.port)
      else reject(new Error('Failed to resolve ephemeral WebSocket port'))
    })
    wss.once('error', reject)
  })

  return {
    wss,
    wsUrl: `ws://127.0.0.1:${port}`,
  }
}

afterEach(async () => {
  disconnect({ closeProxy: true })
  vi.clearAllMocks()
})

async function closePeer(wss: WebSocketServer): Promise<void> {
  for (const client of wss.clients) {
    client.close()
  }
  await new Promise<void>((resolve, reject) => wss.close(err => (err ? reject(err) : resolve())))
}

describe('connectThroughProxy recovery', () => {
  it('restarts from a fresh proxy when a reused browser session was already closed', async () => {
    const stalePeer = await createProxyPeer({
      pageUrl: 'https://jobs.example.com/original',
      onNavigate(ws, msg) {
        ws.send(JSON.stringify({
          type: 'error',
          requestId: msg.requestId,
          message: 'page.goto: Target page, context or browser has been closed',
        }))
      },
    })
    const freshPeer = await createProxyPeer({
      pageUrl: 'https://jobs.example.com/recovered',
    })

    const staleRuntime = {
      wsUrl: stalePeer.wsUrl,
      closed: false,
      close: vi.fn(async () => {
        staleRuntime.closed = true
      }),
    }
    const freshRuntime = {
      wsUrl: freshPeer.wsUrl,
      closed: false,
      close: vi.fn(async () => {
        freshRuntime.closed = true
      }),
    }

    mockState.startEmbeddedGeometraProxy
      .mockResolvedValueOnce({ runtime: staleRuntime, wsUrl: stalePeer.wsUrl })
      .mockResolvedValueOnce({ runtime: freshRuntime, wsUrl: freshPeer.wsUrl })
    mockState.spawnGeometraProxy.mockRejectedValue(new Error('spawn fallback should not be used'))

    try {
      const firstSession = await connectThroughProxy({
        pageUrl: 'https://jobs.example.com/original',
        headless: true,
      })
      expect(firstSession.proxyRuntime).toBe(staleRuntime)

      const recoveredSession = await connectThroughProxy({
        pageUrl: 'https://jobs.example.com/recovered',
        headless: true,
      })

      expect(recoveredSession.proxyRuntime).toBe(freshRuntime)
      expect(mockState.startEmbeddedGeometraProxy).toHaveBeenCalledTimes(2)
      expect(staleRuntime.close).toHaveBeenCalledTimes(1)
      expect(mockState.spawnGeometraProxy).not.toHaveBeenCalled()
    } finally {
      disconnect({ closeProxy: true })
      await closePeer(stalePeer.wss)
      await closePeer(freshPeer.wss)
    }
  })
})

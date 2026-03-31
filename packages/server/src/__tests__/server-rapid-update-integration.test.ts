import { describe, it, expect } from 'vitest'
import WebSocket from 'ws'
import { box, signal } from '@geometra/core'
import type { ComputedLayout } from 'textura'
import type { UIElement } from '@geometra/core'
import { createServer } from '../server.js'

function pickPort(): number {
  return 42000 + Math.floor(Math.random() * 2000)
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

/** Mirrors client patch application for replay-only tests (no renderer). */
function applyPatches(
  layout: ComputedLayout,
  patches: Array<{ path: number[]; x?: number; y?: number; width?: number; height?: number }>,
): void {
  for (const patch of patches) {
    let node = layout
    for (const idx of patch.path) {
      const child = node.children[idx]
      if (!child) break
      node = child
    }
    if (patch.x !== undefined) node.x = patch.x
    if (patch.y !== undefined) node.y = patch.y
    if (patch.width !== undefined) node.width = patch.width
    if (patch.height !== undefined) node.height = patch.height
  }
}

function replayJsonMessages(
  rawMessages: string[],
  state: { layout: ComputedLayout | null; tree: UIElement | null },
): void {
  for (const raw of rawMessages) {
    const msg = JSON.parse(raw) as {
      type: string
      layout?: ComputedLayout
      tree?: UIElement
      patches?: Array<{ path: number[]; x?: number; y?: number; width?: number; height?: number }>
    }
    if (msg.type === 'frame' && msg.layout && msg.tree) {
      state.layout = msg.layout
      state.tree = msg.tree
    } else if (msg.type === 'patch' && state.layout && msg.patches) {
      applyPatches(state.layout, msg.patches)
    }
  }
}

describe('server transport integration (1.4)', () => {
  it('preserves final geometry after a burst of synchronous server.update() calls', async () => {
    const port = pickPort()
    const bump = signal(0)
    const server = await createServer(
      () => box({ width: 800 + bump.value, height: 600, padding: bump.value % 7 }, []),
      { port, width: 400, height: 300 },
    )

    const rawMessages: string[] = []

    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`)
      const t = setTimeout(() => reject(new Error('open timeout')), 8000)
      socket.on('message', (data) => {
        rawMessages.push(String(data))
      })
      socket.on('open', () => {
        clearTimeout(t)
        resolve(socket)
      })
      socket.on('error', (e) => {
        clearTimeout(t)
        reject(e)
      })
    })

    await waitFor(() => rawMessages.length >= 1, 6000, 'initial frame')

    const burst = 55
    for (let i = 1; i <= burst; i++) {
      bump.set(i)
      server.update()
    }

    await waitFor(() => rawMessages.length >= 1 + burst, 10000, 'patch stream')

    const state = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    replayJsonMessages(rawMessages, state)

    expect(state.layout?.width).toBe(800 + bump.value)
    expect(state.layout?.height).toBe(600)

    ws.close()
    server.close()
  }, 25000)

  it('sends a fresh full frame to a new client after the previous client disconnected (resync)', async () => {
    const port = pickPort()
    const bump = signal(0)
    const server = await createServer(
      () => box({ width: 900 + bump.value, height: 400 }, []),
      { port, width: 200, height: 150 },
    )

    const firstClientMsgs: string[] = []
    const ws1 = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`)
      const t = setTimeout(() => reject(new Error('open timeout')), 8000)
      socket.on('message', (data) => {
        firstClientMsgs.push(String(data))
      })
      socket.on('open', () => {
        clearTimeout(t)
        resolve(socket)
      })
      socket.on('error', (e) => {
        clearTimeout(t)
        reject(e)
      })
    })

    await waitFor(() => firstClientMsgs.length >= 1, 6000, 'first frame')
    const s1 = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    replayJsonMessages(firstClientMsgs, s1)
    expect(s1.layout?.width).toBe(900)

    ws1.close()
    await new Promise<void>(resolve => setTimeout(resolve, 150))

    bump.set(23)
    server.update()

    const secondClientMsgs: string[] = []
    const ws2 = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`)
      const t = setTimeout(() => reject(new Error('open timeout')), 8000)
      socket.on('message', (data) => {
        secondClientMsgs.push(String(data))
      })
      socket.on('open', () => {
        clearTimeout(t)
        resolve(socket)
      })
      socket.on('error', (e) => {
        clearTimeout(t)
        reject(e)
      })
    })

    await waitFor(() => secondClientMsgs.length >= 1, 6000, 'reconnect frame')
    const s2 = { layout: null as ComputedLayout | null, tree: null as UIElement | null }
    replayJsonMessages(secondClientMsgs, s2)
    expect(s2.layout?.width).toBe(900 + 23)

    ws2.close()
    server.close()
  }, 25000)
})

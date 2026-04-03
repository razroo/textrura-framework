import { describe, it, expect } from 'vitest'
import WebSocket from 'ws'
import { box } from '@geometra/core'
import { createServer } from '../server.js'

function pickPort(): number {
  return 43000 + Math.floor(Math.random() * 2000)
}

describe('server broadcastData', () => {
  it('sends data frames to connected clients', async () => {
    const port = pickPort()
    const server = await createServer(() => box({ width: 40, height: 20 }, []), {
      port,
      width: 200,
      height: 100,
    })

    const received: unknown[] = []
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      const timeout = setTimeout(() => reject(new Error('timed out')), 8000)

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as { type: string; channel?: string; payload?: unknown }
        received.push(msg)
        if (msg.type === 'data' && msg.channel === 'geom.test') {
          clearTimeout(timeout)
          ws.close()
        }
      })

      ws.on('open', () => {
        server.broadcastData('geom.test', { hello: 'world' })
      })

      ws.on('close', () => resolve())
      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    }).finally(() => {
      server.close()
    })

    const data = received.find(
      (m): m is { type: 'data'; channel: string; payload: unknown } =>
        typeof m === 'object' && m !== null && (m as { type?: string }).type === 'data',
    )
    expect(data).toBeDefined()
    expect(data!.channel).toBe('geom.test')
    expect(data!.payload).toEqual({ hello: 'world' })
  })
})

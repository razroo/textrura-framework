import http from 'node:http'
import { describe, it, expect } from 'vitest'
import WebSocket from 'ws'
import { box } from '@geometra/core'
import { createServer, DEFAULT_GEOMETRA_WS_PATH } from '../server.js'

function pickPort(): number {
  return 42000 + Math.floor(Math.random() * 2000)
}

describe('createServer http attach', () => {
  it('accepts WebSocket upgrades on wsPath when bound to http.Server', async () => {
    const port = pickPort()
    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('http-ok')
    })

    await new Promise<void>((resolve, reject) => {
      httpServer.listen(port, () => resolve())
      httpServer.on('error', reject)
    })

    const geometra = await createServer(() => box({ width: 40, height: 20 }, []), {
      httpServer,
      wsPath: DEFAULT_GEOMETRA_WS_PATH,
      width: 200,
      height: 100,
    })

    const httpBody = await new Promise<string>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        res.on('error', reject)
      }).on('error', reject)
    })
    expect(httpBody).toBe('http-ok')

    const frame = await new Promise<{ type: string }>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}${DEFAULT_GEOMETRA_WS_PATH}`)
      const t = setTimeout(() => reject(new Error('ws timeout')), 5000)
      ws.on('message', (raw) => {
        clearTimeout(t)
        resolve(JSON.parse(String(raw)) as { type: string })
        ws.close()
      })
      ws.on('error', (e) => {
        clearTimeout(t)
        reject(e)
      })
    })

    expect(frame.type).toBe('frame')

    geometra.close()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  it('honors a custom wsPath', async () => {
    const port = pickPort()
    const customPath = '/custom-ws'
    const httpServer = http.createServer()

    await new Promise<void>((resolve, reject) => {
      httpServer.listen(port, () => resolve())
      httpServer.on('error', reject)
    })

    const geometra = await createServer(() => box({ width: 10, height: 10 }, []), {
      httpServer,
      wsPath: customPath,
      width: 100,
      height: 100,
    })

    const frame = await new Promise<{ type: string }>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}${customPath}`)
      const t = setTimeout(() => reject(new Error('ws timeout')), 5000)
      ws.on('message', (raw) => {
        clearTimeout(t)
        resolve(JSON.parse(String(raw)) as { type: string })
        ws.close()
      })
      ws.on('error', (e) => {
        clearTimeout(t)
        reject(e)
      })
    })

    expect(frame.type).toBe('frame')

    geometra.close()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  it('throws when both httpServer and port are passed', async () => {
    const httpServer = http.createServer()
    await expect(
      createServer(() => box({}, []), {
        httpServer,
        port: 5555,
        width: 50,
        height: 50,
      }),
    ).rejects.toThrow(/httpServer.*port/)
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })
})

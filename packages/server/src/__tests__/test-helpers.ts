import type { Server as HttpServer } from 'node:http'
import type { UIElement } from '@geometra/core'
import { createServer, type TexturaServer, type TexturaServerOptions } from '../server.js'

const TEST_PORT_BASE = 38000
const TEST_PORT_SPAN = 20000
const MAX_BIND_ATTEMPTS = 20

function pickPort(): number {
  return TEST_PORT_BASE + Math.floor(Math.random() * TEST_PORT_SPAN)
}

function isAddrInUse(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'EADDRINUSE'
}

export async function createStandaloneTestServer(
  view: () => UIElement,
  options: Omit<TexturaServerOptions, 'port' | 'httpServer'> = {},
): Promise<{ server: TexturaServer; port: number }> {
  for (let attempt = 0; attempt < MAX_BIND_ATTEMPTS; attempt++) {
    const port = pickPort()
    try {
      const server = await createServer(view, { ...options, port })
      return { server, port }
    } catch (err) {
      if (!isAddrInUse(err) || attempt === MAX_BIND_ATTEMPTS - 1) throw err
    }
  }

  throw new Error('Failed to bind standalone test server after repeated EADDRINUSE retries')
}

export async function listenHttpServer(httpServer: HttpServer): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (err: unknown) => {
      httpServer.off('listening', onListening)
      reject(err)
    }
    const onListening = () => {
      httpServer.off('error', onError)
      resolve()
    }
    httpServer.once('error', onError)
    httpServer.once('listening', onListening)
    httpServer.listen(0)
  })

  const address = httpServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected http test server to expose a numeric listening port')
  }
  return address.port
}

import http, { type Server as HttpServer } from 'node:http'
import type { UIElement } from '@geometra/core'
import { createServer, type TexturaServer, type TexturaServerOptions } from '../server.js'

export async function createStandaloneTestServer(
  view: () => UIElement,
  options: Omit<TexturaServerOptions, 'port' | 'httpServer'> = {},
): Promise<{ server: TexturaServer; port: number }> {
  const httpServer = http.createServer()
  const port = await listenHttpServer(httpServer)
  const geometra = await createServer(view, { ...options, httpServer, wsPath: '/' })
  const server: TexturaServer = {
    update: () => geometra.update(),
    broadcastData: (channel, payload) => geometra.broadcastData(channel, payload),
    close: () => {
      geometra.close()
      httpServer.close()
    },
  }
  return { server, port }
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

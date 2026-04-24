import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  AgentGateway,
  AgentGatewayActionRequest,
  AgentGatewayApprovalRequest,
  AgentGatewayFrameSnapshot,
} from '@geometra/core'

export interface AgentGatewayHttpOptions {
  gateway: AgentGateway
  cors?: boolean
  maxBodyBytes?: number
}

export interface AgentGatewayHttpServerOptions extends AgentGatewayHttpOptions {
  host?: string
  port?: number
}

export interface AgentGatewayHttpServer {
  server: http.Server
  url: string
  close(): Promise<void>
}

function latestFrame(gateway: AgentGateway): AgentGatewayFrameSnapshot | null {
  const frames = gateway.getReplay().frames
  return frames[frames.length - 1] ?? null
}

function sendJson(res: ServerResponse, status: number, body: unknown, cors: boolean): void {
  if (cors) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  }
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function sendError(res: ServerResponse, status: number, message: string, cors: boolean): void {
  sendJson(res, status, { error: message }, cors)
}

async function readJson(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.byteLength
    if (total > maxBodyBytes) {
      throw new Error(`request body exceeds ${maxBodyBytes} bytes`)
    }
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  return text.length === 0 ? {} : JSON.parse(text)
}

function routeNotFound(req: IncomingMessage, res: ServerResponse, cors: boolean): void {
  sendError(res, 404, `${req.method ?? 'GET'} ${req.url ?? '/'} is not a gateway endpoint`, cors)
}

export function createAgentGatewayHttpHandler(options: AgentGatewayHttpOptions) {
  const { gateway, cors = true, maxBodyBytes = 64 * 1024 } = options

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (req.method === 'OPTIONS') {
        sendJson(res, 204, null, cors)
        return
      }

      const url = new URL(req.url ?? '/', 'http://geometra.local')
      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true }, cors)
        return
      }
      if (req.method === 'GET' && url.pathname === '/frame') {
        sendJson(res, 200, { frame: latestFrame(gateway) }, cors)
        return
      }
      if (req.method === 'GET' && url.pathname === '/actions') {
        sendJson(
          res,
          200,
          {
            frame: latestFrame(gateway),
            actions: gateway.listActions(),
            pendingApprovals: gateway.getPendingApprovals(),
          },
          cors,
        )
        return
      }
      if (req.method === 'GET' && url.pathname === '/trace') {
        sendJson(res, 200, { trace: gateway.getTrace() }, cors)
        return
      }
      if (req.method === 'GET' && url.pathname === '/replay') {
        sendJson(res, 200, { replay: gateway.getReplay() }, cors)
        return
      }
      if (req.method === 'POST' && url.pathname === '/actions/request') {
        const body = await readJson(req, maxBodyBytes)
        const result = await gateway.requestAction(body as AgentGatewayActionRequest)
        sendJson(res, 200, { result, pendingApprovals: gateway.getPendingApprovals() }, cors)
        return
      }
      if (req.method === 'POST' && url.pathname === '/actions/approve') {
        const body = await readJson(req, maxBodyBytes)
        const result = await gateway.approveAction(body as AgentGatewayApprovalRequest)
        sendJson(res, 200, { result, pendingApprovals: gateway.getPendingApprovals() }, cors)
        return
      }

      routeNotFound(req, res, cors)
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : String(error), cors)
    }
  }
}

export async function createAgentGatewayHttpServer(
  options: AgentGatewayHttpServerOptions,
): Promise<AgentGatewayHttpServer> {
  const handler = createAgentGatewayHttpHandler(options)
  const server = http.createServer((req, res) => {
    void handler(req, res)
  })
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 0

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('gateway server did not bind to a TCP address')
  }

  return {
    server,
    url: `http://${host}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error)
          else resolve()
        })
      }),
  }
}

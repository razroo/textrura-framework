import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  AgentGateway,
  AgentGatewayActionRequest,
  AgentGatewayApprovalRequest,
  AgentGatewayFrameSnapshot,
} from '@geometra/core'
import type { AgentGatewayReplayStore } from './replay-store.js'

export { FileAgentGatewayReplayStore, MemoryAgentGatewayReplayStore } from './replay-store.js'
export type { AgentGatewayReplayStore, FileAgentGatewayReplayStoreOptions } from './replay-store.js'
export { createAgentGatewayToolAdapter } from './tools.js'
export type {
  AgentGatewayTool,
  AgentGatewayToolAdapter,
  AgentGatewayToolCallResult,
  AgentGatewayToolName,
} from './tools.js'

export type AgentGatewayHttpScope = 'read' | 'request' | 'approve' | 'admin'

export interface AgentGatewayHttpIdentity {
  tenantId: string
  subject?: string
  scopes?: AgentGatewayHttpScope[]
}

export interface AgentGatewayHttpAuthOptions {
  apiKeys: Record<string, AgentGatewayHttpIdentity>
  /** Header to read before falling back to Authorization: Bearer. Default: x-geometra-api-key. */
  headerName?: string
}

export interface AgentGatewayHttpOptions {
  gateway: AgentGateway
  cors?: boolean
  maxBodyBytes?: number
  auth?: AgentGatewayHttpAuthOptions
  replayStore?: AgentGatewayReplayStore
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
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-geometra-api-key')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  }
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function sendError(res: ServerResponse, status: number, message: string, cors: boolean): void {
  sendJson(res, status, { error: message }, cors)
}

function bearerToken(value: string | undefined): string | null {
  if (!value) return null
  const match = value.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

function scopeAllows(identity: AgentGatewayHttpIdentity, scope: AgentGatewayHttpScope): boolean {
  const scopes = identity.scopes ?? ['admin']
  return scopes.includes('admin') || scopes.includes(scope)
}

function authenticate(
  req: IncomingMessage,
  auth: AgentGatewayHttpAuthOptions | undefined,
): AgentGatewayHttpIdentity | null {
  if (!auth) return null
  const headerName = (auth.headerName ?? 'x-geometra-api-key').toLowerCase()
  const explicitKey = req.headers[headerName]
  const key =
    (Array.isArray(explicitKey) ? explicitKey[0] : explicitKey) ??
    bearerToken(Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization)
  if (!key) {
    throw Object.assign(new Error('missing gateway API key'), { statusCode: 401 })
  }
  const identity = auth.apiKeys[key]
  if (!identity) {
    throw Object.assign(new Error('invalid gateway API key'), { statusCode: 403 })
  }
  return identity
}

function requireScope(identity: AgentGatewayHttpIdentity | null, scope: AgentGatewayHttpScope): void {
  if (!identity) return
  if (!scopeAllows(identity, scope)) {
    throw Object.assign(new Error(`API key is missing "${scope}" scope`), { statusCode: 403 })
  }
}

function errorStatus(error: unknown): number {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const status = Number(error.statusCode)
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status
  }
  return 400
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
  const { gateway, cors = true, maxBodyBytes = 64 * 1024, auth, replayStore } = options

  const persistReplay = async (): Promise<void> => {
    await replayStore?.save(gateway.getReplay())
  }

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

      const identity = authenticate(req, auth)

      if (req.method === 'GET' && url.pathname === '/frame') {
        requireScope(identity, 'read')
        sendJson(res, 200, { tenant: identity?.tenantId, frame: latestFrame(gateway) }, cors)
        return
      }
      if (req.method === 'GET' && url.pathname === '/actions') {
        requireScope(identity, 'read')
        sendJson(
          res,
          200,
          {
            tenant: identity?.tenantId,
            frame: latestFrame(gateway),
            actions: gateway.listActions(),
            pendingApprovals: gateway.getPendingApprovals(),
          },
          cors,
        )
        return
      }
      if (req.method === 'GET' && url.pathname === '/trace') {
        requireScope(identity, 'read')
        sendJson(res, 200, { tenant: identity?.tenantId, trace: gateway.getTrace() }, cors)
        return
      }
      if (req.method === 'GET' && url.pathname === '/replay') {
        requireScope(identity, 'read')
        const requestedSessionId = url.searchParams.get('sessionId')
        if (requestedSessionId) {
          const currentReplay = gateway.getReplay()
          const replay =
            requestedSessionId === currentReplay.sessionId ? currentReplay : await replayStore?.load(requestedSessionId)
          sendJson(
            res,
            replay ? 200 : 404,
            replay ? { tenant: identity?.tenantId, replay } : { error: 'replay not found' },
            cors,
          )
          return
        }
        await persistReplay()
        sendJson(res, 200, { tenant: identity?.tenantId, replay: gateway.getReplay() }, cors)
        return
      }
      if (req.method === 'POST' && url.pathname === '/actions/request') {
        requireScope(identity, 'request')
        const body = await readJson(req, maxBodyBytes)
        const result = await gateway.requestAction(body as AgentGatewayActionRequest)
        await persistReplay()
        sendJson(res, 200, { tenant: identity?.tenantId, result, pendingApprovals: gateway.getPendingApprovals() }, cors)
        return
      }
      if (req.method === 'POST' && url.pathname === '/actions/approve') {
        requireScope(identity, 'approve')
        const body = await readJson(req, maxBodyBytes)
        const result = await gateway.approveAction(body as AgentGatewayApprovalRequest)
        await persistReplay()
        sendJson(res, 200, { tenant: identity?.tenantId, result, pendingApprovals: gateway.getPendingApprovals() }, cors)
        return
      }

      routeNotFound(req, res, cors)
    } catch (error) {
      sendError(res, errorStatus(error), error instanceof Error ? error.message : String(error), cors)
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

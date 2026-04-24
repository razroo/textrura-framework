import type { ComputedLayout } from 'textura'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  agentAction,
  box,
  createAgentGateway,
  createAgentGatewayPolicy,
  text,
  type AgentGateway,
} from '@geometra/core'
import { createAgentGatewayHttpServer, type AgentGatewayHttpServer } from '../index.js'
import { FileAgentGatewayReplayStore } from '../replay-store.js'

let server: AgentGatewayHttpServer | null = null
let tempDir: string | null = null

afterEach(async () => {
  if (server) {
    await server.close()
    server = null
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

function layout(): ComputedLayout {
  return {
    x: 0,
    y: 0,
    width: 240,
    height: 120,
    children: [{ x: 10, y: 10, width: 120, height: 32, children: [] }],
  }
}

function createClaimsGateway(): AgentGateway {
  const gateway = createAgentGateway({
    sessionId: 'claims-http',
    policy: createAgentGatewayPolicy({
      allowedActionIds: ['approve-payout'],
      allowExternalDestructiveByDefault: true,
    }),
    execute: () => ({ status: 'ok', auditId: 'CLM-1042-approve-payout' }),
  })
  gateway.setFrame(
    box({}, [
      text({
        text: 'Approve payout',
        font: '14px Inter',
        lineHeight: 18,
        semantic: agentAction({
          id: 'approve-payout',
          kind: 'approve',
          title: 'Approve payout',
          risk: 'write',
          requiresConfirmation: true,
        }),
      }),
    ]),
    layout(),
    { id: 'frame-1', route: '/claims' },
  )
  return gateway
}

async function json(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${server!.url}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  expect(response.ok).toBe(true)
  return response.json()
}

async function raw(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${server!.url}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
}

describe('agent gateway HTTP transport', () => {
  it('lists actions, requests approval, approves, and exposes replay', async () => {
    server = await createAgentGatewayHttpServer({ gateway: createClaimsGateway() })

    await expect(json('/actions')).resolves.toMatchObject({
      frame: { id: 'frame-1', route: '/claims' },
      actions: [{ id: 'approve-payout', requiresConfirmation: true }],
      pendingApprovals: [],
    })

    const request = await json('/actions/request', {
      method: 'POST',
      body: JSON.stringify({
        actionId: 'approve-payout',
        frameId: 'frame-1',
        input: { claimId: 'CLM-1042' },
      }),
    })
    expect(request).toMatchObject({
      result: {
        status: 'awaiting_approval',
        approvalId: 'claims-http:approval:1',
      },
      pendingApprovals: [{ id: 'claims-http:approval:1', actionId: 'approve-payout' }],
    })

    await expect(
      json('/actions/approve', {
        method: 'POST',
        body: JSON.stringify({ approvalId: 'claims-http:approval:1', actor: 'manager' }),
      }),
    ).resolves.toMatchObject({
      result: {
        status: 'completed',
        output: { status: 'ok', auditId: 'CLM-1042-approve-payout' },
      },
      pendingApprovals: [],
    })

    await expect(json('/trace')).resolves.toMatchObject({
      trace: {
        events: [
          { actionId: 'approve-payout', status: 'requested' },
          { actionId: 'approve-payout', status: 'approved', actor: 'manager' },
          { actionId: 'approve-payout', status: 'completed' },
        ],
      },
    })
    await expect(json('/replay')).resolves.toMatchObject({
      replay: {
        frames: [{ id: 'frame-1' }],
        actions: [{ actionId: 'approve-payout', status: 'completed' }],
      },
    })
    await expect(json('/replay?sessionId=claims-http')).resolves.toMatchObject({
      replay: {
        sessionId: 'claims-http',
        actions: [{ actionId: 'approve-payout', status: 'completed' }],
      },
    })
  })

  it('enforces API key scopes per tenant', async () => {
    server = await createAgentGatewayHttpServer({
      gateway: createClaimsGateway(),
      auth: {
        apiKeys: {
          'reader-key': { tenantId: 'tenant-a', subject: 'reader', scopes: ['read'] },
          'request-key': { tenantId: 'tenant-a', subject: 'agent', scopes: ['read', 'request'] },
        },
      },
    })

    await expect(raw('/actions')).resolves.toMatchObject({ status: 401 })
    await expect(raw('/actions', { headers: { 'x-geometra-api-key': 'reader-key' } })).resolves.toMatchObject({
      status: 200,
    })
    await expect(
      raw('/actions/request', {
        method: 'POST',
        headers: { 'x-geometra-api-key': 'reader-key' },
        body: JSON.stringify({ actionId: 'approve-payout', frameId: 'frame-1' }),
      }),
    ).resolves.toMatchObject({ status: 403 })

    const request = await raw('/actions/request', {
      method: 'POST',
      headers: { 'x-geometra-api-key': 'request-key' },
      body: JSON.stringify({ actionId: 'approve-payout', frameId: 'frame-1' }),
    })
    expect(request.status).toBe(200)
    await expect(request.json()).resolves.toMatchObject({
      tenant: 'tenant-a',
      result: { status: 'awaiting_approval' },
    })
  })

  it('allows browser preflight for gateway auth headers', async () => {
    server = await createAgentGatewayHttpServer({ gateway: createClaimsGateway() })

    const response = await raw('/actions/request', { method: 'OPTIONS' })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-headers')).toContain('x-geometra-api-key')
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization')
  })

  it('persists and reloads replay records', async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'geometra-gateway-'))
    const replayStore = new FileAgentGatewayReplayStore({ directory: tempDir })
    server = await createAgentGatewayHttpServer({ gateway: createClaimsGateway(), replayStore })

    await json('/actions/request', {
      method: 'POST',
      body: JSON.stringify({ actionId: 'approve-payout', frameId: 'frame-1' }),
    })
    const stored = await replayStore.load('claims-http')
    expect(stored).toMatchObject({
      sessionId: 'claims-http',
      actions: [{ actionId: 'approve-payout', status: 'awaiting_approval' }],
    })

    await expect(json('/replay?sessionId=claims-http')).resolves.toMatchObject({
      replay: {
        sessionId: 'claims-http',
        actions: [{ actionId: 'approve-payout' }],
      },
    })
  })
})

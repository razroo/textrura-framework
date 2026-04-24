import type { ComputedLayout } from 'textura'
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

let server: AgentGatewayHttpServer | null = null

afterEach(async () => {
  if (server) {
    await server.close()
    server = null
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
  })
})

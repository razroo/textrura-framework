#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  agentAction,
  box,
  createAgentGateway,
  createAgentGatewayPolicy,
  text,
} from '../packages/core/dist/index.js'
import {
  createAgentGatewayHttpServer,
} from '../packages/gateway/dist/index.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPLAY_DIR = path.join(ROOT, 'examples', 'replays')
const REPLAY_FILE = path.join(REPLAY_DIR, 'claims-review.json')
const TIMES = [
  '2026-04-25T09:30:00.000Z',
  '2026-04-25T09:30:01.000Z',
  '2026-04-25T09:30:02.000Z',
  '2026-04-25T09:30:03.000Z',
  '2026-04-25T09:30:04.000Z',
  '2026-04-25T09:30:05.000Z',
  '2026-04-25T09:30:06.000Z',
  '2026-04-25T09:30:07.000Z',
]

function clock() {
  let index = 0
  return () => TIMES[Math.min(index++, TIMES.length - 1)]
}

function layout() {
  return {
    x: 0,
    y: 0,
    width: 640,
    height: 360,
    children: [
      {
        x: 24,
        y: 24,
        width: 592,
        height: 96,
        children: [
          { x: 16, y: 16, width: 220, height: 24, children: [] },
          { x: 16, y: 52, width: 340, height: 20, children: [] },
        ],
      },
      { x: 24, y: 144, width: 160, height: 48, children: [{ x: 18, y: 14, width: 112, height: 18, children: [] }] },
      { x: 200, y: 144, width: 160, height: 48, children: [{ x: 18, y: 14, width: 112, height: 18, children: [] }] },
      { x: 376, y: 144, width: 160, height: 48, children: [{ x: 18, y: 14, width: 112, height: 18, children: [] }] },
    ],
  }
}

function createClaimsTree() {
  const approveContract = {
    id: 'approve-payout',
    kind: 'approve',
    title: 'Approve payout',
    description: 'Approve claim CLM-1042 for payment after human confirmation.',
    risk: 'write',
    requiresConfirmation: true,
    inputSchema: {
      type: 'object',
      properties: { claimId: { type: 'string' }, approver: { type: 'string' } },
      required: ['claimId', 'approver'],
    },
    postconditions: ['claim.status === "Approved"', 'auditId is present'],
    audit: { workflow: 'claims-review' },
  }

  return box({ semantic: { id: 'claims-review-surface', role: 'main', ariaLabel: 'Claims review surface' } }, [
    box({ semantic: { id: 'claim-card', role: 'region', ariaLabel: 'Claim CLM-1042' } }, [
      text({ text: 'CLM-1042 / Northstar Fabrication', font: '700 18px Inter', lineHeight: 24 }),
      text({ text: 'Ready for payout. Risk 0.21. Evidence validated.', font: '14px Inter', lineHeight: 20 }),
    ]),
    box({
      onClick: () => undefined,
      semantic: agentAction(approveContract, { role: 'button', ariaLabel: 'Approve payout' }),
    }, [
      text({ text: 'Approve payout', font: '700 14px Inter', lineHeight: 18 }),
    ]),
    box({
      semantic: agentAction({
        id: 'request-evidence',
        kind: 'submit',
        title: 'Request evidence',
        risk: 'write',
        audit: { workflow: 'claims-review' },
      }, { role: 'button', ariaLabel: 'Request evidence' }),
    }, [
      text({ text: 'Request docs', font: '700 14px Inter', lineHeight: 18 }),
    ]),
    box({
      semantic: agentAction({
        id: 'export-audit-packet',
        kind: 'export',
        title: 'Export audit packet',
        risk: 'external',
        audit: { workflow: 'claims-review' },
      }, { role: 'button', ariaLabel: 'Export audit packet' }),
    }, [
      text({ text: 'Export audit', font: '700 14px Inter', lineHeight: 18 }),
    ]),
  ])
}

function createClaimsGateway() {
  const gateway = createAgentGateway({
    sessionId: 'claims-review-http-demo',
    startedAt: '2026-04-25T09:30:00.000Z',
    now: clock(),
    policy: createAgentGatewayPolicy({
      allowedActionIds: ['approve-payout', 'request-evidence', 'export-audit-packet'],
      allowExternalDestructiveByDefault: true,
      requireApprovalForRisks: ['write', 'external'],
    }),
    execute: ({ target, request }) => ({
      status: 'ok',
      action: target.id,
      claimId: request.input?.claimId ?? 'CLM-1042',
      auditId: `CLM-1042-${target.id}`,
      postconditions: target.contract.postconditions ?? [],
    }),
  })
  gateway.setFrame(createClaimsTree(), layout(), {
    id: 'claims-review-http-demo:frame:1',
    route: 'claims-review',
    createdAt: '2026-04-25T09:30:00.000Z',
  })
  return gateway
}

async function json(url, pathName, init) {
  const response = await fetch(`${url}${pathName}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(`${pathName} failed: ${response.status} ${JSON.stringify(body)}`)
  }
  return body
}

function summarizeReplay(replay) {
  const action = replay.actions.at(-1)
  return {
    sessionId: replay.sessionId,
    frameCount: replay.frames.length,
    actionCount: replay.actions.length,
    lastAction: action
      ? {
          actionId: action.actionId,
          status: action.status,
          beforeFrame: action.frameBefore?.id,
          afterFrame: action.frameAfter?.id,
          beforeNodes: action.frameBefore?.geometry.nodes.length,
          output: action.output,
        }
      : null,
  }
}

async function main() {
  await mkdir(REPLAY_DIR, { recursive: true })
  const gateway = createClaimsGateway()
  const server = await createAgentGatewayHttpServer({ gateway })

  try {
    const inspected = await json(server.url, '/inspect')
    const approveTarget = inspected.geometry.nodes.find(node => node.id === 'approve-payout')
    const requested = await json(server.url, '/actions/request', {
      method: 'POST',
      body: JSON.stringify({
        actionId: 'approve-payout',
        frameId: inspected.frame.id,
        actor: 'external-agent',
        input: { claimId: 'CLM-1042', approver: 'Ops manager' },
      }),
    })
    const approved = await json(server.url, '/actions/approve', {
      method: 'POST',
      body: JSON.stringify({
        approvalId: requested.result.approvalId,
        actor: 'Ops manager',
        approved: true,
      }),
    })
    gateway.setFrame(createClaimsTree(), layout(), {
      id: 'claims-review-http-demo:frame:2',
      route: 'claims-review',
      createdAt: '2026-04-25T09:30:03.000Z',
    })
    const replayResponse = await json(server.url, '/replay')
    await writeFile(REPLAY_FILE, `${JSON.stringify(replayResponse.replay, null, 2)}\n`, 'utf8')

    console.log('External agent inspected the Geometra UI protocol:')
    console.log(`- frame: ${inspected.frame.id}`)
    console.log(`- nodes: ${inspected.geometry.nodes.length}`)
    console.log(`- approve target: ${approveTarget.role} "${approveTarget.name}" at ${approveTarget.bounds.x},${approveTarget.bounds.y},${approveTarget.bounds.width}x${approveTarget.bounds.height}`)
    console.log(`- request status: ${requested.result.status}`)
    console.log(`- approval result: ${approved.result.status}`)
    console.log(`- replay artifact: ${path.relative(ROOT, REPLAY_FILE)}`)
    console.log(JSON.stringify(summarizeReplay(replayResponse.replay), null, 2))
  } finally {
    await server.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

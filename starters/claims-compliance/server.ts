import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  agentAction,
  box,
  createAgentGateway,
  text,
  type AgentGateway,
  type AgentGatewayActionResult,
  type AgentGatewayPolicyContext,
} from '@geometra/core'
import { createAgentGatewayHttpServer } from '@geometra/gateway'

const claims = [
  {
    id: 'CLM-2042',
    claimant: 'Northstar Fabrication',
    queue: 'Ready',
    risk: 0.21,
    status: 'Ready',
    evidence: ['Policy endorsement covers replacement', 'Repair estimate matches invoice'],
  },
  {
    id: 'CLM-2047',
    claimant: 'Atlas Grocers',
    queue: 'Needs evidence',
    risk: 0.63,
    status: 'Needs evidence',
    evidence: ['Invoice missing service date', 'Photos attached'],
  },
  {
    id: 'CLM-2051',
    claimant: 'Riverbank Clinic',
    queue: 'High risk',
    risk: 0.74,
    status: 'Escalate',
    evidence: ['New payee account', 'Routing change within 24 hours'],
  },
]

type ActionId = 'approve-payout' | 'request-evidence' | 'escalate-claim'
type Claim = (typeof claims)[number]

const selectedClaim = claims[0]!

function claimIdFromInput(input: unknown): string {
  if (input && typeof input === 'object' && 'claimId' in input) {
    const value = (input as { claimId?: unknown }).claimId
    if (typeof value === 'string') return value
  }
  return claims[0]!.id
}

function claimFromInput(input: unknown): Claim {
  const claimId = claimIdFromInput(input)
  return claims.find(claim => claim.id === claimId) ?? claims[0]!
}

function claimsPolicy({ target, request }: AgentGatewayPolicyContext) {
  const claim = claimFromInput(request.input)
  if (target.id === 'approve-payout' && (claim.status !== 'Ready' || claim.risk >= 0.4)) {
    return { allow: false as const, reason: `claim ${claim.id} is not low-risk and ready for approval` }
  }
  if (target.id === 'request-evidence' && claim.status !== 'Needs evidence') {
    return { allow: false as const, reason: `claim ${claim.id} does not require more evidence` }
  }
  if (target.id === 'escalate-claim' && claim.risk < 0.7) {
    return { allow: false as const, reason: `claim ${claim.id} risk ${claim.risk} is below escalation threshold` }
  }
  return {
    allow: true as const,
    requiresApproval: target.risk === 'write' || target.risk === 'external',
    reason: `risk policy accepted claim ${claim.id}`,
  }
}

function actionContract(id: ActionId) {
  if (id === 'approve-payout') {
    return {
      id,
      kind: 'approve' as const,
      title: 'Approve payout',
      description: 'Approve a ready, low-risk claim after human confirmation.',
      risk: 'write' as const,
      requiresConfirmation: true,
      inputSchema: {
        type: 'object',
        required: ['claimId'],
        properties: { claimId: { type: 'string' }, approver: { type: 'string' } },
      },
      postconditions: ['claim.status === "Approved"', 'auditId is present'],
      audit: { workflow: 'claims-compliance' },
    }
  }
  if (id === 'request-evidence') {
    return {
      id,
      kind: 'submit' as const,
      title: 'Request evidence',
      description: 'Request missing claim evidence from the claimant.',
      risk: 'write' as const,
      inputSchema: {
        type: 'object',
        required: ['claimId'],
        properties: { claimId: { type: 'string' }, evidenceTypes: { type: 'array', items: { type: 'string' } } },
      },
      postconditions: ['claim.status === "Waiting for customer"'],
      audit: { workflow: 'claims-compliance' },
    }
  }
  return {
    id,
    kind: 'submit' as const,
    title: 'Escalate claim',
    description: 'Escalate a high-risk claim to special investigations.',
    risk: 'external' as const,
    requiresConfirmation: true,
    inputSchema: {
      type: 'object',
      required: ['claimId'],
      properties: { claimId: { type: 'string' }, reason: { type: 'string' } },
    },
    postconditions: ['claim.queue === "Special investigations"'],
    audit: { workflow: 'claims-compliance' },
  }
}

function claimRow(claim: (typeof claims)[number], index: number) {
  return box({ semantic: { id: `claim-${claim.id}`, role: 'region', ariaLabel: `${claim.id} ${claim.status}` } }, [
    text({ text: `${claim.id} / ${claim.claimant}`, font: '700 16px Inter', lineHeight: 22 }),
    text({ text: `Risk ${claim.risk} / ${claim.status}`, font: '14px Inter', lineHeight: 20 }),
    text({ text: claim.evidence.join(' | '), font: '13px Inter', lineHeight: 18 }),
    box({
      semantic: agentAction(actionContract(index === 0 ? 'approve-payout' : index === 1 ? 'request-evidence' : 'escalate-claim'), {
        role: 'button',
        ariaLabel: index === 0 ? 'Approve payout' : index === 1 ? 'Request evidence' : 'Escalate claim',
      }),
    }, [
      text({ text: index === 0 ? 'Approve payout' : index === 1 ? 'Request evidence' : 'Escalate claim', font: '700 13px Inter', lineHeight: 18 }),
    ]),
  ])
}

function queueFilter(queue: string, count: number) {
  return box({ semantic: { id: `queue-${queue.toLowerCase().replaceAll(' ', '-')}`, role: 'button', ariaLabel: `${queue} queue` } }, [
    text({ text: `${queue} (${count})`, font: '700 14px Inter', lineHeight: 20 }),
  ])
}

function evidencePanel(claim: Claim) {
  return box({ semantic: { id: 'evidence-panel', role: 'region', ariaLabel: `Evidence for ${claim.id}` } }, [
    text({ text: `Evidence panel: ${claim.id}`, font: '700 18px Inter', lineHeight: 24 }),
    text({ text: `Risk score ${claim.risk} / Status ${claim.status}`, font: '14px Inter', lineHeight: 20 }),
    ...claim.evidence.map(item => text({ text: `- ${item}`, font: '13px Inter', lineHeight: 18 })),
  ])
}

const tree = box({ semantic: { id: 'claims-compliance-workstation', role: 'main', ariaLabel: 'Claims compliance workstation' } }, [
  box({ semantic: { id: 'queue-filters', role: 'tablist', ariaLabel: 'Claim queue filters' } }, [
    queueFilter('Ready', 1),
    queueFilter('Needs evidence', 1),
    queueFilter('High risk', 1),
  ]),
  evidencePanel(selectedClaim),
  ...claims.map(claimRow),
])
const layout = {
  x: 0,
  y: 0,
  width: 980,
  height: 760,
  children: [
    {
      x: 24,
      y: 24,
      width: 932,
      height: 44,
      children: [
        { x: 0, y: 0, width: 140, height: 32, children: [{ x: 12, y: 6, width: 96, height: 20, children: [] }] },
        { x: 156, y: 0, width: 180, height: 32, children: [{ x: 12, y: 6, width: 132, height: 20, children: [] }] },
        { x: 352, y: 0, width: 160, height: 32, children: [{ x: 12, y: 6, width: 112, height: 20, children: [] }] },
      ],
    },
    {
      x: 24,
      y: 86,
      width: 932,
      height: 118,
      children: [
        { x: 16, y: 16, width: 220, height: 24, children: [] },
        { x: 16, y: 48, width: 220, height: 20, children: [] },
        { x: 16, y: 78, width: 360, height: 18, children: [] },
        { x: 16, y: 98, width: 340, height: 18, children: [] },
      ],
    },
    ...claims.map((_, index) => ({
      x: 24,
      y: 224 + index * 170,
      width: 932,
      height: 146,
      children: [
        { x: 16, y: 16, width: 260, height: 22, children: [] },
        { x: 16, y: 46, width: 180, height: 20, children: [] },
        { x: 16, y: 76, width: 520, height: 18, children: [] },
        { x: 16, y: 106, width: 150, height: 34, children: [{ x: 12, y: 8, width: 110, height: 18, children: [] }] },
      ],
    })),
  ],
}

let gateway: AgentGateway

function writeLatestAuditPacket(result: AgentGatewayActionResult) {
  if (result.status !== 'completed') return
  const replay = gateway.getReplay()
  const outputPath = fileURLToPath(new URL('./replays/latest-audit-packet.json', import.meta.url))
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), result, replay }, null, 2))
}

gateway = createAgentGateway({
  sessionId: 'claims-compliance-dev',
  policy: claimsPolicy,
  execute: ({ target, request }) => ({
    ok: true,
    actionId: target.id,
    claimId: claimIdFromInput(request.input),
    auditId: `${claimIdFromInput(request.input)}-${target.id}`,
    postconditions: target.contract.postconditions ?? [],
  }),
  onApprovalRequired: approval => {
    console.log(`Approval required: ${approval.id} for ${approval.actionId}`)
  },
  onActionResult: writeLatestAuditPacket,
})

gateway.setFrame(tree, layout, {
  id: 'claims-compliance-dev:frame:1',
  route: 'claims-compliance',
})

const server = await createAgentGatewayHttpServer({ gateway, port: 3333 })

console.log(`Claims/compliance gateway listening at ${server.url}`)
console.log(`Inspect frame: ${server.url}/inspect`)
console.log('After a completed action, latest audit packet is written to ./replays/latest-audit-packet.json')

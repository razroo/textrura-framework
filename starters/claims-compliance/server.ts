import { agentAction, box, createAgentGateway, createAgentGatewayPolicy, text } from '@geometra/core'
import { createAgentGatewayHttpServer } from '@geometra/gateway'

const claims = [
  {
    id: 'CLM-2042',
    claimant: 'Northstar Fabrication',
    risk: 0.21,
    status: 'Ready',
    evidence: ['Policy endorsement covers replacement', 'Repair estimate matches invoice'],
  },
  {
    id: 'CLM-2047',
    claimant: 'Atlas Grocers',
    risk: 0.63,
    status: 'Needs evidence',
    evidence: ['Invoice missing service date', 'Photos attached'],
  },
  {
    id: 'CLM-2051',
    claimant: 'Riverbank Clinic',
    risk: 0.74,
    status: 'Escalate',
    evidence: ['New payee account', 'Routing change within 24 hours'],
  },
]

type ActionId = 'approve-payout' | 'request-evidence' | 'escalate-claim'

function claimIdFromInput(input: unknown): string {
  if (input && typeof input === 'object' && 'claimId' in input) {
    const value = (input as { claimId?: unknown }).claimId
    if (typeof value === 'string') return value
  }
  return claims[0]!.id
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

const tree = box({ semantic: { id: 'claims-compliance-workstation', role: 'main', ariaLabel: 'Claims compliance workstation' } }, claims.map(claimRow))
const layout = {
  x: 0,
  y: 0,
  width: 880,
  height: 640,
  children: claims.map((_, index) => ({
    x: 24,
    y: 24 + index * 180,
    width: 832,
    height: 152,
    children: [
      { x: 16, y: 16, width: 260, height: 22, children: [] },
      { x: 16, y: 46, width: 180, height: 20, children: [] },
      { x: 16, y: 76, width: 520, height: 18, children: [] },
      { x: 16, y: 108, width: 150, height: 34, children: [{ x: 12, y: 8, width: 110, height: 18, children: [] }] },
    ],
  })),
}

const gateway = createAgentGateway({
  sessionId: 'claims-compliance-dev',
  policy: createAgentGatewayPolicy({
    allowedActionIds: ['approve-payout', 'request-evidence', 'escalate-claim'],
    allowExternalDestructiveByDefault: true,
    requireApprovalForRisks: ['write', 'external'],
  }),
  execute: ({ target, request }) => ({
    ok: true,
    actionId: target.id,
    claimId: claimIdFromInput(request.input),
    auditId: `${claimIdFromInput(request.input)}-${target.id}`,
    postconditions: target.contract.postconditions ?? [],
  }),
})

gateway.setFrame(tree, layout, {
  id: 'claims-compliance-dev:frame:1',
  route: 'claims-compliance',
})

const server = await createAgentGatewayHttpServer({ gateway, port: 3333 })

console.log(`Claims/compliance gateway listening at ${server.url}`)
console.log(`Inspect frame: ${server.url}/inspect`)

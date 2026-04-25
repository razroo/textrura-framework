import { agentAction, box, createAgentGateway, createAgentGatewayPolicy, text } from '@geometra/core'
import { createAgentGatewayHttpServer } from '@geometra/gateway'

function claimIdFromInput(input: unknown): string {
  if (input && typeof input === 'object' && 'claimId' in input) {
    const value = (input as { claimId?: unknown }).claimId
    if (typeof value === 'string') return value
  }
  return 'CLM-1001'
}

const tree = box({ semantic: { id: 'claims-workstation', role: 'main', ariaLabel: 'Claims workstation' } }, [
  box({ semantic: { id: 'claim-card', role: 'region', ariaLabel: 'Claim CLM-1001' } }, [
    text({ text: 'CLM-1001 / Example claimant', font: '700 18px Inter', lineHeight: 24 }),
    text({ text: 'Ready for payout. Evidence validated.', font: '14px Inter', lineHeight: 20 }),
  ]),
  box({
    semantic: agentAction({
      id: 'approve-payout',
      kind: 'approve',
      title: 'Approve payout',
      description: 'Approve the claim after human confirmation.',
      risk: 'write',
      requiresConfirmation: true,
      inputSchema: {
        type: 'object',
        properties: { claimId: { type: 'string' }, approver: { type: 'string' } },
        required: ['claimId', 'approver'],
      },
      postconditions: ['claim.status === "Approved"', 'auditId is present'],
      audit: { workflow: 'claims-workstation' },
    }, { role: 'button', ariaLabel: 'Approve payout' }),
  }, [
    text({ text: 'Approve payout', font: '700 14px Inter', lineHeight: 18 }),
  ]),
])

const layout = {
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
    {
      x: 24,
      y: 144,
      width: 160,
      height: 48,
      children: [{ x: 18, y: 14, width: 112, height: 18, children: [] }],
    },
  ],
}

const gateway = createAgentGateway({
  sessionId: 'claims-workstation-dev',
  policy: createAgentGatewayPolicy({
    allowedActionIds: ['approve-payout'],
    requireApprovalForRisks: ['write'],
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
  id: 'claims-workstation-dev:frame:1',
  route: 'claims-workstation',
})

const server = await createAgentGatewayHttpServer({ gateway, port: 3333 })

console.log(`Agent workstation gateway listening at ${server.url}`)
console.log(`Inspect frame: ${server.url}/inspect`)

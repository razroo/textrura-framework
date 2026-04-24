import {
  agentAction,
  batch,
  bodyText,
  box,
  createApp,
  createAgentGateway,
  createAgentGatewayPolicy,
  signal,
  summarizeAgentTrace,
  text,
} from '@geometra/core'
import type { AgentActionContract, App, UIElement } from '@geometra/core'
import { CanvasRenderer } from '@geometra/renderer-canvas'

type ActionId = 'approve-payout' | 'request-evidence' | 'escalate-claim' | 'export-audit-packet'

interface Claim {
  id: string
  claimant: string
  amount: string
  status: string
  riskScore: string
  sla: string
  summary: string
  evidence: string[]
  recommendation: string
}

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: '#f6f3ec' })

const viewport = signal({ width: 1180, height: 760 })
const appOptions = { width: viewport.value.width, height: viewport.value.height }

const claims: Claim[] = [
  {
    id: 'CLM-1042',
    claimant: 'Northstar Fabrication',
    amount: '$48,900',
    status: 'Ready',
    riskScore: '0.21',
    sla: '18m',
    summary:
      'Commercial equipment loss. Adjuster validated serial numbers, repair estimate, and policy limits.',
    evidence: ['Repair estimate matched vendor invoice', 'Policy endorsement covers replacement', 'No duplicate payout history'],
    recommendation: 'Approve payout with finance confirmation and export the audit packet.',
  },
  {
    id: 'CLM-1047',
    claimant: 'Atlas Grocers',
    amount: '$12,400',
    status: 'Needs evidence',
    riskScore: '0.63',
    sla: '41m',
    summary:
      'Refrigeration loss claim. Photos exist, but the vendor invoice does not include a service date.',
    evidence: ['Photos attached', 'Invoice missing service date', 'Customer has two prior claims'],
    recommendation: 'Request corrected invoice before approval.',
  },
  {
    id: 'CLM-1051',
    claimant: 'Riverbank Clinic',
    amount: '$83,200',
    status: 'Escalate',
    riskScore: '0.74',
    sla: '7m',
    summary:
      'Medical device replacement claim with unusual routing instructions and a new payee account.',
    evidence: ['New payee account', 'High-value claim', 'Routing change within 24 hours'],
    recommendation: 'Escalate to special investigations before payout.',
  },
]

const actions: Record<ActionId, AgentActionContract> = {
  'approve-payout': {
    id: 'approve-payout',
    kind: 'approve',
    title: 'Approve payout',
    description: 'Approve the selected claim for payment after human confirmation.',
    risk: 'write',
    requiresConfirmation: true,
    inputSchema: {
      type: 'object',
      properties: { claimId: { type: 'string' }, approver: { type: 'string' } },
      required: ['claimId', 'approver'],
    },
    outputSchema: {
      type: 'object',
      properties: { status: { type: 'string' }, auditId: { type: 'string' } },
      required: ['status', 'auditId'],
    },
    preconditions: ['claim.status === "Ready"', 'riskScore < 0.75'],
    postconditions: ['claim.status === "Approved"', 'auditId is present'],
    audit: { workflow: 'claims-review' },
  },
  'request-evidence': {
    id: 'request-evidence',
    kind: 'submit',
    title: 'Request evidence',
    description: 'Send a customer request for missing documents.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: { claimId: { type: 'string' }, missingItem: { type: 'string' } },
      required: ['claimId', 'missingItem'],
    },
    postconditions: ['claim.status === "Waiting for customer"'],
    audit: { workflow: 'claims-review' },
  },
  'escalate-claim': {
    id: 'escalate-claim',
    kind: 'submit',
    title: 'Escalate claim',
    description: 'Escalate the selected claim to special investigations.',
    risk: 'external',
    preconditions: ['riskScore >= 0.7 or analyst override present'],
    postconditions: ['claim.queue === "Special investigations"'],
    audit: { workflow: 'claims-review' },
  },
  'export-audit-packet': {
    id: 'export-audit-packet',
    kind: 'export',
    title: 'Export audit packet',
    description: 'Produce a sanitized audit packet for compliance review.',
    risk: 'external',
    outputSchema: {
      type: 'object',
      properties: { exportId: { type: 'string' }, redacted: { type: 'boolean' } },
      required: ['exportId', 'redacted'],
    },
    postconditions: ['packet.redacted === true'],
    audit: { workflow: 'claims-review' },
  },
}

const activeClaimId = signal(claims[0]!.id)
const statusByClaim = signal<Record<string, string>>(
  Object.fromEntries(claims.map(claim => [claim.id, claim.status])),
)
let appRef: App | null = null

function isActionId(value: string): value is ActionId {
  return Object.prototype.hasOwnProperty.call(actions, value)
}

function claimIdFromInput(input: unknown): string {
  if (input && typeof input === 'object' && 'claimId' in input) {
    const value = (input as { claimId?: unknown }).claimId
    if (typeof value === 'string') return value
  }
  return activeClaimId.peek()
}

function statusAfterAction(actionId: ActionId, claimId: string): string {
  const current = statusByClaim.peek()[claimId] ?? claims.find(claim => claim.id === claimId)?.status ?? 'Ready'
  if (actionId === 'approve-payout') return 'Approved'
  if (actionId === 'request-evidence') return 'Waiting for customer'
  if (actionId === 'escalate-claim') return 'Special investigations'
  return current
}

function activeClaim(): Claim {
  return claims.find(claim => claim.id === activeClaimId.value) ?? claims[0]!
}

const gateway = createAgentGateway({
  sessionId: 'claims-review-demo',
  policy: createAgentGatewayPolicy({
    allowedActionIds: Object.keys(actions),
    allowExternalDestructiveByDefault: true,
    requireApprovalForRisks: ['external', 'destructive'],
  }),
  execute: ({ target, request }) => {
    if (!isActionId(target.id)) {
      throw new Error(`Unknown workflow action "${target.id}"`)
    }
    const claimId = claimIdFromInput(request.input)
    const nextStatus = statusAfterAction(target.id, claimId)
    statusByClaim.set({ ...statusByClaim.peek(), [claimId]: nextStatus })
    return {
      status: 'ok',
      auditId: `${claimId}-${target.id}`,
      claimStatus: nextStatus,
      redacted: target.id === 'export-audit-packet',
    }
  },
})
const trace = signal(gateway.getTrace())
const lastMessage = signal('Gateway ready. Four agent contracts are published from the Geometra tree.')
const agentRunning = signal(false)

function syncGatewayFrame() {
  if (!appRef?.tree || !appRef.layout) return null
  return gateway.setFrame(appRef.tree, appRef.layout, { route: 'claims-review' })
}

async function runAction(actionId: ActionId): Promise<void> {
  const frame = syncGatewayFrame()
  const claim = activeClaim()
  if (!frame) {
    lastMessage.set('Gateway has no rendered frame yet.')
    return
  }

  const result = await gateway.requestAction({
    frameId: frame.id,
    actionId,
    actor: 'agent',
    approved: true,
    approvalActor: 'human',
    input: { claimId: claim.id, approver: 'Ops manager' },
  })
  syncGatewayFrame()
  const contract = actions[actionId]
  batch(() => {
    trace.set(gateway.getTrace())
    lastMessage.set(
      result.status === 'completed'
        ? `${contract.title} completed for ${claim.id}; gateway trace has ${result.trace.events.length} events.`
        : `${contract.title} ${result.status}: ${result.reason ?? 'gateway policy stopped execution'}.`,
    )
  })
}

async function runAgentAction(actionId: ActionId, claim: Claim): Promise<void> {
  const frame = syncGatewayFrame()
  if (!frame) {
    lastMessage.set('Gateway has no rendered frame yet.')
    return
  }
  const available = gateway.listActions().map(action => action.id)
  if (!available.includes(actionId)) {
    lastMessage.set(`Agent could not find ${actionId} in the current action catalog.`)
    return
  }

  const requested = await gateway.requestAction({
    frameId: frame.id,
    actionId,
    actor: 'agent',
    input: { claimId: claim.id, approver: 'Ops manager' },
  })
  let final = requested
  if (requested.status === 'awaiting_approval' && requested.approvalId) {
    lastMessage.set(`${actions[actionId].title} is awaiting approval ${requested.approvalId}.`)
    final = await gateway.approveAction({ approvalId: requested.approvalId, actor: 'Ops manager' })
  }
  syncGatewayFrame()
  batch(() => {
    trace.set(gateway.getTrace())
    lastMessage.set(
      final.status === 'completed'
        ? `Agent completed ${actions[actionId].title} for ${claim.id}; replay ${final.replayId} captured before/after frames.`
        : `Agent ${actions[actionId].title} ${final.status}: ${final.reason ?? 'gateway policy stopped execution'}.`,
    )
  })
}

async function runAgentPlan(): Promise<void> {
  if (agentRunning.peek()) return
  agentRunning.set(true)
  const claim = activeClaim()
  try {
    if (claim.status === 'Escalate' || Number(claim.riskScore) >= 0.7) {
      await runAgentAction('escalate-claim', claim)
      return
    }
    if (claim.status === 'Needs evidence') {
      await runAgentAction('request-evidence', claim)
      return
    }
    await runAgentAction('approve-payout', claim)
    await runAgentAction('export-audit-packet', claim)
  } finally {
    agentRunning.set(false)
  }
}

function t(value: string, size = 13, weight = '', color = '#1f2933'): UIElement {
  const prefix = weight.length > 0 ? `${weight} ` : ''
  return text({
    text: value,
    font: `${prefix}${size}px Inter, system-ui`,
    lineHeight: Math.round(size * 1.35),
    color,
  })
}

function copy(value: string, color = '#4b5563'): UIElement {
  return bodyText({
    text: value,
    font: '13px Inter, system-ui',
    lineHeight: 19,
    color,
  })
}

function panel(children: UIElement[], width?: number, grow = false): UIElement {
  return box(
    {
      ...(width !== undefined ? { width, flexShrink: 0 } : { flexShrink: 1, ...(grow ? { flexGrow: 1 } : {}) }),
      flexDirection: 'column',
      gap: 12,
      padding: 16,
      backgroundColor: '#ffffff',
      borderColor: '#d8d2c4',
      borderWidth: 1,
      borderRadius: 8,
    },
    children,
  )
}

function metric(label: string, value: string, color: string): UIElement {
  return box(
    {
      width: 128,
      flexDirection: 'column',
      gap: 4,
      padding: 10,
      backgroundColor: '#fbfaf6',
      borderColor: '#ded8ca',
      borderWidth: 1,
      borderRadius: 6,
    },
    [
      t(label, 11, '600', '#6b7280'),
      t(value, 18, '700', color),
    ],
  )
}

function queueItem(claim: Claim): UIElement {
  const selected = claim.id === activeClaimId.value
  const status = statusByClaim.value[claim.id] ?? claim.status
  return box(
    {
      flexDirection: 'column',
      gap: 6,
      padding: 12,
      backgroundColor: selected ? '#e7f4ef' : '#fbfaf6',
      borderColor: selected ? '#2f8f75' : '#ddd6c8',
      borderWidth: 1,
      borderRadius: 6,
      cursor: 'pointer',
      onClick: () => activeClaimId.set(claim.id),
      semantic: { role: 'button', ariaLabel: `Select ${claim.id}` },
    },
    [
      box({ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, [
        t(claim.id, 13, '700', '#111827'),
        t(claim.sla, 12, '700', claim.sla === '7m' ? '#b42318' : '#6b7280'),
      ]),
      t(claim.claimant, 12, '', '#4b5563'),
      box({ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, [
        t(claim.amount, 13, '700', '#0f766e'),
        t(status, 11, '700', selected ? '#166534' : '#6b7280'),
      ]),
    ],
  )
}

function actionButton(actionId: ActionId, color: string): UIElement {
  const contract = actions[actionId]
  return box(
    {
      flexDirection: 'column',
      gap: 5,
      padding: 12,
      minHeight: 62,
      backgroundColor: color,
      borderRadius: 7,
      cursor: 'pointer',
      onClick: () => {
        void runAction(actionId)
      },
      semantic: agentAction(contract, { role: 'button', ariaLabel: contract.title }),
    },
    [
      t(contract.title, 13, '700', '#ffffff'),
      t(contract.risk ?? 'write', 10, '700', 'rgba(255,255,255,0.82)'),
      copy(contract.description ?? 'Agent-invokable workflow operation.', 'rgba(255,255,255,0.78)'),
    ],
  )
}

function agentPlanButton(): UIElement {
  return box(
    {
      flexDirection: 'column',
      gap: 5,
      padding: 12,
      minHeight: 62,
      backgroundColor: agentRunning.value ? '#4b5563' : '#111827',
      borderRadius: 7,
      cursor: agentRunning.value ? 'not-allowed' : 'pointer',
      onClick: () => {
        void runAgentPlan()
      },
      semantic: { role: 'button', ariaLabel: 'Run agent plan', ariaDisabled: agentRunning.value },
    },
    [
      t(agentRunning.value ? 'Agent running' : 'Run agent plan', 13, '700', '#ffffff'),
      t('gateway', 10, '700', 'rgba(255,255,255,0.82)'),
      copy('Lists actions, requests one, records approval, executes, and stores replay.', 'rgba(255,255,255,0.78)'),
    ],
  )
}

function claimDetails(claim: Claim): UIElement {
  const status = statusByClaim.value[claim.id] ?? claim.status
  return panel([
    box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, [
      box({ flexDirection: 'column', gap: 4, flexGrow: 1 }, [
        t(`${claim.id} / ${claim.claimant}`, 18, '700', '#111827'),
        copy(claim.summary),
      ]),
      metric('Risk', claim.riskScore, Number(claim.riskScore) >= 0.7 ? '#b42318' : '#166534'),
      metric('Amount', claim.amount, '#0f766e'),
      metric('Status', status, status === 'Approved' ? '#166534' : '#7c2d12'),
    ]),
    box({ height: 1, backgroundColor: '#e6dfd2' }, []),
    box({ flexDirection: 'row', gap: 14 }, [
      panel(
        [
          t('Evidence', 14, '700', '#111827'),
          ...claim.evidence.map(item =>
            box({ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, [
              box({ width: 7, height: 7, borderRadius: 4, backgroundColor: '#2f8f75', marginTop: 6 }, []),
              copy(item),
            ]),
          ),
        ],
        300,
      ),
      panel(
        [
          t('Recommendation', 14, '700', '#111827'),
          copy(claim.recommendation),
          t('Agent-native contract layer', 12, '700', '#6b7280'),
          copy('The agent sees stable ids, risk classes, preconditions, postconditions, and exact hit geometry.'),
        ],
        undefined,
        true,
      ),
    ]),
  ])
}

function tracePanel(): UIElement {
  const summary = summarizeAgentTrace(trace.value)
  const events = trace.value.events.slice(-5).reverse()
  return panel(
    [
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
        t('Gateway Trace', 14, '700', '#111827'),
        t(`${summary.eventCount} events`, 12, '700', '#0f766e'),
      ]),
      copy(lastMessage.value),
      box({ flexDirection: 'row', gap: 8 }, [
        metric('Completed', String(summary.completedCount), '#166534'),
        metric('Denied', String(summary.deniedCount), '#b42318'),
      ]),
      ...(events.length === 0
        ? [copy('No actions have run yet. Click a contracted operation to create a trace.')]
        : events.map(event =>
            box(
              {
                flexDirection: 'column',
                gap: 3,
                padding: 9,
                backgroundColor: '#fbfaf6',
                borderColor: '#e6dfd2',
                borderWidth: 1,
                borderRadius: 6,
              },
              [
                box({ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, [
                  t(event.actionId, 12, '700', '#111827'),
                  t(event.status, 11, '700', event.status === 'completed' ? '#166534' : '#7c2d12'),
                ]),
                t(event.message ?? event.actor ?? event.id, 11, '', '#6b7280'),
              ],
            ),
          )),
    ],
    310,
  )
}

function protocolPanel(): UIElement {
  const items: Array<[string, string]> = [
    ['Frame', 'Tree, layout, semantics, and action contracts are published together.'],
    ['Policy', 'Risk classes drive confirmation before the gateway executes work.'],
    ['Trace', 'Every request, approval, and completion is replayable for audit review.'],
    ['Value', 'Agents operate a smaller trusted surface than DOM or screenshot automation.'],
  ]
  return panel([
    t('Agent-Native Frame', 14, '700', '#111827'),
    box({ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, items.map(([label, value]) =>
      box(
        {
          width: 190,
          minHeight: 86,
          flexDirection: 'column',
          gap: 6,
          padding: 12,
          backgroundColor: '#fbfaf6',
          borderColor: '#e6dfd2',
          borderWidth: 1,
          borderRadius: 6,
        },
        [
          t(label, 12, '800', '#0f766e'),
          copy(value, '#4b5563'),
        ],
      ),
    )),
  ])
}

function view(): UIElement {
  const claim = activeClaim()
  const size = viewport.value
  const compact = size.width < 980

  return box(
    {
      width: size.width,
      height: size.height,
      flexDirection: 'column',
      gap: 14,
      padding: 18,
      backgroundColor: '#f6f3ec',
    },
    [
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, [
        box({ flexDirection: 'column', gap: 3, flexGrow: 1 }, [
          t('Claims Agent Gateway', 22, '800', '#111827'),
          copy('Enterprise workflow demo: Geometra geometry, explicit action contracts, policy gates, and replayable traces.'),
        ]),
        box({ flexDirection: 'row', gap: 8 }, [
          metric('Contracts', String(Object.keys(actions).length), '#0f766e'),
          metric('Protocol', 'native', '#5b5bd6'),
          metric('Replay', 'on', '#166534'),
        ]),
      ]),
      box(
        {
          flexDirection: compact ? 'column' : 'row',
          gap: 14,
          flexGrow: 1,
          minHeight: 0,
        },
        [
          panel(
            [
              t('Review Queue', 14, '700', '#111827'),
              ...claims.map(queueItem),
            ],
            compact ? undefined : 260,
          ),
          box({ flexDirection: 'column', gap: 14, flexGrow: 1, flexShrink: 1, minWidth: 0 }, [
            claimDetails(claim),
            panel([
              t('Contracted Operations', 14, '700', '#111827'),
              box({ flexDirection: compact ? 'column' : 'row', gap: 10 }, [
                actionButton('approve-payout', '#0f766e'),
                actionButton('request-evidence', '#7c3aed'),
                actionButton('escalate-claim', '#b45309'),
                actionButton('export-audit-packet', '#1d4ed8'),
                agentPlanButton(),
              ]),
            ]),
            protocolPanel(),
          ]),
          tracePanel(),
        ],
      ),
    ],
  )
}

function resizeCanvas(): void {
  const width = Math.max(720, Math.round(window.innerWidth))
  const height = Math.max(620, Math.round(window.innerHeight))
  canvas.width = width
  canvas.height = height
  appOptions.width = width
  appOptions.height = height
  viewport.set({ width, height })
}

resizeCanvas()
createApp(view, renderer, appOptions).then(app => {
  appRef = app
  syncGatewayFrame()
  trace.set(gateway.getTrace())
  window.addEventListener('resize', resizeCanvas)
  canvas.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect()
    app.dispatch('onClick', event.clientX - rect.left, event.clientY - rect.top)
  })
})

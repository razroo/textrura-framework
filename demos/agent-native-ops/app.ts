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

const actionButtonLabels: Record<ActionId, string> = {
  'approve-payout': 'Approve payout',
  'request-evidence': 'Request docs',
  'escalate-claim': 'Escalate',
  'export-audit-packet': 'Export audit',
}

const compactActionButtonLabels: Record<ActionId, string> = {
  'approve-payout': 'Approve',
  'request-evidence': 'Docs',
  'escalate-claim': 'Escalate',
  'export-audit-packet': 'Audit',
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
const pendingApprovals = signal(gateway.getPendingApprovals())
const lastMessage = signal('Gateway ready. Four agent contracts are published from the Geometra tree.')
const agentRunning = signal(false)

function syncGatewayFrame() {
  if (!appRef?.tree || !appRef.layout) return null
  return gateway.setFrame(appRef.tree, appRef.layout, { route: 'claims-review' })
}

function publishGatewayState(): void {
  trace.set(gateway.getTrace())
  pendingApprovals.set(gateway.getPendingApprovals())
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
    publishGatewayState()
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
  const final = requested
  if (requested.status === 'awaiting_approval' && requested.approvalId) {
    batch(() => {
      publishGatewayState()
      lastMessage.set(`${actions[actionId].title} is awaiting approval ${requested.approvalId}.`)
    })
    return
  }
  syncGatewayFrame()
  batch(() => {
    publishGatewayState()
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
  } finally {
    agentRunning.set(false)
  }
}

async function decidePendingApproval(approvalId: string, approved: boolean): Promise<void> {
  const result = await gateway.approveAction({
    approvalId,
    actor: 'Ops manager',
    approved,
  })
  syncGatewayFrame()
  batch(() => {
    publishGatewayState()
    lastMessage.set(
      result.status === 'completed'
        ? `Approval ${approvalId} completed ${result.actionId}; replay ${result.replayId} captured.`
        : `Approval ${approvalId} ${result.status}: ${result.reason ?? 'gateway recorded the decision'}.`,
    )
  })
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
  const compact = viewport.value.width < 760
  return box(
    {
      width: compact ? 100 : 128,
      flexShrink: 0,
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
      t(actionButtonLabels[actionId], 13, '700', '#ffffff'),
      t(contract.risk ?? 'write', 10, '700', 'rgba(255,255,255,0.82)'),
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
      t(agentRunning.value ? 'Running' : 'Run plan', 13, '700', '#ffffff'),
      t('gateway', 10, '700', 'rgba(255,255,255,0.82)'),
    ],
  )
}

function compactActionButton(actionId: ActionId, color: string): UIElement {
  const contract = actions[actionId]
  return box(
    {
      width: 104,
      minHeight: 54,
      flexShrink: 0,
      flexDirection: 'column',
      gap: 4,
      padding: 10,
      backgroundColor: color,
      borderRadius: 7,
      cursor: 'pointer',
      onClick: () => {
        void runAction(actionId)
      },
      semantic: agentAction(contract, { role: 'button', ariaLabel: contract.title }),
    },
    [
      t(compactActionButtonLabels[actionId], 12, '700', '#ffffff'),
      t(contract.risk ?? 'write', 10, '700', 'rgba(255,255,255,0.82)'),
    ],
  )
}

function compactAgentPlanButton(): UIElement {
  return box(
    {
      width: 104,
      minHeight: 54,
      flexShrink: 0,
      flexDirection: 'column',
      gap: 4,
      padding: 10,
      backgroundColor: agentRunning.value ? '#4b5563' : '#111827',
      borderRadius: 7,
      cursor: agentRunning.value ? 'not-allowed' : 'pointer',
      onClick: () => {
        void runAgentPlan()
      },
      semantic: { role: 'button', ariaLabel: 'Run agent plan', ariaDisabled: agentRunning.value },
    },
    [
      t(agentRunning.value ? 'Running' : 'Plan', 12, '700', '#ffffff'),
      t('gateway', 10, '700', 'rgba(255,255,255,0.82)'),
    ],
  )
}

function approvalDecisionButton(label: string, color: string, onClick: () => void): UIElement {
  return box(
    {
      paddingLeft: 10,
      paddingRight: 10,
      paddingTop: 7,
      paddingBottom: 7,
      backgroundColor: color,
      borderRadius: 5,
      cursor: 'pointer',
      onClick,
      semantic: { role: 'button', ariaLabel: label },
    },
    [t(label, 12, '700', '#ffffff')],
  )
}

function claimDetails(claim: Claim): UIElement {
  const status = statusByClaim.value[claim.id] ?? claim.status
  const compact = viewport.value.width < 760
  return panel([
    box({ flexDirection: compact ? 'column' : 'row', justifyContent: 'space-between', alignItems: compact ? 'stretch' : 'center', gap: 12 }, [
      box({ flexDirection: 'column', gap: 4, flexGrow: 1 }, [
        t(`${claim.id} / ${claim.claimant}`, 18, '700', '#111827'),
        copy(claim.summary),
      ]),
      box({ ...(compact ? {} : { width: 400, flexShrink: 0 }), flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, [
        metric('Risk', claim.riskScore, Number(claim.riskScore) >= 0.7 ? '#b42318' : '#166534'),
        metric('Amount', claim.amount, '#0f766e'),
        metric('Status', status, status === 'Approved' ? '#166534' : '#7c2d12'),
      ]),
    ]),
    box({ height: 1, backgroundColor: '#e6dfd2' }, []),
    box({ flexDirection: compact ? 'column' : 'row', gap: 14 }, [
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
        compact ? undefined : 300,
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
  const pending = pendingApprovals.value
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
      ...pending.map(approval =>
        box(
          {
            flexDirection: 'column',
            gap: 8,
            padding: 10,
            backgroundColor: '#fff7ed',
            borderColor: '#fdba74',
            borderWidth: 1,
            borderRadius: 6,
          },
          [
            t('Pending approval', 12, '800', '#9a3412'),
            copy(`${approval.target.title} / ${approval.reason}`, '#7c2d12'),
            box({ flexDirection: 'row', gap: 8 }, [
              approvalDecisionButton('Approve', '#166534', () => {
                void decidePendingApproval(approval.id, true)
              }),
              approvalDecisionButton('Deny', '#b42318', () => {
                void decidePendingApproval(approval.id, false)
              }),
            ]),
          ],
        ),
      ),
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
    viewport.value.width < 980 ? undefined : 310,
  )
}

function replayPanel(): UIElement {
  const replay = gateway.getReplay()
  const lastAction = replay.actions.at(-1)
  return panel([
    box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
      t('Replay Viewer', 14, '700', '#111827'),
      t(`${replay.actions.length} actions`, 12, '700', '#0f766e'),
    ]),
    box({ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, [
      metric('Frames', String(replay.frames.length), '#5b5bd6'),
      metric('Trace events', String(replay.trace.events.length), '#0f766e'),
      metric('Pending', String(pendingApprovals.value.length), pendingApprovals.value.length > 0 ? '#b45309' : '#166534'),
    ]),
    ...(lastAction
      ? [
          box(
            {
              flexDirection: 'column',
              gap: 6,
              padding: 10,
              backgroundColor: '#fbfaf6',
              borderColor: '#e6dfd2',
              borderWidth: 1,
              borderRadius: 6,
            },
            [
              t(lastAction.actionId, 12, '800', '#111827'),
              copy(`Status: ${lastAction.status}. Before: ${lastAction.frameBefore?.id ?? 'none'}. After: ${lastAction.frameAfter?.id ?? 'pending'}.`),
            ],
          ),
        ]
      : [copy('Replay will show frame-before, policy, approval, output, and frame-after once an agent action runs.')]),
  ])
}

function protocolPanel(): UIElement {
  const compact = viewport.value.width < 760
  const items: Array<[string, string]> = [
    ['Frame', 'Tree, layout, semantics, and contracts ship together.'],
    ['Policy', 'Risk classes gate execution.'],
    ['Trace', 'Requests, approvals, and completions replay.'],
    ['Value', 'Smaller trusted surface than DOM automation.'],
  ]
  return panel([
    t('Agent-Native Frame', 14, '700', '#111827'),
    box({ flexDirection: compact ? 'column' : 'row', gap: 10, flexWrap: 'wrap' }, items.map(([label, value]) =>
      box(
        {
          ...(compact ? {} : { width: 142 }),
          minHeight: 92,
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

function compactQueueItem(claim: Claim): UIElement {
  const selected = claim.id === activeClaimId.value
  const status = statusByClaim.value[claim.id] ?? claim.status
  return box(
    {
      width: 104,
      minHeight: 58,
      flexShrink: 0,
      flexDirection: 'column',
      gap: 4,
      padding: 8,
      backgroundColor: selected ? '#e7f4ef' : '#fbfaf6',
      borderColor: selected ? '#2f8f75' : '#ddd6c8',
      borderWidth: 1,
      borderRadius: 6,
      cursor: 'pointer',
      onClick: () => activeClaimId.set(claim.id),
      semantic: { role: 'button', ariaLabel: `Select ${claim.id}` },
    },
    [
      t(claim.id, 12, '700', '#111827'),
      t(claim.sla, 11, '700', claim.sla === '7m' ? '#b42318' : '#6b7280'),
      t(status === 'Needs evidence' ? 'Needs docs' : status, 10, '700', selected ? '#166534' : '#6b7280'),
    ],
  )
}

function compactTraceReplayPanel(): UIElement {
  const summary = summarizeAgentTrace(trace.value)
  const pending = pendingApprovals.value
  const replay = gateway.getReplay()
  const lastAction = replay.actions.at(-1)

  return panel([
    box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, [
      t('Gateway Trace', 14, '700', '#111827'),
      t(`${summary.eventCount} events`, 12, '700', '#0f766e'),
    ]),
    copy(lastMessage.value),
    box({ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, [
      metric('Completed', String(summary.completedCount), '#166534'),
      metric('Pending', String(pending.length), pending.length > 0 ? '#b45309' : '#166534'),
      metric('Replay', String(replay.actions.length), '#5b5bd6'),
    ]),
    ...pending.map(approval =>
      box(
        {
          flexDirection: 'column',
          gap: 8,
          padding: 10,
          backgroundColor: '#fff7ed',
          borderColor: '#fdba74',
          borderWidth: 1,
          borderRadius: 6,
        },
        [
          t('Pending approval', 12, '800', '#9a3412'),
          copy(`${approval.target.title} / ${approval.reason}`, '#7c2d12'),
          box({ flexDirection: 'row', gap: 8 }, [
            approvalDecisionButton('Approve', '#166534', () => {
              void decidePendingApproval(approval.id, true)
            }),
            approvalDecisionButton('Deny', '#b42318', () => {
              void decidePendingApproval(approval.id, false)
            }),
          ]),
        ],
      ),
    ),
    ...(lastAction
      ? [copy(`${lastAction.actionId}: ${lastAction.status}. ${lastAction.frameAfter?.id ?? 'pending'}.`)]
      : [copy('Replay records before/after frames once an agent action runs.')]),
  ])
}

function compactView(claim: Claim, size: { width: number; height: number }): UIElement {
  const status = statusByClaim.value[claim.id] ?? claim.status

  return box(
    {
      width: size.width,
      height: size.height,
      flexDirection: 'column',
      gap: 10,
      padding: 12,
      backgroundColor: '#f6f3ec',
    },
    [
      box({ flexDirection: 'column', gap: 3 }, [
        t('Claims Agent Gateway', 21, '800', '#111827'),
        copy('Agent contracts, policy gates, and replayable approvals.'),
      ]),
      panel([
        t('Review Queue', 14, '700', '#111827'),
        box({ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, claims.map(compactQueueItem)),
      ]),
      panel([
        t(`${claim.id} / ${claim.claimant}`, 16, '700', '#111827'),
        copy(claim.summary),
        box({ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, [
          metric('Risk', claim.riskScore, Number(claim.riskScore) >= 0.7 ? '#b42318' : '#166534'),
          metric('Amount', claim.amount, '#0f766e'),
          metric('Status', status, status === 'Approved' ? '#166534' : '#7c2d12'),
        ]),
      ]),
      panel([
        t('Contracted Operations', 14, '700', '#111827'),
        box({ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, [
          compactActionButton('approve-payout', '#0f766e'),
          compactActionButton('request-evidence', '#7c3aed'),
          compactActionButton('escalate-claim', '#b45309'),
          compactActionButton('export-audit-packet', '#1d4ed8'),
          compactAgentPlanButton(),
        ]),
      ]),
      compactTraceReplayPanel(),
    ],
  )
}

function view(): UIElement {
  const claim = activeClaim()
  const size = viewport.value
  const compact = size.width < 980
  const narrow = size.width < 760

  if (narrow) {
    return compactView(claim, size)
  }

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
      box({ flexDirection: narrow ? 'column' : 'row', justifyContent: 'space-between', alignItems: narrow ? 'stretch' : 'center', gap: 12 }, [
        box({ flexDirection: 'column', gap: 3, flexGrow: 1 }, [
          t('Claims Agent Gateway', 22, '800', '#111827'),
          copy('Enterprise workflow demo: Geometra geometry, explicit action contracts, policy gates, and replayable traces.'),
        ]),
        box({ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, [
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
            replayPanel(),
          ]),
          tracePanel(),
        ],
      ),
    ],
  )
}

function resizeCanvas(): void {
  const width = Math.max(360, Math.round(window.innerWidth))
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

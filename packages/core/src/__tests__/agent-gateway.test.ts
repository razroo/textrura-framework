import type { ComputedLayout } from 'textura'
import { describe, expect, it } from 'vitest'
import { agentAction } from '../agent-contracts.js'
import { createAgentGateway, createAgentGatewayPolicy } from '../agent-gateway.js'
import { box, text } from '../elements.js'

const times = [
  '2026-04-24T12:00:00.000Z',
  '2026-04-24T12:00:01.000Z',
  '2026-04-24T12:00:02.000Z',
  '2026-04-24T12:00:03.000Z',
  '2026-04-24T12:00:04.000Z',
  '2026-04-24T12:00:05.000Z',
]

function clock(): () => string {
  let index = 0
  return () => times[Math.min(index++, times.length - 1)]!
}

function layout(): ComputedLayout {
  return {
    x: 0,
    y: 0,
    width: 240,
    height: 120,
    children: [
      { x: 10, y: 10, width: 120, height: 32, children: [] },
      { x: 10, y: 52, width: 120, height: 32, children: [] },
    ],
  }
}

function tree(disabled = false) {
  return box({}, [
    box({
      onClick: () => undefined,
      semantic: agentAction(
        {
          id: 'approve-payout',
          kind: 'approve',
          title: 'Approve payout',
          risk: 'write',
          requiresConfirmation: true,
        },
        { role: 'button', ariaLabel: 'Approve payout', ariaDisabled: disabled },
      ),
    }),
    text({
      text: 'Export audit packet',
      font: '14px Inter',
      lineHeight: 18,
      semantic: agentAction({
        id: 'export-audit-packet',
        kind: 'export',
        title: 'Export audit packet',
        risk: 'external',
      }),
    }),
  ])
}

describe('agent gateway', () => {
  it('publishes contracted actions from the current frame', () => {
    const gateway = createAgentGateway({ sessionId: 'claims', now: clock() })
    const frame = gateway.setFrame(tree(), layout(), { route: '/claims', id: 'frame-1' })

    expect(frame.id).toBe('frame-1')
    expect(frame.route).toBe('/claims')
    expect(frame.geometry).toMatchObject({
      id: 'frame-1',
      route: '/claims',
      nodes: [
        expect.objectContaining({ id: 'root' }),
        expect.objectContaining({ id: 'approve-payout' }),
        expect.objectContaining({ id: 'export-audit-packet' }),
      ],
    })
    expect(gateway.listActions().map(action => action.id)).toEqual([
      'approve-payout',
      'export-audit-packet',
    ])
  })

  it('requires approval before completing a gated action', async () => {
    const gateway = createAgentGateway({
      sessionId: 'claims',
      now: clock(),
      execute: ({ target }) => ({ action: target.id, ok: true }),
    })
    const frame = gateway.setFrame(tree(), layout(), { id: 'frame-1' })

    const pending = await gateway.requestAction({ actionId: 'approve-payout', frameId: frame.id })
    expect(pending).toMatchObject({
      status: 'awaiting_approval',
      reason: 'approval required',
    })
    expect(pending.approvalId).toBe('claims:approval:1')
    expect(gateway.getTrace().events.map(event => event.status)).toEqual(['requested'])
    expect(gateway.getPendingApprovals()).toHaveLength(1)

    const result = await gateway.approveAction({ approvalId: pending.approvalId!, actor: 'manager' })
    expect(result).toMatchObject({
      status: 'completed',
      output: { action: 'approve-payout', ok: true },
    })
    expect(gateway.getTrace().events.map(event => event.status)).toEqual([
      'requested',
      'approved',
      'completed',
    ])
    expect(gateway.getTrace().events[1]?.actor).toBe('manager')
    expect(gateway.getPendingApprovals()).toEqual([])
    expect(gateway.getReplay().actions[0]).toMatchObject({
      actionId: 'approve-payout',
      status: 'completed',
      approval: { actor: 'manager', approved: true },
      output: { action: 'approve-payout', ok: true },
    })
    gateway.setFrame(tree(), layout(), { id: 'frame-after' })
    expect(gateway.getReplay().actions[0]?.frameAfter?.id).toBe('frame-after')
  })

  it('rejects stale frame requests before execution', async () => {
    const gateway = createAgentGateway({ sessionId: 'claims', now: clock() })
    gateway.setFrame(tree(), layout(), { id: 'frame-2' })

    await expect(gateway.requestAction({ actionId: 'approve-payout', frameId: 'frame-1' })).resolves.toMatchObject({
      status: 'stale_frame',
      reason: 'request frame "frame-1" does not match current frame "frame-2"',
    })
    expect(gateway.getTrace().events.map(event => event.status)).toEqual(['requested', 'denied'])
  })

  it('enforces allowlist and risk policy before execution', async () => {
    const gateway = createAgentGateway({
      sessionId: 'claims',
      now: clock(),
      policy: createAgentGatewayPolicy({
        allowedActionIds: ['approve-payout'],
        allowedRisks: ['write'],
        allowExternalDestructiveByDefault: true,
      }),
      execute: () => {
        throw new Error('must not execute denied actions')
      },
    })
    const frame = gateway.setFrame(tree(), layout())

    await expect(
      gateway.requestAction({ actionId: 'export-audit-packet', frameId: frame.id, approved: true }),
    ).resolves.toMatchObject({
      status: 'denied',
      reason: 'action "export-audit-packet" is not allowlisted',
    })
    expect(gateway.getTrace().events.map(event => event.status)).toEqual(['requested', 'denied'])
  })

  it('denies external and destructive risks by default in policy helper', async () => {
    const gateway = createAgentGateway({
      sessionId: 'claims',
      now: clock(),
      policy: createAgentGatewayPolicy(),
    })
    const frame = gateway.setFrame(tree(), layout())

    await expect(
      gateway.requestAction({ actionId: 'export-audit-packet', frameId: frame.id, approved: true }),
    ).resolves.toMatchObject({
      status: 'denied',
      reason: 'risk "external" is denied by policy',
    })
  })

  it('redacts inputs and outputs in trace and replay', async () => {
    const gateway = createAgentGateway({
      sessionId: 'claims',
      now: clock(),
      redact: (_value, context) => {
        if (context.field === 'input') return '[redacted input]'
        if (context.field === 'output') return '[redacted output]'
        return _value
      },
      execute: () => ({ public: true }),
    })
    const frame = gateway.setFrame(tree(), layout())

    const result = await gateway.requestAction({
      actionId: 'approve-payout',
      frameId: frame.id,
      approved: true,
      input: { ssn: '123-45-6789' },
    })

    expect(result).toMatchObject({ status: 'completed', output: '[redacted output]' })
    expect(gateway.getTrace().events[0]?.input).toBe('[redacted input]')
    expect(gateway.getReplay().actions[0]?.request.input).toBe('[redacted input]')
    expect(gateway.getReplay().actions[0]?.output).toBe('[redacted output]')
  })

  it('rejects disabled targets', async () => {
    const gateway = createAgentGateway({ sessionId: 'claims', now: clock() })
    const frame = gateway.setFrame(tree(true), layout())

    await expect(
      gateway.requestAction({ actionId: 'approve-payout', frameId: frame.id, approved: true }),
    ).resolves.toMatchObject({
      status: 'disabled',
      reason: 'action "approve-payout" is disabled',
    })
  })

  it('notifies approval and result hooks without changing execution', async () => {
    const approvalIds: string[] = []
    const statuses: string[] = []
    const gateway = createAgentGateway({
      sessionId: 'claims',
      now: clock(),
      execute: ({ target }) => ({ action: target.id, ok: true }),
      onApprovalRequired: approval => {
        approvalIds.push(approval.id)
      },
      onActionResult: result => {
        statuses.push(result.status)
      },
    })
    const frame = gateway.setFrame(tree(), layout(), { id: 'frame-1' })

    const pending = await gateway.requestAction({ actionId: 'approve-payout', frameId: frame.id })
    expect(approvalIds).toEqual(['claims:approval:1'])
    expect(statuses).toEqual(['awaiting_approval'])

    await expect(gateway.approveAction({ approvalId: pending.approvalId!, actor: 'manager' })).resolves.toMatchObject({
      status: 'completed',
    })
    expect(statuses).toEqual(['awaiting_approval', 'completed'])
  })
})

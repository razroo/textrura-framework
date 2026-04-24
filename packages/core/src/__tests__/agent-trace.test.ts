import { describe, expect, it } from 'vitest'
import { appendAgentTraceEvent, createAgentTrace, summarizeAgentTrace } from '../agent-trace.js'

describe('agent trace', () => {
  it('appends immutable trace events with stable ids and default timestamps', () => {
    const trace = createAgentTrace('claims-session', '2026-04-24T12:00:00.000Z')
    const requested = appendAgentTraceEvent(trace, {
      actionId: 'approve-payout',
      status: 'requested',
      timestamp: '2026-04-24T12:00:01.000Z',
      actor: 'agent',
    })
    const completed = appendAgentTraceEvent(requested, {
      actionId: 'approve-payout',
      status: 'completed',
      timestamp: '2026-04-24T12:00:02.000Z',
      output: { status: 'approved' },
    })

    expect(trace.events).toEqual([])
    expect(requested.events[0]?.id).toBe('claims-session:1')
    expect(completed.events[1]).toMatchObject({
      id: 'claims-session:2',
      actionId: 'approve-payout',
      status: 'completed',
      output: { status: 'approved' },
    })
  })

  it('summarizes completed, failed, denied, and pending actions', () => {
    let trace = createAgentTrace('gateway-run', '2026-04-24T12:00:00.000Z')
    trace = appendAgentTraceEvent(trace, {
      actionId: 'request-evidence',
      status: 'requested',
      timestamp: '2026-04-24T12:00:01.000Z',
    })
    trace = appendAgentTraceEvent(trace, {
      actionId: 'approve-payout',
      status: 'completed',
      timestamp: '2026-04-24T12:00:02.000Z',
    })
    trace = appendAgentTraceEvent(trace, {
      actionId: 'export-audit-packet',
      status: 'failed',
      timestamp: '2026-04-24T12:00:03.000Z',
      error: 'policy denied external export',
    })
    trace = appendAgentTraceEvent(trace, {
      actionId: 'escalate-claim',
      status: 'denied',
      timestamp: '2026-04-24T12:00:04.000Z',
    })
    trace = appendAgentTraceEvent(trace, {
      actionId: 'request-evidence',
      status: 'approved',
      timestamp: '2026-04-24T12:00:05.000Z',
    })

    expect(summarizeAgentTrace(trace)).toEqual({
      sessionId: 'gateway-run',
      startedAt: '2026-04-24T12:00:00.000Z',
      eventCount: 5,
      completedCount: 1,
      failedCount: 1,
      deniedCount: 1,
      pendingActionIds: ['request-evidence'],
    })
  })
})

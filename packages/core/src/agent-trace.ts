export type AgentTraceStatus = 'requested' | 'approved' | 'denied' | 'completed' | 'failed'

export interface AgentTraceEvent {
  id: string
  actionId: string
  status: AgentTraceStatus
  timestamp: string
  actor?: string
  input?: unknown
  output?: unknown
  error?: string
  message?: string
}

export interface AgentTrace {
  sessionId: string
  startedAt: string
  events: AgentTraceEvent[]
}

export interface AgentTraceSummary {
  sessionId: string
  startedAt: string
  eventCount: number
  completedCount: number
  failedCount: number
  deniedCount: number
  pendingActionIds: string[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function eventId(sessionId: string, index: number): string {
  return `${sessionId}:${index + 1}`
}

export function createAgentTrace(sessionId: string, startedAt = nowIso()): AgentTrace {
  return { sessionId, startedAt, events: [] }
}

export function appendAgentTraceEvent(
  trace: AgentTrace,
  event: Omit<AgentTraceEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: string },
): AgentTrace {
  return {
    ...trace,
    events: [
      ...trace.events,
      {
        id: event.id ?? eventId(trace.sessionId, trace.events.length),
        timestamp: event.timestamp ?? nowIso(),
        actionId: event.actionId,
        status: event.status,
        ...(event.actor !== undefined ? { actor: event.actor } : {}),
        ...(event.input !== undefined ? { input: event.input } : {}),
        ...(event.output !== undefined ? { output: event.output } : {}),
        ...(event.error !== undefined ? { error: event.error } : {}),
        ...(event.message !== undefined ? { message: event.message } : {}),
      },
    ],
  }
}

export function summarizeAgentTrace(trace: AgentTrace): AgentTraceSummary {
  const terminalByAction = new Map<string, AgentTraceStatus>()
  for (const event of trace.events) {
    terminalByAction.set(event.actionId, event.status)
  }
  const pendingActionIds = [...terminalByAction.entries()]
    .filter(([, status]) => status === 'requested' || status === 'approved')
    .map(([actionId]) => actionId)

  return {
    sessionId: trace.sessionId,
    startedAt: trace.startedAt,
    eventCount: trace.events.length,
    completedCount: trace.events.filter(event => event.status === 'completed').length,
    failedCount: trace.events.filter(event => event.status === 'failed').length,
    deniedCount: trace.events.filter(event => event.status === 'denied').length,
    pendingActionIds,
  }
}

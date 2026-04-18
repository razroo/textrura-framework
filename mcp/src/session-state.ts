import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  ParallelMcpOrchestrator,
  SqliteParallelMcpStore,
  type JsonObject,
  type JsonValue,
} from '@razroo/parallel-mcp'

interface SessionLifecycleTarget {
  id: string
  url: string
  isolated?: boolean
  proxyReusable?: boolean
  updateRevision: number
  layout: Record<string, unknown> | null
  tree: Record<string, unknown> | null
  ws: { readyState: number }
  connectTrace?: { mode?: string } | null
  cachedA11y?: { meta?: { pageUrl?: string } } | null
  lifecycleTaskId?: string
  lifecycleTaskKind?: string
  lifecycleLeaseId?: string
  lifecycleWorkerId?: string
  lifecycleFinalized?: boolean
}

const SESSION_NAMESPACE = 'geometra-mcp-session'
const SESSION_TASK_KEY = 'session.live'
const SESSION_LEASE_MS = 60_000
const SESSION_SWEEP_MS = 15_000
const SESSION_WORKER_PREFIX = `geometra-mcp:${process.pid}`

function resolveSessionStateFile(): string {
  const raw = process.env.GEOMETRA_MCP_STATE_FILE?.trim()
  if (raw) {
    mkdirSync(path.dirname(raw), { recursive: true })
    return raw
  }
  const dir = path.join(homedir(), '.geometra-mcp')
  mkdirSync(dir, { recursive: true })
  return path.join(dir, `parallel-mcp-${process.pid}.sqlite`)
}

const orchestrator = new ParallelMcpOrchestrator(
  new SqliteParallelMcpStore({ filename: resolveSessionStateFile() }),
  { defaultLeaseMs: SESSION_LEASE_MS },
)

const leaseSweep = setInterval(() => {
  try {
    orchestrator.expireLeases()
  } catch {
    /* ignore background lease sweep failures */
  }
}, SESSION_SWEEP_MS)
leaseSweep.unref()

function extractPageUrl(target: SessionLifecycleTarget): string | null {
  const cached = target.cachedA11y?.meta?.pageUrl
  if (typeof cached === 'string' && cached.length > 0) return cached
  const semantic = (target.tree as { semantic?: { pageUrl?: unknown } } | null | undefined)?.semantic
  if (semantic && typeof semantic.pageUrl === 'string' && semantic.pageUrl.length > 0) return semantic.pageUrl
  return null
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (Array.isArray(value)) {
    return value.map(item => toJsonValue(item))
  }
  if (typeof value === 'object') {
    const object: JsonObject = {}
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue
      object[key] = toJsonValue(entry)
    }
    return object
  }
  return String(value)
}

function buildSessionContext(
  target: SessionLifecycleTarget,
  label: string,
  extra?: Record<string, unknown>,
): JsonObject {
  return {
    sessionId: target.id,
    label,
    transportUrl: target.url,
    pageUrl: extractPageUrl(target),
    isolated: target.isolated === true,
    proxyReusable: target.proxyReusable === true,
    wsReadyState: target.ws.readyState,
    updateRevision: target.updateRevision,
    hasLayout: target.layout !== null,
    hasTree: target.tree !== null,
    connectMode: target.connectTrace?.mode ?? null,
    ...(extra ? { extra: toJsonValue(extra) } : {}),
  }
}

function liveTaskIdFor(sessionId: string): string {
  return `${sessionId}:live`
}

function liveTaskKindFor(sessionId: string): string {
  return `session.live:${sessionId}`
}

function workerIdFor(sessionId: string): string {
  return `${SESSION_WORKER_PREFIX}:${sessionId}`
}

export function initializeSessionLifecycle(
  target: SessionLifecycleTarget,
  options?: { pageUrl?: string; transportMode?: string },
): void {
  const sessionId = target.id
  const taskId = liveTaskIdFor(sessionId)
  const taskKind = liveTaskKindFor(sessionId)
  const workerId = workerIdFor(sessionId)

  orchestrator.createRun({
    id: sessionId,
    namespace: SESSION_NAMESPACE,
    metadata: toJsonValue({
      transportMode: options?.transportMode ?? 'direct-ws',
      isolated: target.isolated === true,
    }),
    context: buildSessionContext(target, 'session.initialized', {
      requestedPageUrl: options?.pageUrl ?? null,
    }),
  })

  orchestrator.enqueueTask({
    id: taskId,
    runId: sessionId,
    key: SESSION_TASK_KEY,
    kind: taskKind,
    input: toJsonValue({
      transportUrl: target.url,
      requestedPageUrl: options?.pageUrl ?? null,
    }),
  })

  const claimed = orchestrator.claimNextTask({
    workerId,
    kinds: [taskKind],
    leaseMs: SESSION_LEASE_MS,
  })

  if (!claimed || claimed.task.id !== taskId) {
    throw new Error(`Failed to initialize durable session task for ${sessionId}`)
  }

  orchestrator.markTaskRunning({
    taskId,
    leaseId: claimed.lease.id,
    workerId,
  })

  target.lifecycleTaskId = taskId
  target.lifecycleTaskKind = taskKind
  target.lifecycleLeaseId = claimed.lease.id
  target.lifecycleWorkerId = workerId
  target.lifecycleFinalized = false
}

export function heartbeatSessionLifecycle(target: SessionLifecycleTarget): void {
  if (target.lifecycleFinalized || !target.lifecycleTaskId || !target.lifecycleLeaseId || !target.lifecycleWorkerId) return
  orchestrator.heartbeatLease({
    taskId: target.lifecycleTaskId,
    leaseId: target.lifecycleLeaseId,
    workerId: target.lifecycleWorkerId,
    leaseMs: SESSION_LEASE_MS,
  })
}

export function recordSessionSnapshot(
  target: SessionLifecycleTarget,
  label: string,
  extra?: Record<string, unknown>,
): void {
  if (!target.lifecycleTaskId) return
  orchestrator.appendContextSnapshot({
    runId: target.id,
    taskId: target.lifecycleTaskId,
    scope: 'run',
    label,
    payload: buildSessionContext(target, label, extra),
  })
}

export function completeSessionLifecycle(
  target: SessionLifecycleTarget,
  reason: string,
  extra?: Record<string, unknown>,
): void {
  if (target.lifecycleFinalized || !target.lifecycleTaskId || !target.lifecycleLeaseId || !target.lifecycleWorkerId) return
  orchestrator.completeTask({
    taskId: target.lifecycleTaskId,
    leaseId: target.lifecycleLeaseId,
    workerId: target.lifecycleWorkerId,
    output: toJsonValue({
      reason,
      ...(extra ? { extra } : {}),
    }),
    nextContext: buildSessionContext(target, 'session.completed', {
      reason,
      ...(extra ? { ...extra } : {}),
    }),
    nextContextLabel: 'session.completed',
  })
  target.lifecycleFinalized = true
}

export function failSessionLifecycle(
  target: SessionLifecycleTarget,
  error: string,
  extra?: Record<string, unknown>,
): void {
  if (target.lifecycleFinalized || !target.lifecycleTaskId || !target.lifecycleLeaseId || !target.lifecycleWorkerId) return
  recordSessionSnapshot(target, 'session.failed', {
    error,
    ...(extra ? { ...extra } : {}),
  })
  orchestrator.failTask({
    taskId: target.lifecycleTaskId,
    leaseId: target.lifecycleLeaseId,
    workerId: target.lifecycleWorkerId,
    error,
    metadata: extra ? toJsonValue(extra) : undefined,
  })
  target.lifecycleFinalized = true
}

export function shutdownSessionLifecycleRegistry(): void {
  clearInterval(leaseSweep)
  orchestrator.close()
}

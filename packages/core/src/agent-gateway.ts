import type { ComputedLayout } from 'textura'
import type { AgentTrace } from './agent-trace.js'
import type { AgentActionRisk, UIElement } from './types.js'
import { appendAgentTraceEvent, createAgentTrace } from './agent-trace.js'
import { collectAgentActions, type AgentActionTarget } from './agent-contracts.js'

export type AgentGatewayActionStatus =
  | 'completed'
  | 'awaiting_approval'
  | 'denied'
  | 'disabled'
  | 'failed'
  | 'no_frame'
  | 'not_found'
  | 'stale_frame'
  | 'approval_not_found'

export interface AgentGatewayFrame {
  id: string
  route?: string
  createdAt: string
  tree: UIElement
  layout: ComputedLayout
  actions: AgentActionTarget[]
  trace: AgentTrace
}

export interface AgentGatewayFrameSnapshot {
  id: string
  route?: string
  createdAt: string
  layout: ComputedLayout
  actions: AgentActionTarget[]
}

export interface AgentGatewayFrameOptions {
  id?: string
  route?: string
  createdAt?: string
}

export interface AgentGatewayActionRequest {
  actionId: string
  frameId?: string
  actor?: string
  approvalActor?: string
  approved?: boolean
  input?: unknown
}

export interface AgentGatewayApprovalRequest {
  approvalId: string
  actor?: string
  approved?: boolean
}

export type AgentGatewayPolicyDecision =
  | {
      allow: true
      /** Require approval in addition to any requirement declared by the contract. */
      requiresApproval?: boolean
      reason?: string
    }
  | {
      allow: false
      reason: string
    }

export interface AgentGatewayPolicyContext {
  frame: AgentGatewayFrame
  target: AgentActionTarget
  request: AgentGatewayActionRequest
}

export type AgentGatewayPolicy = (context: AgentGatewayPolicyContext) => AgentGatewayPolicyDecision

export interface AgentGatewayExecuteContext extends AgentGatewayPolicyContext {
  approved: boolean
}

export type AgentGatewayExecutor = (context: AgentGatewayExecuteContext) => unknown | Promise<unknown>

export interface AgentGatewayPendingApproval {
  id: string
  actionId: string
  frameId: string
  requestedAt: string
  target: AgentActionTarget
  request: AgentGatewayActionRequest
  reason: string
}

export interface AgentGatewayActionResult {
  status: AgentGatewayActionStatus
  actionId: string
  frameId?: string
  approvalId?: string
  replayId?: string
  target?: AgentActionTarget
  reason?: string
  output?: unknown
  trace: AgentTrace
}

export interface AgentGatewayReplayAction {
  id: string
  actionId: string
  status: AgentGatewayActionStatus
  requestedAt: string
  completedAt?: string
  frameBefore?: AgentGatewayFrameSnapshot
  frameAfter?: AgentGatewayFrameSnapshot
  request: {
    actor: string
    input?: unknown
  }
  policy?: AgentGatewayPolicyDecision
  approval?: {
    id?: string
    actor?: string
    approved: boolean
    timestamp: string
  }
  output?: unknown
  error?: string
}

export interface AgentGatewayReplay {
  sessionId: string
  startedAt: string
  trace: AgentTrace
  frames: AgentGatewayFrameSnapshot[]
  actions: AgentGatewayReplayAction[]
}

export type AgentGatewayRedactionField = 'input' | 'output' | 'error'

export interface AgentGatewayRedactionContext {
  field: AgentGatewayRedactionField
  actionId: string
}

export type AgentGatewayRedactor = (value: unknown, context: AgentGatewayRedactionContext) => unknown

export interface AgentGatewayPolicyOptions {
  /** If supplied, only these action ids may run. */
  allowedActionIds?: string[]
  deniedActionIds?: string[]
  /** If supplied, only these risk classes may run. */
  allowedRisks?: AgentActionRisk[]
  /** Risk classes to deny. Defaults to external/destructive unless disabled. */
  deniedRisks?: AgentActionRisk[]
  /** Set true to avoid the default external/destructive deny list. */
  allowExternalDestructiveByDefault?: boolean
  /** Extra risk classes that must be explicitly approved. */
  requireApprovalForRisks?: AgentActionRisk[]
}

export interface AgentGatewayOptions {
  sessionId: string
  startedAt?: string
  now?: () => string
  policy?: AgentGatewayPolicy
  execute?: AgentGatewayExecutor
  redact?: AgentGatewayRedactor
}

export interface AgentGateway {
  setFrame(tree: UIElement, layout: ComputedLayout, options?: AgentGatewayFrameOptions): AgentGatewayFrame
  getFrame(): AgentGatewayFrame | null
  listActions(): AgentActionTarget[]
  getTrace(): AgentTrace
  getReplay(): AgentGatewayReplay
  getPendingApprovals(): AgentGatewayPendingApproval[]
  requestAction(request: AgentGatewayActionRequest): Promise<AgentGatewayActionResult>
  approveAction(request: AgentGatewayApprovalRequest): Promise<AgentGatewayActionResult>
}

interface PendingApprovalRecord extends AgentGatewayPendingApproval {
  replayId: string
  policy: AgentGatewayPolicyDecision
  frame: AgentGatewayFrame
}

function defaultNow(): string {
  return new Date().toISOString()
}

function idSet(values: string[] | undefined): Set<string> | null {
  return values ? new Set(values) : null
}

function riskSet(values: AgentActionRisk[] | undefined): Set<AgentActionRisk> | null {
  return values ? new Set(values) : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function defaultRedact(value: unknown): unknown {
  return value
}

function frameSnapshot(frame: AgentGatewayFrame): AgentGatewayFrameSnapshot {
  return {
    id: frame.id,
    ...(frame.route !== undefined ? { route: frame.route } : {}),
    createdAt: frame.createdAt,
    layout: frame.layout,
    actions: frame.actions,
  }
}

/** Build a simple allowlist/denylist policy for an agent gateway. */
export function createAgentGatewayPolicy(options: AgentGatewayPolicyOptions = {}): AgentGatewayPolicy {
  const allowedActionIds = idSet(options.allowedActionIds)
  const deniedActionIds = idSet(options.deniedActionIds)
  const allowedRisks = riskSet(options.allowedRisks)
  const deniedRisks = riskSet(
    options.deniedRisks ??
      (options.allowExternalDestructiveByDefault === true ? [] : ['external', 'destructive']),
  )
  const requireApprovalForRisks = riskSet(options.requireApprovalForRisks)

  return ({ target }) => {
    if (deniedActionIds?.has(target.id)) {
      return { allow: false, reason: `action "${target.id}" is denied by policy` }
    }
    if (allowedActionIds && !allowedActionIds.has(target.id)) {
      return { allow: false, reason: `action "${target.id}" is not allowlisted` }
    }
    if (deniedRisks?.has(target.risk)) {
      return { allow: false, reason: `risk "${target.risk}" is denied by policy` }
    }
    if (allowedRisks && !allowedRisks.has(target.risk)) {
      return { allow: false, reason: `risk "${target.risk}" is not allowed` }
    }
    return {
      allow: true,
      ...(requireApprovalForRisks?.has(target.risk) ? { requiresApproval: true } : {}),
    }
  }
}

/** Create a frame-bound gateway for listing, policy-checking, executing, tracing, and replaying agent actions. */
export function createAgentGateway(options: AgentGatewayOptions): AgentGateway {
  const now = options.now ?? defaultNow
  const redact = options.redact ?? defaultRedact
  let trace = createAgentTrace(options.sessionId, options.startedAt ?? now())
  let frame: AgentGatewayFrame | null = null
  let frameIndex = 0
  let approvalIndex = 0
  let replayIndex = 0
  const frames: AgentGatewayFrameSnapshot[] = []
  const replayActions: AgentGatewayReplayAction[] = []
  const pendingApprovals = new Map<string, PendingApprovalRecord>()
  const replayActionsNeedingFrameAfter = new Set<string>()

  const redactValue = (actionId: string, field: AgentGatewayRedactionField, value: unknown): unknown =>
    redact(value, { actionId, field })

  const withTrace = (): void => {
    if (frame) frame = { ...frame, trace }
  }

  const append = (
    actionId: string,
    status: 'requested' | 'approved' | 'denied' | 'completed' | 'failed',
    event: {
      actor?: string
      input?: unknown
      output?: unknown
      error?: string
      message?: string
    } = {},
  ): void => {
    trace = appendAgentTraceEvent(trace, {
      actionId,
      status,
      timestamp: now(),
      ...(event.actor !== undefined ? { actor: event.actor } : {}),
      ...(event.input !== undefined ? { input: redactValue(actionId, 'input', event.input) } : {}),
      ...(event.output !== undefined ? { output: redactValue(actionId, 'output', event.output) } : {}),
      ...(event.error !== undefined ? { error: String(redactValue(actionId, 'error', event.error)) } : {}),
      ...(event.message !== undefined ? { message: event.message } : {}),
    })
    withTrace()
  }

  const createReplayAction = (
    request: AgentGatewayActionRequest,
    status: AgentGatewayActionStatus,
    frameBefore?: AgentGatewayFrameSnapshot,
  ): AgentGatewayReplayAction => {
    replayIndex++
    const action: AgentGatewayReplayAction = {
      id: `${options.sessionId}:replay:${replayIndex}`,
      actionId: request.actionId,
      status,
      requestedAt: now(),
      ...(frameBefore ? { frameBefore } : {}),
      request: {
        actor: request.actor ?? 'agent',
        ...(request.input !== undefined ? { input: redactValue(request.actionId, 'input', request.input) } : {}),
      },
    }
    replayActions.push(action)
    return action
  }

  const finishReplayAction = (
    replayId: string,
    patch: Omit<Partial<AgentGatewayReplayAction>, 'id' | 'actionId' | 'request' | 'requestedAt'>,
  ): void => {
    const index = replayActions.findIndex(action => action.id === replayId)
    if (index === -1) return
    replayActions[index] = {
      ...replayActions[index]!,
      ...patch,
      completedAt: patch.completedAt ?? now(),
    }
    replayActionsNeedingFrameAfter.add(replayId)
  }

  const reject = (
    request: AgentGatewayActionRequest,
    status: AgentGatewayActionStatus,
    reason: string,
    target?: AgentActionTarget,
  ): AgentGatewayActionResult => {
    const replay = createReplayAction(request, status, frame ? frameSnapshot(frame) : undefined)
    append(request.actionId, 'requested', {
      actor: request.actor ?? 'agent',
      input: request.input,
      message: reason,
    })
    append(request.actionId, 'denied', {
      actor: 'gateway',
      error: reason,
    })
    finishReplayAction(replay.id, {
      status,
      error: String(redactValue(request.actionId, 'error', reason)),
    })
    return {
      status,
      actionId: request.actionId,
      replayId: replay.id,
      ...(frame ? { frameId: frame.id } : {}),
      ...(target ? { target } : {}),
      reason,
      trace,
    }
  }

  const executeApproved = async (
    sourceFrame: AgentGatewayFrame,
    target: AgentActionTarget,
    request: AgentGatewayActionRequest,
    replayId: string,
    approved: boolean,
    approvalActor?: string,
  ): Promise<AgentGatewayActionResult> => {
    const approvalTimestamp = now()
    if (approved) {
      append(request.actionId, 'approved', {
        actor: approvalActor ?? request.approvalActor ?? 'human',
        message: 'approval recorded',
      })
    } else {
      append(request.actionId, 'denied', {
        actor: approvalActor ?? request.approvalActor ?? 'human',
        error: 'approval denied',
      })
      finishReplayAction(replayId, {
        status: 'denied',
        approval: { actor: approvalActor ?? request.approvalActor ?? 'human', approved: false, timestamp: approvalTimestamp },
        error: 'approval denied',
      })
      return {
        status: 'denied',
        actionId: request.actionId,
        frameId: sourceFrame.id,
        replayId,
        target,
        reason: 'approval denied',
        trace,
      }
    }

    try {
      const output = await options.execute?.({ frame: sourceFrame, target, request, approved: true })
      const redactedOutput = output === undefined ? { accepted: true } : redactValue(request.actionId, 'output', output)
      append(request.actionId, 'completed', {
        actor: 'gateway',
        output: redactedOutput,
      })
      finishReplayAction(replayId, {
        status: 'completed',
        approval: { actor: approvalActor ?? request.approvalActor ?? 'human', approved: true, timestamp: approvalTimestamp },
        output: redactedOutput,
      })
      return {
        status: 'completed',
        actionId: request.actionId,
        frameId: sourceFrame.id,
        replayId,
        target,
        output: redactedOutput,
        trace,
      }
    } catch (error) {
      const message = errorMessage(error)
      append(request.actionId, 'failed', {
        actor: 'gateway',
        error: message,
      })
      finishReplayAction(replayId, {
        status: 'failed',
        approval: { actor: approvalActor ?? request.approvalActor ?? 'human', approved: true, timestamp: approvalTimestamp },
        error: String(redactValue(request.actionId, 'error', message)),
      })
      return {
        status: 'failed',
        actionId: request.actionId,
        frameId: sourceFrame.id,
        replayId,
        target,
        reason: message,
        trace,
      }
    }
  }

  return {
    setFrame(tree, layout, frameOptions = {}) {
      frameIndex++
      const createdAt = frameOptions.createdAt ?? now()
      frame = {
        id: frameOptions.id ?? `${options.sessionId}:frame:${frameIndex}`,
        ...(frameOptions.route !== undefined ? { route: frameOptions.route } : {}),
        createdAt,
        tree,
        layout,
        actions: collectAgentActions(tree, layout),
        trace,
      }
      const snapshot = frameSnapshot(frame)
      frames.push(snapshot)
      for (const replayId of replayActionsNeedingFrameAfter) {
        const action = replayActions.find(item => item.id === replayId)
        if (action && !action.frameAfter) {
          action.frameAfter = snapshot
        }
      }
      replayActionsNeedingFrameAfter.clear()
      return frame
    },

    getFrame() {
      return frame
    },

    listActions() {
      return frame?.actions ?? []
    },

    getTrace() {
      return trace
    },

    getReplay() {
      return {
        sessionId: options.sessionId,
        startedAt: trace.startedAt,
        trace,
        frames,
        actions: replayActions,
      }
    },

    getPendingApprovals() {
      return [...pendingApprovals.values()].map(record => ({
        id: record.id,
        actionId: record.actionId,
        frameId: record.frameId,
        requestedAt: record.requestedAt,
        target: record.target,
        request: record.request,
        reason: record.reason,
      }))
    },

    async requestAction(request) {
      if (!frame) {
        return reject(request, 'no_frame', 'no current frame is available')
      }
      if (request.frameId && request.frameId !== frame.id) {
        return reject(request, 'stale_frame', `request frame "${request.frameId}" does not match current frame "${frame.id}"`)
      }

      const sourceFrame = frame
      const target = sourceFrame.actions.find(action => action.id === request.actionId)
      if (!target) {
        return reject(request, 'not_found', `action "${request.actionId}" is not present in the current frame`)
      }
      if (!target.enabled) {
        return reject(request, 'disabled', `action "${request.actionId}" is disabled`, target)
      }

      const replay = createReplayAction(request, 'awaiting_approval', frameSnapshot(sourceFrame))
      append(request.actionId, 'requested', {
        actor: request.actor ?? 'agent',
        input: request.input,
        message: target.title,
      })

      const policyDecision = options.policy?.({ frame: sourceFrame, target, request }) ?? { allow: true }
      replay.policy = policyDecision
      if (!policyDecision.allow) {
        append(request.actionId, 'denied', {
          actor: 'gateway',
          error: policyDecision.reason,
        })
        finishReplayAction(replay.id, {
          status: 'denied',
          error: String(redactValue(request.actionId, 'error', policyDecision.reason)),
        })
        return {
          status: 'denied',
          actionId: request.actionId,
          frameId: sourceFrame.id,
          replayId: replay.id,
          target,
          reason: policyDecision.reason,
          trace,
        }
      }

      const approvalRequired = policyDecision.requiresApproval === true || target.requiresConfirmation
      if (approvalRequired && request.approved !== true) {
        approvalIndex++
        const approvalId = `${options.sessionId}:approval:${approvalIndex}`
        pendingApprovals.set(approvalId, {
          id: approvalId,
          actionId: request.actionId,
          frameId: sourceFrame.id,
          requestedAt: now(),
          target,
          request,
          reason: policyDecision.reason ?? 'approval required',
          replayId: replay.id,
          policy: policyDecision,
          frame: sourceFrame,
        })
        return {
          status: 'awaiting_approval',
          actionId: request.actionId,
          frameId: sourceFrame.id,
          approvalId,
          replayId: replay.id,
          target,
          reason: policyDecision.reason ?? 'approval required',
          trace,
        }
      }

      return executeApproved(sourceFrame, target, request, replay.id, true, request.approvalActor)
    },

    async approveAction(request) {
      const pending = pendingApprovals.get(request.approvalId)
      if (!pending) {
        return {
          status: 'approval_not_found',
          actionId: '',
          approvalId: request.approvalId,
          reason: `approval "${request.approvalId}" is not pending`,
          trace,
        }
      }
      pendingApprovals.delete(request.approvalId)
      return executeApproved(
        pending.frame,
        pending.target,
        pending.request,
        pending.replayId,
        request.approved !== false,
        request.actor,
      )
    },
  }
}

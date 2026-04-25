import type { App } from './app.js'
import type { KeyboardHitEvent } from './types.js'
import { setFocus } from './focus.js'
import {
  createAgentGeometrySnapshot,
  type AgentGeometryNode,
  type AgentGeometrySnapshot,
  type AgentGeometrySnapshotOptions,
} from './semantic-geometry.js'

export type AgentRuntimeCommand = 'click' | 'focus' | 'type' | 'key'

export interface AgentRuntimeActionLogEntry {
  id: string
  command: AgentRuntimeCommand
  targetId?: string
  timestamp: string
  input?: unknown
  status: 'completed' | 'failed'
  handled?: boolean
  error?: string
  before?: AgentGeometrySnapshot
  after?: AgentGeometrySnapshot
}

export interface AgentRuntimeCommandResult {
  status: 'completed' | 'failed'
  command: AgentRuntimeCommand
  targetId?: string
  handled: boolean
  before?: AgentGeometrySnapshot
  after?: AgentGeometrySnapshot
  error?: string
}

export interface AgentRuntimeTypeOptions {
  replace?: boolean
}

export interface AgentRuntimeReplayResult {
  attempted: number
  completed: number
  failed: number
  results: AgentRuntimeCommandResult[]
}

export interface AgentRuntime {
  inspect(options?: AgentGeometrySnapshotOptions): AgentGeometrySnapshot | null
  snapshot(options?: AgentGeometrySnapshotOptions): AgentGeometrySnapshot | null
  click(targetId: string, extra?: Record<string, unknown>): AgentRuntimeCommandResult
  focus(targetId: string): AgentRuntimeCommandResult
  type(targetId: string, value: string, options?: AgentRuntimeTypeOptions): AgentRuntimeCommandResult
  key(key: string, init?: Partial<Omit<KeyboardHitEvent, 'target' | 'key'>>): AgentRuntimeCommandResult
  getActionLog(): AgentRuntimeActionLogEntry[]
  replay(entries: AgentRuntimeActionLogEntry[]): AgentRuntimeReplayResult
}

export interface AgentRuntimeOptions {
  route?: string
  now?: () => string
}

interface ResolvedNode {
  node: AgentGeometryNode
  element: NonNullable<App['tree']>
  layout: NonNullable<App['layout']>
}

function defaultNow(): string {
  return new Date().toISOString()
}

function entryId(index: number): string {
  return `agent-runtime:${index + 1}`
}

function keyboardEvent(key: string, init: Partial<Omit<KeyboardHitEvent, 'target' | 'key'>> = {}): Omit<KeyboardHitEvent, 'target'> {
  return {
    key,
    code: init.code ?? key,
    shiftKey: init.shiftKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function resolvePath(app: App, node: AgentGeometryNode): ResolvedNode | null {
  if (!app.tree || !app.layout) return null
  let element = app.tree
  let layout = app.layout
  for (const index of node.path) {
    if (element.kind !== 'box') return null
    const child = element.children[index]
    const childLayout = layout.children[index]
    if (!child || !childLayout) return null
    element = child
    layout = childLayout
  }
  return { node, element, layout }
}

function frameFor(app: App, options: AgentRuntimeOptions, override: AgentGeometrySnapshotOptions = {}): AgentGeometrySnapshot | null {
  if (!app.tree || !app.layout) return null
  const base = options.route !== undefined ? { route: options.route } : {}
  return createAgentGeometrySnapshot(app.tree, app.layout, {
    ...base,
    ...override,
  })
}

function findNode(app: App, options: AgentRuntimeOptions, targetId: string): ResolvedNode | null {
  const frame = frameFor(app, options)
  const node = frame?.nodes.find(candidate => candidate.id === targetId)
  return node ? resolvePath(app, node) : null
}

/** Create a frame-bound agent runtime for direct UI inspection and interaction by stable semantic geometry ids. */
export function createAgentRuntime(app: App, options: AgentRuntimeOptions = {}): AgentRuntime {
  const now = options.now ?? defaultNow
  const log: AgentRuntimeActionLogEntry[] = []

  const record = (
    command: AgentRuntimeCommand,
    targetId: string | undefined,
    input: unknown,
    result: AgentRuntimeCommandResult,
  ): AgentRuntimeCommandResult => {
    log.push({
      id: entryId(log.length),
      command,
      ...(targetId !== undefined ? { targetId } : {}),
      timestamp: now(),
      ...(input !== undefined ? { input } : {}),
      status: result.status,
      handled: result.handled,
      ...(result.error !== undefined ? { error: result.error } : {}),
      ...(result.before !== undefined ? { before: result.before } : {}),
      ...(result.after !== undefined ? { after: result.after } : {}),
    })
    return result
  }

  const fail = (
    command: AgentRuntimeCommand,
    targetId: string | undefined,
    input: unknown,
    before: AgentGeometrySnapshot | undefined,
    error: string,
  ): AgentRuntimeCommandResult =>
    record(command, targetId, input, {
      status: 'failed',
      command,
      ...(targetId !== undefined ? { targetId } : {}),
      handled: false,
      ...(before !== undefined ? { before } : {}),
      error,
    })

  const runtime: AgentRuntime = {
    inspect(snapshotOptions) {
      return frameFor(app, options, snapshotOptions)
    },

    snapshot(snapshotOptions) {
      return frameFor(app, options, snapshotOptions)
    },

    click(targetId, extra) {
      const before = frameFor(app, options)
      const resolved = findNode(app, options, targetId)
      if (!resolved) return fail('click', targetId, extra, before ?? undefined, `target "${targetId}" was not found`)
      if (!resolved.node.enabled) return fail('click', targetId, extra, before ?? undefined, `target "${targetId}" is disabled`)
      const { x, y, width, height } = resolved.node.hitTarget
      const handled = app.dispatch('onClick', x + width / 2, y + height / 2, extra)
      const after = frameFor(app, options)
      return record('click', targetId, extra, {
        status: 'completed',
        command: 'click',
        targetId,
        handled,
        ...(before !== null ? { before } : {}),
        ...(after !== null ? { after } : {}),
      })
    },

    focus(targetId) {
      const before = frameFor(app, options)
      const resolved = findNode(app, options, targetId)
      if (!resolved) return fail('focus', targetId, undefined, before ?? undefined, `target "${targetId}" was not found`)
      if (resolved.element.kind !== 'box' || !resolved.node.focusable) {
        return fail('focus', targetId, undefined, before ?? undefined, `target "${targetId}" is not focusable`)
      }
      setFocus(resolved.element, resolved.layout)
      const after = frameFor(app, options)
      return record('focus', targetId, undefined, {
        status: 'completed',
        command: 'focus',
        targetId,
        handled: true,
        ...(before !== null ? { before } : {}),
        ...(after !== null ? { after } : {}),
      })
    },

    type(targetId, value, typeOptions) {
      const before = frameFor(app, options)
      const focusResult = runtime.focus(targetId)
      if (focusResult.status === 'failed') {
        return fail('type', targetId, { value, ...typeOptions }, before ?? undefined, focusResult.error ?? 'focus failed')
      }
      if (typeOptions?.replace) {
        app.dispatchKey('onKeyDown', keyboardEvent('a', { metaKey: true, code: 'KeyA' }))
        app.dispatchKey('onKeyDown', keyboardEvent('Backspace', { code: 'Backspace' }))
      }
      let handled = false
      for (const char of value) {
        handled = app.dispatchKey('onKeyDown', keyboardEvent(char)) || handled
        app.dispatchKey('onKeyUp', keyboardEvent(char))
      }
      const after = frameFor(app, options)
      return record('type', targetId, { value, ...typeOptions }, {
        status: 'completed',
        command: 'type',
        targetId,
        handled,
        ...(before !== null ? { before } : {}),
        ...(after !== null ? { after } : {}),
      })
    },

    key(key, init) {
      const before = frameFor(app, options)
      try {
        const handled = app.dispatchKey('onKeyDown', keyboardEvent(key, init))
        app.dispatchKey('onKeyUp', keyboardEvent(key, init))
        const after = frameFor(app, options)
        return record('key', undefined, { key, ...init }, {
          status: 'completed',
          command: 'key',
          handled,
          ...(before !== null ? { before } : {}),
          ...(after !== null ? { after } : {}),
        })
      } catch (error) {
        return fail('key', undefined, { key, ...init }, before ?? undefined, errorMessage(error))
      }
    },

    getActionLog() {
      return [...log]
    },

    replay(entries) {
      const results: AgentRuntimeCommandResult[] = []
      for (const entry of entries) {
        if (entry.command === 'click' && entry.targetId) {
          results.push(runtime.click(entry.targetId, entry.input as Record<string, unknown> | undefined))
        } else if (entry.command === 'focus' && entry.targetId) {
          results.push(runtime.focus(entry.targetId))
        } else if (entry.command === 'type' && entry.targetId) {
          const input = entry.input as { value?: unknown; replace?: boolean } | undefined
          results.push(runtime.type(
            entry.targetId,
            typeof input?.value === 'string' ? input.value : '',
            input?.replace !== undefined ? { replace: input.replace } : undefined,
          ))
        } else if (entry.command === 'key') {
          const input = entry.input as { key?: unknown } | undefined
          results.push(runtime.key(typeof input?.key === 'string' ? input.key : 'Enter'))
        }
      }
      return {
        attempted: entries.length,
        completed: results.filter(result => result.status === 'completed').length,
        failed: results.filter(result => result.status === 'failed').length,
        results,
      }
    },
  }
  return runtime
}

import { describe, it, expect, vi } from 'vitest'
import { signal, streamText, batch } from '@geometra/core'
import type { AgentState, AgentCallbacks, AgentStatus, AgentMessage } from '../types.js'

/**
 * Unit tests for agent state management and callback logic.
 *
 * We test the state/callback wiring without starting a real WebSocket server,
 * since the server integration is already covered by @geometra/server tests.
 */

function createTestState(): AgentState {
  return {
    messages: signal<AgentMessage[]>([]),
    status: signal<AgentStatus>('idle'),
    streamingText: streamText(),
    error: signal<string | null>(null),
  }
}

function createTestCallbacks(
  state: AgentState,
  onUpdate?: () => void,
): AgentCallbacks {
  return {
    append(chunk: string): void {
      state.status.set('streaming')
      state.streamingText.append(chunk)
      onUpdate?.()
    },
    set(text: string): void {
      state.status.set('streaming')
      state.streamingText.set(text)
      onUpdate?.()
    },
    setStatus(s: AgentStatus): void {
      state.status.set(s)
      onUpdate?.()
    },
    done(metadata?: Record<string, unknown>): void {
      const finalText = state.streamingText.signal.peek()
      state.streamingText.done()
      batch(() => {
        if (finalText.length > 0) {
          const current = state.messages.peek()
          state.messages.set([
            ...current,
            {
              role: 'assistant',
              content: finalText,
              timestamp: new Date().toISOString(),
              metadata,
            },
          ])
        }
        state.streamingText.clear()
        state.streamingText.done()
        state.status.set('idle')
      })
      onUpdate?.()
    },
  }
}

describe('AgentState', () => {
  it('starts with empty state', () => {
    const state = createTestState()
    expect(state.messages.value).toEqual([])
    expect(state.status.value).toBe('idle')
    expect(state.streamingText.value).toBe('')
    expect(state.error.value).toBeNull()
  })
})

describe('AgentCallbacks', () => {
  it('append sets status to streaming', async () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)
    cb.append('hello')
    expect(state.status.value).toBe('streaming')
    await Promise.resolve()
    expect(state.streamingText.value).toBe('hello')
  })

  it('set replaces streaming text', () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)
    cb.set('full text')
    expect(state.streamingText.value).toBe('full text')
    expect(state.status.value).toBe('streaming')
  })

  it('setStatus updates status', () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)
    cb.setStatus('thinking')
    expect(state.status.value).toBe('thinking')
    cb.setStatus('tool-use')
    expect(state.status.value).toBe('tool-use')
  })

  it('done finalizes message and resets state', () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)
    cb.set('response text')
    cb.done({ model: 'test' })

    expect(state.messages.value).toHaveLength(1)
    expect(state.messages.value[0]!.role).toBe('assistant')
    expect(state.messages.value[0]!.content).toBe('response text')
    expect(state.messages.value[0]!.metadata).toEqual({ model: 'test' })
    expect(state.status.value).toBe('idle')
    expect(state.streamingText.value).toBe('')
  })

  it('done with empty text does not add message', () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)
    cb.done()
    expect(state.messages.value).toHaveLength(0)
    expect(state.status.value).toBe('idle')
  })

  it('multiple append + done accumulates full response', async () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)
    cb.append('Hello ')
    cb.append('world')
    await Promise.resolve() // flush microtask coalescing
    cb.done()

    expect(state.messages.value).toHaveLength(1)
    expect(state.messages.value[0]!.content).toBe('Hello world')
  })

  it('calls onUpdate on each callback', () => {
    const state = createTestState()
    const onUpdate = vi.fn()
    const cb = createTestCallbacks(state, onUpdate)
    cb.setStatus('thinking')
    cb.set('text')
    cb.done()
    expect(onUpdate).toHaveBeenCalledTimes(3)
  })
})

describe('user message flow', () => {
  it('simulates full user → agent cycle', async () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)

    // User sends message
    batch(() => {
      const current = state.messages.peek()
      state.messages.set([
        ...current,
        { role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      ])
      state.status.set('thinking')
    })
    expect(state.messages.value).toHaveLength(1)
    expect(state.status.value).toBe('thinking')

    // Agent streams response
    cb.append('Hi ')
    cb.append('there!')
    await Promise.resolve()
    expect(state.status.value).toBe('streaming')
    expect(state.streamingText.value).toBe('Hi there!')

    // Agent finalizes
    cb.done()
    expect(state.messages.value).toHaveLength(2)
    expect(state.messages.value[1]!.role).toBe('assistant')
    expect(state.messages.value[1]!.content).toBe('Hi there!')
    expect(state.status.value).toBe('idle')
  })
})

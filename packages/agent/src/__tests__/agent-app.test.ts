import { describe, it, expect, vi } from 'vitest'
import { signal, streamText, batch, box, text } from '@geometra/core'
import type { UIElement } from '@geometra/core'
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
    panels: signal<Map<string, UIElement>>(new Map()),
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
    showUI(...args: [UIElement] | [string, UIElement]): void {
      const [key, element] = args.length === 1 ? ['main', args[0]] : args
      const next = new Map(state.panels.peek())
      next.set(key, element)
      state.panels.set(next)
      onUpdate?.()
    },
    clearUI(key = 'main'): void {
      const current = state.panels.peek()
      if (!current.has(key)) return
      const next = new Map(current)
      next.delete(key)
      state.panels.set(next)
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

describe('showUI / clearUI', () => {
  it('showUI sets default panel', () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)
    const element = box({ padding: 10 }, [text({ text: 'Hello', font: '14px Inter', lineHeight: 20 })])
    cb.showUI(element)
    expect(state.panels.value.size).toBe(1)
    expect(state.panels.value.get('main')).toBe(element)
  })

  it('showUI with key sets named panel', () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)
    const chart = box({ padding: 10 }, [])
    const table = box({ padding: 20 }, [])
    cb.showUI('chart', chart)
    cb.showUI('table', table)
    expect(state.panels.value.size).toBe(2)
    expect(state.panels.value.get('chart')).toBe(chart)
    expect(state.panels.value.get('table')).toBe(table)
  })

  it('showUI replaces existing panel at same key', () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)
    const v1 = box({}, [text({ text: 'v1', font: '14px Inter', lineHeight: 20 })])
    const v2 = box({}, [text({ text: 'v2', font: '14px Inter', lineHeight: 20 })])
    cb.showUI(v1)
    cb.showUI(v2)
    expect(state.panels.value.size).toBe(1)
    expect(state.panels.value.get('main')).toBe(v2)
  })

  it('clearUI removes default panel', () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)
    cb.showUI(box({}, []))
    expect(state.panels.value.size).toBe(1)
    cb.clearUI()
    expect(state.panels.value.size).toBe(0)
  })

  it('clearUI with key removes named panel', () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)
    cb.showUI('chart', box({}, []))
    cb.showUI('table', box({}, []))
    cb.clearUI('chart')
    expect(state.panels.value.size).toBe(1)
    expect(state.panels.value.has('chart')).toBe(false)
    expect(state.panels.value.has('table')).toBe(true)
  })

  it('clearUI on non-existent key is a no-op', () => {
    const state = createTestState()
    const onUpdate = vi.fn()
    const cb = createTestCallbacks(state, onUpdate)
    cb.clearUI('nonexistent')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('panels persist after done()', () => {
    const state = createTestState()
    const cb = createTestCallbacks(state)
    const panel = box({}, [text({ text: 'data', font: '14px Inter', lineHeight: 20 })])
    cb.showUI(panel)
    cb.set('response')
    cb.done()
    // Panel should still be there
    expect(state.panels.value.size).toBe(1)
    expect(state.panels.value.get('main')).toBe(panel)
    // But message state is reset
    expect(state.status.value).toBe('idle')
  })

  it('showUI calls onUpdate', () => {
    const state = createTestState()
    const onUpdate = vi.fn()
    const cb = createTestCallbacks(state, onUpdate)
    cb.showUI(box({}, []))
    expect(onUpdate).toHaveBeenCalledTimes(1)
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

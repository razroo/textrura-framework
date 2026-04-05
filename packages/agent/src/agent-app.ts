/**
 * Main entry point for the Geometra agent runtime.
 *
 * `createAgentApp()` wires together a WebSocket server, reactive state, and
 * a chat view so that building an LLM-powered agent UI is a single function call.
 */

import { signal, batch, streamText } from '@geometra/core'
import type { UIElement } from '@geometra/core'
import { createServer } from '@geometra/server'
import { chatView } from './chat-view.js'
import type {
  AgentAppOptions,
  AgentApp,
  AgentState,
  AgentMessage,
  AgentCallbacks,
  AgentStatus,
} from './types.js'

/**
 * Create a Geometra agent application.
 *
 * Sets up a WebSocket server with a reactive chat UI. The `onMessage` callback
 * is invoked when the user submits text; use the provided helpers to stream a
 * response back.
 *
 * ```ts
 * const app = await createAgentApp({
 *   port: 3000,
 *   onMessage: async (text, { append, setStatus, done }) => {
 *     setStatus('thinking')
 *     for await (const chunk of myLLM(text)) append(chunk)
 *     done()
 *   },
 * })
 * ```
 */
export async function createAgentApp(options: AgentAppOptions): Promise<AgentApp> {
  // ---- State ---------------------------------------------------------------
  const messages = signal<AgentMessage[]>([])
  const status = signal<AgentStatus>('idle')
  const error = signal<string | null>(null)
  const streaming = streamText()
  const panels = signal<Map<string, UIElement>>(new Map())

  const state: AgentState = {
    messages,
    status,
    streamingText: streaming,
    error,
    panels,
  }

  // ---- System prompt -------------------------------------------------------
  if (options.systemPrompt) {
    messages.set([
      {
        role: 'system',
        content: options.systemPrompt,
        timestamp: new Date().toISOString(),
      },
    ])
  }

  // ---- onMessage handler ---------------------------------------------------
  function handleUserMessage(text: string): void {
    // Add user message
    batch(() => {
      const current = messages.peek()
      messages.set([
        ...current,
        { role: 'user', content: text, timestamp: new Date().toISOString() },
      ])
      error.set(null)
      streaming.clear()
      status.set('thinking')
    })
    server.update()

    // Build callbacks for the agent
    const callbacks: AgentCallbacks = {
      append(chunk: string): void {
        status.set('streaming')
        streaming.append(chunk)
        server.update()
      },
      set(text: string): void {
        status.set('streaming')
        streaming.set(text)
        server.update()
      },
      setStatus(s: AgentStatus): void {
        status.set(s)
        server.update()
      },
      done(metadata?: Record<string, unknown>): void {
        const finalText = streaming.signal.peek()
        streaming.done()
        batch(() => {
          if (finalText.length > 0) {
            const current = messages.peek()
            messages.set([
              ...current,
              {
                role: 'assistant',
                content: finalText,
                timestamp: new Date().toISOString(),
                metadata,
              },
            ])
          }
          streaming.clear()
          streaming.done() // reset to not-streaming after clear
          status.set('idle')
        })
        server.update()
      },
      showUI(...args: [UIElement] | [string, UIElement]): void {
        const [key, element] = args.length === 1 ? ['main', args[0]] : args
        const next = new Map(panels.peek())
        next.set(key, element)
        panels.set(next)
        server.update()
      },
      clearUI(key = 'main'): void {
        const current = panels.peek()
        if (!current.has(key)) return
        const next = new Map(current)
        next.delete(key)
        panels.set(next)
        server.update()
      },
    }

    // Invoke the user's handler (async-safe)
    Promise.resolve()
      .then(() => options.onMessage(text, callbacks))
      .catch((err: unknown) => {
        batch(() => {
          status.set('error')
          error.set(err instanceof Error ? err.message : String(err))
          streaming.done()
        })
        server.update()
      })
  }

  // ---- View ----------------------------------------------------------------
  const viewFn =
    options.view
      ? () => options.view!(state)
      : chatView(state, {
          title: options.title,
          onSubmit: handleUserMessage,
        })

  // ---- Server --------------------------------------------------------------
  const server = await createServer(viewFn, {
    port: options.port ?? 3000,
    width: options.width ?? 800,
    height: options.height ?? 'auto',
    onConnection: options.onConnection,
    onDisconnect: options.onDisconnect,
    onError: options.onError,
  })

  return { server, state }
}

/**
 * Types for the Geometra agent UI runtime.
 */

import type { Signal } from '@geometra/core'
import type { StreamText } from '@geometra/core'
import type { UIElement } from '@geometra/core'
import type { TexturaServerOptions } from '@geometra/server'

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export type MessageRole = 'user' | 'assistant' | 'system'

export interface AgentMessage {
  readonly role: MessageRole
  readonly content: string
  /** ISO timestamp. */
  readonly timestamp: string
  /** Optional metadata (tool names, model, etc.) */
  readonly metadata?: Record<string, unknown>
}

export type AgentStatus = 'idle' | 'thinking' | 'streaming' | 'tool-use' | 'error'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface AgentState {
  /** Full message history. */
  readonly messages: Signal<AgentMessage[]>
  /** Current agent status. */
  readonly status: Signal<AgentStatus>
  /** Active streaming text (assistant's in-progress response). */
  readonly streamingText: StreamText
  /** Last error message, if any. */
  readonly error: Signal<string | null>
  /** Dynamic UI panels keyed by name. The default key is `'main'`. */
  readonly panels: Signal<Map<string, UIElement>>
}

// ---------------------------------------------------------------------------
// Callback helpers passed to onMessage
// ---------------------------------------------------------------------------

export interface AgentCallbacks {
  /** Append a text chunk to the streaming response. */
  append(chunk: string): void
  /** Replace the streaming text entirely. */
  set(text: string): void
  /** Update the agent status indicator. */
  setStatus(status: AgentStatus): void
  /** Finalize the current response and add it to message history. */
  done(metadata?: Record<string, unknown>): void
  /** Display a UIElement in the content panel. Default key is `'main'`. */
  showUI(element: UIElement): void
  /** Display a UIElement in a named content panel. */
  showUI(key: string, element: UIElement): void
  /** Remove a content panel. Default key is `'main'`. */
  clearUI(key?: string): void
}

// ---------------------------------------------------------------------------
// App options
// ---------------------------------------------------------------------------

export interface AgentAppOptions {
  /**
   * Called when the user submits a message. Use the callbacks to stream a
   * response back.
   */
  onMessage: (text: string, callbacks: AgentCallbacks) => void | Promise<void>

  /** Port for the WebSocket server (default: 3000). */
  port?: number
  /** Root layout width (default: 800). */
  width?: number
  /** Root layout height (default: 'auto'). */
  height?: number | 'auto'
  /** System prompt shown as the first message (optional). */
  systemPrompt?: string
  /** Custom view function. Receives agent state, returns UI tree. */
  view?: (state: AgentState) => UIElement
  /** Title shown in the chat header (default: 'Agent'). */
  title?: string
  /** Server hooks forwarded to createServer. */
  onConnection?: TexturaServerOptions['onConnection']
  onDisconnect?: TexturaServerOptions['onDisconnect']
  onError?: TexturaServerOptions['onError']
}

export interface AgentApp {
  /** The underlying Geometra server. */
  readonly server: { update(): void; broadcastData(channel: string, payload: unknown): void; close(): void }
  /** Reactive agent state — read or mutate from outside. */
  readonly state: AgentState
}

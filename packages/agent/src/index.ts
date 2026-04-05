/**
 * @packageDocumentation
 * `@geometra/agent` — AI agent UI runtime for Geometra.
 *
 * Provides `createAgentApp()` to wire up a WebSocket server with reactive
 * chat state and a default chat view, plus building blocks for custom agent UIs.
 */

// Main entry
export { createAgentApp } from './agent-app.js'

// Default chat view (can be used standalone or swapped)
export { chatView } from './chat-view.js'
export type { ChatViewOptions } from './chat-view.js'

// Types
export type {
  AgentAppOptions,
  AgentApp,
  AgentState,
  AgentMessage,
  AgentCallbacks,
  AgentStatus,
  MessageRole,
} from './types.js'

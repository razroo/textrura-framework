/**
 * Default chat view for the agent UI.
 *
 * Renders a message list with streaming response, status indicator, and
 * input field. Fully built from `@geometra/core` and `@geometra/ui` primitives.
 */

import { box, text, signal } from '@geometra/core'
import type { UIElement, EventHandlers } from '@geometra/core'
import { button, input } from '@geometra/ui'
import type { AgentState, AgentStatus } from './types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusLabel(status: AgentStatus): string {
  switch (status) {
    case 'thinking':
      return 'Thinking...'
    case 'streaming':
      return 'Responding...'
    case 'tool-use':
      return 'Using tool...'
    case 'error':
      return 'Error'
    default:
      return ''
  }
}

function statusColor(status: AgentStatus): string {
  switch (status) {
    case 'thinking':
    case 'streaming':
      return '#38bdf8'
    case 'tool-use':
      return '#a78bfa'
    case 'error':
      return '#ef4444'
    default:
      return '#64748b'
  }
}

function messageBubble(role: string, content: string): UIElement {
  const isUser = role === 'user'
  return box(
    {
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '75%' as unknown as number,
      paddingLeft: 12,
      paddingRight: 12,
      paddingTop: 8,
      paddingBottom: 8,
      borderRadius: 12,
      backgroundColor: isUser ? '#2563eb' : '#1e293b',
    },
    [
      text({
        text: content,
        font: '14px Inter, system-ui',
        lineHeight: 20,
        color: isUser ? '#ffffff' : '#e2e8f0',
      }),
    ],
  )
}

// ---------------------------------------------------------------------------
// Input state (module-level signals for the controlled input)
// ---------------------------------------------------------------------------

const inputValue = signal('')
const inputFocused = signal(true)
const inputCaret = signal(0)

// ---------------------------------------------------------------------------
// Chat view
// ---------------------------------------------------------------------------

export interface ChatViewOptions {
  /** Header title (default: 'Agent'). */
  title?: string
  /** Called when user submits a message. */
  onSubmit?: (text: string) => void
}

/**
 * Build the default chat view. Returns a function `() => UIElement` suitable
 * as a view for `createServer`.
 */
export function chatView(
  state: AgentState,
  options: ChatViewOptions = {},
): () => UIElement {
  const title = options.title ?? 'Agent'

  const handleSubmit = (): void => {
    const val = inputValue.peek().trim()
    if (val.length === 0) return
    inputValue.set('')
    inputCaret.set(0)
    options.onSubmit?.(val)
  }

  const handleKeyDown: EventHandlers['onKeyDown'] = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit()
    }
  }

  return () => {
    const messages = state.messages.value
    const status = state.status.value
    const streaming = state.streamingText.value
    const error = state.error.value
    const panelMap = state.panels.value
    const hasPanel = panelMap.size > 0

    // Message list
    const messageElements: UIElement[] = messages.map((m) =>
      messageBubble(m.role, m.content),
    )

    // Streaming response in progress
    if (streaming.length > 0) {
      messageElements.push(messageBubble('assistant', streaming))
    }

    // Status indicator
    const statusText = statusLabel(status)

    // Chat column (messages + status + error)
    const chatColumn = box(
      {
        flexDirection: 'column',
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 0,
      },
      [
        // Messages area
        box(
          {
            flexDirection: 'column',
            flexGrow: 1,
            gap: 8,
            padding: 16,
            overflow: 'scroll',
          },
          messageElements,
        ),

        // Status bar
        ...(statusText.length > 0
          ? [
              box({ paddingLeft: 16, paddingRight: 16, paddingBottom: 4 }, [
                text({
                  text: statusText,
                  font: '12px Inter, system-ui',
                  lineHeight: 16,
                  color: statusColor(status),
                }),
              ]),
            ]
          : []),

        // Error bar
        ...(error
          ? [
              box(
                { paddingLeft: 16, paddingRight: 16, paddingBottom: 4 },
                [
                  text({
                    text: error,
                    font: '12px Inter, system-ui',
                    lineHeight: 16,
                    color: '#ef4444',
                  }),
                ],
              ),
            ]
          : []),
      ],
    )

    // Content panel column (only when panels exist)
    const mainContent: UIElement = hasPanel
      ? box(
          { flexDirection: 'row', flexGrow: 1, gap: 1 },
          [
            chatColumn,
            box(
              {
                flexDirection: 'column',
                flexGrow: 1,
                flexBasis: 0,
                minWidth: 0,
                gap: 8,
                padding: 16,
                borderColor: '#1e293b',
                borderWidth: 1,
                overflow: 'scroll',
              },
              [...panelMap.values()],
            ),
          ],
        )
      : chatColumn

    return box(
      {
        flexDirection: 'column',
        width: '100%' as unknown as number,
        height: '100%' as unknown as number,
        backgroundColor: '#0f172a',
      },
      [
        // Header
        box(
          {
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 12,
            paddingBottom: 12,
            borderColor: '#1e293b',
            borderWidth: 1,
          },
          [
            text({
              text: title,
              font: 'bold 16px Inter, system-ui',
              lineHeight: 22,
              color: '#f8fafc',
            }),
          ],
        ),

        // Main content (chat-only or split with panels)
        mainContent,

        // Input area
        box(
          {
            flexDirection: 'row',
            gap: 8,
            padding: 12,
            borderColor: '#1e293b',
            borderWidth: 1,
            alignItems: 'center',
          },
          [
            box({ flexGrow: 1 }, [
              input(inputValue.value, 'Type a message...', {
                focused: inputFocused.value,
                caretOffset: inputCaret.value,
                onCaretOffsetChange: (offset) => inputCaret.set(offset),
                onKeyDown: handleKeyDown,
              }),
            ]),
            button('Send', handleSubmit),
          ],
        ),
      ],
    )
  }
}

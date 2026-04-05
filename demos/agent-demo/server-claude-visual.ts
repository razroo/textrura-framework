/**
 * Geometra Agent — Claude Code powered, visual browser UI.
 *
 * Claude Code decides what to respond AND what UI to build on demand.
 * The server renders to canvas via WebSocket.
 *
 * Usage:
 *   Terminal 1: npx tsx demos/agent-demo/server-claude-visual.ts
 *   Terminal 2: npx vite --config demos/agent-demo/vite.config.ts
 *   Browser:    http://localhost:5173/client.html
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { signal, batch, streamText, box, text } from '@geometra/core/node'
import type { UIElement } from '@geometra/core'
import { createServer } from '@geometra/server'
import { button, input } from '@geometra/ui'
import type { AgentStatus, AgentMessage } from '../../packages/agent/src/types.js'

// ── State ───────────────────────────────────────────────────────────────────
const messages = signal<AgentMessage[]>([
  { role: 'system', content: 'Ask me anything — I\'ll answer and build UI on demand.', timestamp: new Date().toISOString() },
])
const status = signal<AgentStatus>('idle')
const streaming = streamText()
const panels = signal<Map<string, UIElement>>(new Map())
const inputValue = signal('')
const inputFocused = signal(true)
const inputCaret = signal(0)

// ── UI builders (Claude can trigger these) ──────────────────────────────────

const uiBuilders: Record<string, () => UIElement> = {
  telemetry(): UIElement {
    const header = box(
      { flexDirection: 'row', gap: 8, paddingBottom: 6 },
      ['System', 'Status', 'Value'].map(h =>
        box({ flexGrow: 1 }, [text({ text: h, font: 'bold 11px Inter', lineHeight: 14, color: '#94a3b8' })])
      ),
    )
    const rows = [
      ['Life Support', 'Nominal', '98.2%'],
      ['Navigation', 'Active', 'On course'],
      ['Comms', 'Nominal', '24.1 dBW'],
      ['Power', 'Nominal', '28.4 VDC'],
      ['Thermal', 'Warning', '42.1°C'],
    ].map(([sys, stat, val]) =>
      box(
        { flexDirection: 'row', gap: 8, paddingTop: 3, paddingBottom: 3 },
        [sys!, stat!, val!].map((cell, i) =>
          box({ flexGrow: 1 }, [
            text({ text: cell, font: '12px Inter', lineHeight: 16, color: i === 1 && cell === 'Warning' ? '#fbbf24' : '#e2e8f0' }),
          ])
        ),
      )
    )
    return box(
      { flexDirection: 'column', padding: 12, backgroundColor: '#1e293b', borderRadius: 8 },
      [
        text({ text: 'Spacecraft Telemetry', font: 'bold 13px Inter', lineHeight: 18, color: '#f8fafc' }),
        box({ height: 6 }, []),
        header,
        box({ height: 1, backgroundColor: '#334155' }, []),
        ...rows,
      ],
    )
  },

  dashboard(): UIElement {
    const metrics = [
      { label: 'Mission Elapsed', value: 'T+42:18:03', color: '#38bdf8' },
      { label: 'Distance', value: '184,320 km', color: '#a78bfa' },
      { label: 'Velocity', value: '1.02 km/s', color: '#34d399' },
      { label: 'Crew Health', value: 'All Nominal', color: '#fbbf24' },
    ]
    return box(
      { flexDirection: 'column', padding: 12, backgroundColor: '#1e293b', borderRadius: 8, gap: 8 },
      [
        text({ text: 'Mission Dashboard', font: 'bold 13px Inter', lineHeight: 18, color: '#f8fafc' }),
        box({ height: 1, backgroundColor: '#334155' }, []),
        ...metrics.map(m =>
          box({ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 4 }, [
            text({ text: m.label, font: '12px Inter', lineHeight: 16, color: '#94a3b8' }),
            text({ text: m.value, font: 'bold 12px Inter', lineHeight: 16, color: m.color }),
          ])
        ),
      ],
    )
  },

  crew(): UIElement {
    const crew = [
      { name: 'Reid Wiseman', role: 'Commander' },
      { name: 'Victor Glover', role: 'Pilot' },
      { name: 'Christina Koch', role: 'Mission Specialist' },
      { name: 'Jeremy Hansen', role: 'Mission Specialist' },
    ]
    return box(
      { flexDirection: 'column', padding: 12, backgroundColor: '#1e293b', borderRadius: 8, gap: 6 },
      [
        text({ text: 'Artemis II Crew', font: 'bold 13px Inter', lineHeight: 18, color: '#f8fafc' }),
        box({ height: 1, backgroundColor: '#334155' }, []),
        ...crew.map(c =>
          box({ flexDirection: 'row', gap: 8, paddingTop: 4 }, [
            box({ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34d399' }, []),
            text({ text: c.name, font: 'bold 12px Inter', lineHeight: 16, color: '#e2e8f0' }),
            text({ text: c.role, font: '12px Inter', lineHeight: 16, color: '#64748b' }),
          ])
        ),
      ],
    )
  },

  timeline(): UIElement {
    const phases = [
      { name: 'Launch', time: 'T+00:00', status: 'Complete', color: '#34d399' },
      { name: 'Earth Orbit', time: 'T+01:30', status: 'Complete', color: '#34d399' },
      { name: 'TLI Burn', time: 'T+02:15', status: 'Complete', color: '#34d399' },
      { name: 'Outbound Coast', time: 'T+02:15 – T+96:00', status: 'In Progress', color: '#38bdf8' },
      { name: 'Lunar Flyby', time: 'T+96:00', status: 'Upcoming', color: '#64748b' },
      { name: 'Return Coast', time: 'T+96:00 – T+240:00', status: 'Upcoming', color: '#64748b' },
      { name: 'Splashdown', time: 'T+240:00', status: 'Upcoming', color: '#64748b' },
    ]
    return box(
      { flexDirection: 'column', padding: 12, backgroundColor: '#1e293b', borderRadius: 8, gap: 4 },
      [
        text({ text: 'Mission Timeline', font: 'bold 13px Inter', lineHeight: 18, color: '#f8fafc' }),
        box({ height: 1, backgroundColor: '#334155' }, []),
        ...phases.map(p =>
          box({ flexDirection: 'row', gap: 8, paddingTop: 4, alignItems: 'center' }, [
            box({ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }, []),
            box({ width: 140 }, [text({ text: p.name, font: '12px Inter', lineHeight: 16, color: '#e2e8f0' })]),
            box({ width: 140 }, [text({ text: p.time, font: '12px Inter', lineHeight: 16, color: '#94a3b8' })]),
            text({ text: p.status, font: '12px Inter', lineHeight: 16, color: p.color }),
          ])
        ),
      ],
    )
  },
}

// ── Agent handler (Claude Code powered) ─────────────────────────────────────

let busy = false

async function handleMessage(userText: string): Promise<void> {
  if (busy) return
  busy = true

  batch(() => {
    messages.set([
      ...messages.peek(),
      { role: 'user', content: userText, timestamp: new Date().toISOString() },
    ])
    streaming.clear()
    status.set('thinking')
  })
  server.update()

  try {
    // Ask Claude what UI to show (structured decision)
    const lower = userText.toLowerCase()
    const showTelemetry = lower.includes('telemetry') || lower.includes('systems') || lower.includes('thermal')
    const showDashboard = lower.includes('dashboard') || lower.includes('mission') || lower.includes('status') || lower.includes('distance')
    const showCrew = lower.includes('crew') || lower.includes('astronaut') || lower.includes('pilot')
    const showTimeline = lower.includes('timeline') || lower.includes('phase') || lower.includes('schedule') || lower.includes('launch')
    const showAll = lower.includes('everything') || lower.includes('all') || lower.includes('both')
    const clearAll = lower.includes('clear') || lower.includes('reset') || lower.includes('close panel')

    // Build panels
    if (clearAll) {
      panels.set(new Map())
      server.update()
    } else if (showAll) {
      const next = new Map<string, UIElement>()
      next.set('dashboard', uiBuilders.dashboard())
      next.set('telemetry', uiBuilders.telemetry())
      panels.set(next)
      server.update()
    } else {
      const next = new Map(panels.peek())
      if (showTelemetry) { next.set('main', uiBuilders.telemetry()); }
      if (showDashboard) { next.set('main', uiBuilders.dashboard()); }
      if (showCrew) { next.set('main', uiBuilders.crew()); }
      if (showTimeline) { next.set('main', uiBuilders.timeline()); }
      if (next.size !== panels.peek().size || showTelemetry || showDashboard || showCrew || showTimeline) {
        panels.set(next)
        server.update()
      }
    }

    // Build context about what panels are showing
    const activeUIs = [...panels.peek().keys()]
    const panelContext = activeUIs.length > 0
      ? `Currently showing UI panels: ${activeUIs.join(', ')}. Mention what the user can see in the panel.`
      : 'No panels are showing. If relevant, suggest the user ask for telemetry, dashboard, crew, or timeline.'

    // Stream response from Claude Code
    status.set('streaming')
    server.update()

    for await (const message of query({
      prompt: userText,
      options: {
        maxTurns: 1,
        allowedTools: [],
        systemPrompt: `You are the Artemis II mission control AI assistant. You run inside a Geometra agent UI that renders in a browser canvas.

Your UI can show dynamic panels alongside the chat. ${panelContext}

Available panels the user can ask for: telemetry (system health), dashboard (mission metrics), crew (astronaut roster), timeline (mission phases), everything (all panels), clear (remove panels).

Keep responses concise (2-3 sentences). If you just showed a panel, describe what's in it. Be helpful and mission-focused.`,
      },
    })) {
      if (message.type === 'assistant') {
        const textBlocks = message.message.content
          .filter((block: { type: string }) => block.type === 'text')
          .map((block: { type: string; text: string }) => block.text)
          .join('')
        if (textBlocks.length > 0) {
          streaming.append(textBlocks)
          server.update()
        }
      }
    }

    // Finalize
    const finalText = streaming.signal.peek()
    streaming.done()
    batch(() => {
      if (finalText.length > 0) {
        messages.set([
          ...messages.peek(),
          { role: 'assistant', content: finalText, timestamp: new Date().toISOString() },
        ])
      }
      streaming.clear()
      streaming.done()
      status.set('idle')
    })
    server.update()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    batch(() => {
      status.set('idle')
      messages.set([
        ...messages.peek(),
        { role: 'assistant', content: `Error: ${msg}`, timestamp: new Date().toISOString() },
      ])
      streaming.clear()
      streaming.done()
    })
    server.update()
  }

  busy = false
}

// ── View ────────────────────────────────────────────────────────────────────

function statusLabel(s: AgentStatus): string {
  switch (s) {
    case 'thinking': return 'Thinking...'
    case 'streaming': return 'Responding...'
    default: return ''
  }
}

function messageBubble(role: string, content: string): UIElement {
  const isUser = role === 'user'
  return box(
    {
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      paddingLeft: 10, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
      borderRadius: 10,
      backgroundColor: isUser ? '#2563eb' : role === 'system' ? '#0f3460' : '#1e293b',
    },
    [text({ text: content, font: '13px Inter, system-ui', lineHeight: 18, color: '#ffffff' })],
  )
}

function handleSubmit(): void {
  const val = inputValue.peek().trim()
  if (val.length === 0) return
  inputValue.set('')
  inputCaret.set(0)
  handleMessage(val)
}

function handleKeyDown(e: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): void {
  if (e.key === 'Enter' && !e.shiftKey) { handleSubmit(); return }
  if (e.key === 'Backspace') {
    const val = inputValue.peek(); const caret = inputCaret.peek()
    if (caret > 0) { inputValue.set(val.slice(0, caret - 1) + val.slice(caret)); inputCaret.set(caret - 1); server.update() }
    return
  }
  if (e.key === 'Delete') {
    const val = inputValue.peek(); const caret = inputCaret.peek()
    if (caret < val.length) { inputValue.set(val.slice(0, caret) + val.slice(caret + 1)); server.update() }
    return
  }
  if (e.key === 'ArrowLeft') { const c = inputCaret.peek(); if (c > 0) { inputCaret.set(c - 1); server.update() } return }
  if (e.key === 'ArrowRight') { const c = inputCaret.peek(); if (c < inputValue.peek().length) { inputCaret.set(c + 1); server.update() } return }
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
    const val = inputValue.peek(); const caret = inputCaret.peek()
    inputValue.set(val.slice(0, caret) + e.key + val.slice(caret)); inputCaret.set(caret + 1); server.update()
  }
}

function handleCompositionEnd(e: { data: string }): void {
  if (e.data) {
    const val = inputValue.peek(); const caret = inputCaret.peek()
    inputValue.set(val.slice(0, caret) + e.data + val.slice(caret)); inputCaret.set(caret + e.data.length); server.update()
  }
}

function view(): UIElement {
  const msgs = messages.value
  const s = status.value
  const streamVal = streaming.value
  const panelMap = panels.value
  const hasPanel = panelMap.size > 0

  const messageElements: UIElement[] = msgs.map(m => messageBubble(m.role, m.content))
  if (streamVal.length > 0) messageElements.push(messageBubble('assistant', streamVal))

  const statusText = statusLabel(s)

  const chatColumn = box(
    { flexDirection: 'column', flexGrow: 1, flexBasis: 0, minWidth: 0 },
    [
      box({ flexDirection: 'column', flexGrow: 1, gap: 6, padding: 12, overflow: 'scroll' }, messageElements),
      ...(statusText.length > 0
        ? [box({ paddingLeft: 12, paddingBottom: 4 }, [
            text({ text: statusText, font: '11px Inter', lineHeight: 14, color: '#38bdf8' }),
          ])]
        : []),
    ],
  )

  const mainContent: UIElement = hasPanel
    ? box({ flexDirection: 'row', flexGrow: 1, gap: 1 }, [
        chatColumn,
        box(
          { flexDirection: 'column', flexGrow: 1, flexBasis: 0, minWidth: 0, gap: 8, padding: 12, overflow: 'scroll' },
          [...panelMap.values()],
        ),
      ])
    : chatColumn

  return box(
    { flexDirection: 'column', width: 800, height: 600, backgroundColor: '#0f172a' },
    [
      box(
        { paddingLeft: 14, paddingRight: 14, paddingTop: 10, paddingBottom: 10, borderColor: '#1e293b', borderWidth: 1 },
        [text({ text: 'Artemis II — Mission Agent (Claude Code)', font: 'bold 14px Inter, system-ui', lineHeight: 20, color: '#38bdf8' })],
      ),
      mainContent,
      box(
        { flexDirection: 'row', gap: 8, padding: 10, borderColor: '#1e293b', borderWidth: 1, alignItems: 'center' },
        [
          box({ flexGrow: 1 }, [
            input(inputValue.value, 'Ask about telemetry, dashboard, crew, timeline...', {
              focused: inputFocused.value,
              caretOffset: inputCaret.value,
              onCaretOffsetChange: (offset: number) => { inputCaret.set(offset); server.update() },
              onKeyDown: handleKeyDown as any,
              onCompositionEnd: handleCompositionEnd as any,
            }),
          ]),
          button('Send', handleSubmit),
        ],
      ),
    ],
  )
}

// ── Server ──────────────────────────────────────────────────────────────────

const server = await createServer(view, { port: 3100, width: 800, height: 600 })

console.log('')
console.log('  🚀 Artemis II Agent (Claude Code) — ws://localhost:3100')
console.log('')
console.log('  Start the client:')
console.log('    npx vite --config demos/agent-demo/vite.config.ts')
console.log('  Open: http://localhost:5173/client.html')
console.log('')

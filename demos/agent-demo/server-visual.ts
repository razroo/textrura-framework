/**
 * Geometra Agent — Visual server demo.
 *
 * Runs a WebSocket server with the agent chat UI + showUI panels.
 * Open client.html via Vite to see the rendered UI in a browser canvas.
 *
 * Usage:
 *   Terminal 1: npx tsx demos/agent-demo/server-visual.ts
 *   Terminal 2: npx vite --config demos/agent-demo/vite.config.ts
 *   Browser:    http://localhost:5173/client.html
 */
import { signal, batch, streamText, box, text } from '@geometra/core/node'
import type { UIElement } from '@geometra/core'
import { createServer } from '@geometra/server'
import { button, input } from '@geometra/ui'
import type { AgentStatus, AgentMessage } from '../../packages/agent/src/types.js'

// ── State ───────────────────────────────────────────────────────────────────
const messages = signal<AgentMessage[]>([
  { role: 'system', content: 'Welcome! Ask me to show telemetry, a dashboard, mission status, or anything else.', timestamp: new Date().toISOString() },
])
const status = signal<AgentStatus>('idle')
const error = signal<string | null>(null)
const streaming = streamText()
const panels = signal<Map<string, UIElement>>(new Map())
const inputValue = signal('')
const inputFocused = signal(true)
const inputCaret = signal(0)

// ── UI builders ─────────────────────────────────────────────────────────────

function buildTelemetryTable(): UIElement {
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
}

function buildDashboard(): UIElement {
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
}

function buildCrewRoster(): UIElement {
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
}

// ── Agent handler ───────────────────────────────────────────────────────────

async function handleMessage(userText: string): Promise<void> {
  // Add user message
  batch(() => {
    messages.set([
      ...messages.peek(),
      { role: 'user', content: userText, timestamp: new Date().toISOString() },
    ])
    error.set(null)
    streaming.clear()
    status.set('thinking')
  })
  server.update()

  await sleep(400)

  const lower = userText.toLowerCase()

  // Decide what UI to show
  if (lower.includes('telemetry') || lower.includes('systems')) {
    const next = new Map(panels.peek())
    next.set('main', buildTelemetryTable())
    panels.set(next)
    server.update()
    await streamResponse('Here\'s the current telemetry. Thermal is running warm at 42.1°C — above nominal range. All other systems are green.')
  } else if (lower.includes('dashboard') || lower.includes('mission') || lower.includes('status')) {
    const next = new Map(panels.peek())
    next.set('main', buildDashboard())
    panels.set(next)
    server.update()
    await streamResponse('Mission dashboard is up. Artemis II is 184,320 km out at T+42 hours. All crew nominal.')
  } else if (lower.includes('crew') || lower.includes('astronaut')) {
    const next = new Map(panels.peek())
    next.set('main', buildCrewRoster())
    panels.set(next)
    server.update()
    await streamResponse('The Artemis II crew roster: Commander Wiseman, Pilot Glover, and Mission Specialists Koch and Hansen. All crew health indicators nominal.')
  } else if (lower.includes('clear') || lower.includes('reset') || lower.includes('close')) {
    panels.set(new Map())
    server.update()
    await streamResponse('Panels cleared. Ask me about telemetry, the mission dashboard, or the crew to see on-demand UI.')
  } else if (lower.includes('both') || lower.includes('all') || lower.includes('everything')) {
    const next = new Map<string, UIElement>()
    next.set('dashboard', buildDashboard())
    next.set('telemetry', buildTelemetryTable())
    panels.set(next)
    server.update()
    await streamResponse('Showing both the mission dashboard and telemetry. The split panel renders multiple UIElements side by side.')
  } else {
    await streamResponse('I can show you on-demand UI! Try asking for: "show telemetry", "mission dashboard", "crew roster", "show everything", or "clear panels".')
  }
}

async function streamResponse(response: string): Promise<void> {
  status.set('streaming')
  const words = response.split(' ')
  for (const word of words) {
    streaming.append(word + ' ')
    server.update()
    await sleep(50)
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
}

// ── View ────────────────────────────────────────────────────────────────────

function statusLabel(s: AgentStatus): string {
  switch (s) {
    case 'thinking': return 'Thinking...'
    case 'streaming': return 'Responding...'
    case 'tool-use': return 'Building UI...'
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
  if (e.key === 'Enter' && !e.shiftKey) {
    handleSubmit()
    return
  }
  if (e.key === 'Backspace') {
    const val = inputValue.peek()
    const caret = inputCaret.peek()
    if (caret > 0) {
      inputValue.set(val.slice(0, caret - 1) + val.slice(caret))
      inputCaret.set(caret - 1)
      server.update()
    }
    return
  }
  if (e.key === 'Delete') {
    const val = inputValue.peek()
    const caret = inputCaret.peek()
    if (caret < val.length) {
      inputValue.set(val.slice(0, caret) + val.slice(caret + 1))
      server.update()
    }
    return
  }
  if (e.key === 'ArrowLeft') {
    const caret = inputCaret.peek()
    if (caret > 0) { inputCaret.set(caret - 1); server.update() }
    return
  }
  if (e.key === 'ArrowRight') {
    const caret = inputCaret.peek()
    if (caret < inputValue.peek().length) { inputCaret.set(caret + 1); server.update() }
    return
  }
  if (e.key === 'Home' || (e.key === 'a' && (e.metaKey || e.ctrlKey))) {
    inputCaret.set(0)
    server.update()
    return
  }
  if (e.key === 'End' || (e.key === 'e' && e.ctrlKey)) {
    inputCaret.set(inputValue.peek().length)
    server.update()
    return
  }
  // Single printable character
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
    const val = inputValue.peek()
    const caret = inputCaret.peek()
    inputValue.set(val.slice(0, caret) + e.key + val.slice(caret))
    inputCaret.set(caret + 1)
    server.update()
  }
}

function handleCompositionEnd(e: { data: string }): void {
  if (e.data) {
    const val = inputValue.peek()
    const caret = inputCaret.peek()
    inputValue.set(val.slice(0, caret) + e.data + val.slice(caret))
    inputCaret.set(caret + e.data.length)
    server.update()
  }
}

function view(): UIElement {
  const msgs = messages.value
  const s = status.value
  const streamVal = streaming.value
  const panelMap = panels.value
  const hasPanel = panelMap.size > 0

  const messageElements: UIElement[] = msgs.map(m => messageBubble(m.role, m.content))
  if (streamVal.length > 0) {
    messageElements.push(messageBubble('assistant', streamVal))
  }

  const statusText = statusLabel(s)

  // Chat column
  const chatColumn = box(
    { flexDirection: 'column', flexGrow: 1, flexBasis: 0, minWidth: 0 },
    [
      box(
        { flexDirection: 'column', flexGrow: 1, gap: 6, padding: 12, overflow: 'scroll' },
        messageElements,
      ),
      ...(statusText.length > 0
        ? [box({ paddingLeft: 12, paddingBottom: 4 }, [
            text({ text: statusText, font: '11px Inter', lineHeight: 14, color: '#38bdf8' }),
          ])]
        : []),
    ],
  )

  // Content panel column
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
      // Header
      box(
        { paddingLeft: 14, paddingRight: 14, paddingTop: 10, paddingBottom: 10, borderColor: '#1e293b', borderWidth: 1 },
        [text({ text: 'Artemis II — Mission Agent', font: 'bold 14px Inter, system-ui', lineHeight: 20, color: '#38bdf8' })],
      ),
      // Main
      mainContent,
      // Input
      box(
        { flexDirection: 'row', gap: 8, padding: 10, borderColor: '#1e293b', borderWidth: 1, alignItems: 'center' },
        [
          box({ flexGrow: 1 }, [
            input(inputValue.value, 'Ask about telemetry, dashboard, crew...', {
              focused: inputFocused.value,
              caretOffset: inputCaret.value,
              onCaretOffsetChange: (offset: number) => { inputCaret.set(offset); server.update() },
              onKeyDown: handleKeyDown,
              onCompositionEnd: handleCompositionEnd,
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
console.log('  Geometra Agent server running on ws://localhost:3100')
console.log('')
console.log('  To see the UI, run in another terminal:')
console.log('    npx vite --config demos/agent-demo/vite.config.ts')
console.log('  Then open: http://localhost:5173/client.html')
console.log('')

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

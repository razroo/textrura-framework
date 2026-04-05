/**
 * Self-contained agent SDK demo — runs entirely in the terminal.
 *
 * Demonstrates: createAgentApp, streamText coalescing, AgentCallbacks,
 * showUI (dynamic UI panels), and reactive state updates.
 *
 * Run: npx tsx demos/agent-demo/run.ts
 */
import { signal, batch, streamText, effect, box, text, scene3d, sphere, line, ambientLight, directionalLight } from '../../packages/core/src/index.js'
import type { UIElement } from '../../packages/core/src/index.js'
import type { AgentState, AgentCallbacks, AgentStatus, AgentMessage } from '../../packages/agent/src/types.js'

// ── Colors ──────────────────────────────────────────────────────────────────
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

// ── Create agent state (same as createAgentApp does internally) ─────────────
const messages = signal<AgentMessage[]>([])
const status = signal<AgentStatus>('idle')
const error = signal<string | null>(null)
const streaming = streamText()
const panels = signal<Map<string, UIElement>>(new Map())

const state: AgentState = { messages, status, streamingText: streaming, error, panels }

// ── Reactive observer — prints state changes to terminal ────────────────────
let lastPrintedStreaming = ''

effect(() => {
  const s = status.value
  const streamVal = streaming.value
  const panelMap = panels.value

  if (s === 'thinking') {
    process.stdout.write(yellow('\n  ⏳ Thinking...\n'))
  }

  // Print streaming text incrementally
  if (streamVal.length > lastPrintedStreaming.length) {
    const newChars = streamVal.slice(lastPrintedStreaming.length)
    process.stdout.write(newChars)
    lastPrintedStreaming = streamVal
  }

  // Print panel updates
  if (panelMap.size > 0) {
    // Don't re-print on every effect — handled in showUI below
  }
})

// ── Build callbacks (mirrors what createAgentApp provides) ──────────────────
function createCallbacks(): AgentCallbacks {
  return {
    append(chunk: string) {
      status.set('streaming')
      streaming.append(chunk)
    },
    set(text: string) {
      status.set('streaming')
      streaming.set(text)
    },
    setStatus(s: AgentStatus) {
      status.set(s)
    },
    done(metadata?: Record<string, unknown>) {
      const finalText = streaming.signal.peek()
      streaming.done()
      batch(() => {
        if (finalText.length > 0) {
          const current = messages.peek()
          messages.set([
            ...current,
            { role: 'assistant', content: finalText, timestamp: new Date().toISOString(), metadata },
          ])
        }
        streaming.clear()
        streaming.done()
        status.set('idle')
      })
    },
    showUI(...args: [UIElement] | [string, UIElement]): void {
      const [key, element] = args.length === 1 ? ['main', args[0]] : args
      const next = new Map(panels.peek())
      next.set(key, element)
      panels.set(next)
      // Print panel info to terminal
      const kind = element.kind
      const panelLabel = key === 'main' ? 'content panel' : `panel "${key}"`
      process.stdout.write(magenta(`\n  📊 [showUI] Pushed ${kind} element to ${panelLabel}\n`))
    },
    clearUI(key = 'main'): void {
      const current = panels.peek()
      if (!current.has(key)) return
      const next = new Map(current)
      next.delete(key)
      panels.set(next)
      process.stdout.write(dim(`\n  [clearUI] Removed panel "${key}"\n`))
    },
  }
}

// ── Simulate the agent's onMessage handler ──────────────────────────────────
async function handleMessage(userText: string, callbacks: AgentCallbacks): Promise<void> {
  callbacks.setStatus('thinking')
  await sleep(400)

  const lower = userText.toLowerCase()

  // ── Show dynamic UI based on query ────────────────────────────────────
  if (lower.includes('mission') || lower.includes('trajectory')) {
    // Agent builds a 3D scene on the fly
    callbacks.setStatus('tool-use')
    process.stdout.write(yellow('\n  🔧 Building 3D trajectory visualization...\n'))
    await sleep(300)

    callbacks.showUI('trajectory', scene3d({
      width: 400,
      height: 300,
      background: 0x0b0e14,
      fov: 60,
      cameraPosition: [0, 80, 150],
      cameraTarget: [0, 0, 0],
      orbitControls: true,
      objects: [
        // Earth
        sphere({ position: [0, 0, 0], radius: 10, color: 0x2563eb }),
        // Moon
        sphere({ position: [60, 5, 0], radius: 3, color: 0x94a3b8 }),
        // Trajectory arc
        line({
          points: Array.from({ length: 50 }, (_, i) => {
            const t = i / 49
            const angle = t * Math.PI
            const r = 10 + t * 50
            return [Math.cos(angle) * r, Math.sin(angle) * 15 * Math.sin(t * Math.PI), Math.sin(angle) * r] as [number, number, number]
          }),
          color: 0xe94560,
          opacity: 0.8,
        }),
        // Spacecraft position
        sphere({ position: [30, 12, 26], radius: 1.5, color: 0xfbbf24 }),
        // Lighting
        ambientLight({ intensity: 0.4 }),
        directionalLight({ position: [50, 50, 50], intensity: 0.8 }),
      ],
    }))

    const response = "Here's the Artemis II trajectory visualization. The blue sphere is Earth, gray is the Moon, and the red arc shows the free-return trajectory. The yellow dot marks the current spacecraft position. This scene3d element was constructed dynamically by the agent and pushed via showUI() — it's plain JSON descriptors, not Three.js code."
    process.stdout.write(cyan('\n  Agent: '))
    for (const word of response.split(' ')) {
      callbacks.append(word + ' ')
      await sleep(40)
    }
    process.stdout.write('\n')
    callbacks.done()
    return
  }

  if (lower.includes('data') || lower.includes('table') || lower.includes('telemetry')) {
    // Agent builds a data table
    callbacks.setStatus('tool-use')
    process.stdout.write(yellow('\n  🔧 Querying telemetry data...\n'))
    await sleep(300)

    // Build a table using box/text (since we're in core, not ui)
    const tableHeader = box(
      { flexDirection: 'row', gap: 8, paddingBottom: 8 },
      ['System', 'Status', 'Value'].map(h =>
        box({ flexGrow: 1 }, [text({ text: h, font: 'bold 12px Inter', lineHeight: 16, color: '#94a3b8' })])
      ),
    )
    const rows = [
      ['Life Support', 'Nominal', '98.2%'],
      ['Navigation', 'Active', 'On course'],
      ['Comms', 'Nominal', '24.1 dBW'],
      ['Power', 'Nominal', '28.4 VDC'],
      ['Thermal', 'Warning', '42.1°C'],
    ]
    const tableRows = rows.map(([sys, stat, val]) =>
      box(
        { flexDirection: 'row', gap: 8, paddingTop: 4, paddingBottom: 4 },
        [sys!, stat!, val!].map((cell, i) =>
          box({ flexGrow: 1 }, [
            text({
              text: cell,
              font: '13px Inter',
              lineHeight: 18,
              color: i === 1 && cell === 'Warning' ? '#fbbf24' : '#e2e8f0',
            }),
          ])
        ),
      )
    )

    callbacks.showUI(box(
      { flexDirection: 'column', padding: 16, backgroundColor: '#1e293b', borderRadius: 8 },
      [
        text({ text: 'Spacecraft Telemetry', font: 'bold 14px Inter', lineHeight: 20, color: '#f8fafc' }),
        box({ height: 8 }, []),
        tableHeader,
        box({ height: 1, backgroundColor: '#334155' }, []),
        ...tableRows,
      ],
    ))

    const response = "Here's the current telemetry data. Note the thermal warning on the service module — it's above nominal range. The showUI callback pushed a full data table (built from box/text primitives) into the content panel. In a browser, this renders as a real interactive layout alongside the chat."
    process.stdout.write(cyan('\n  Agent: '))
    for (const word of response.split(' ')) {
      callbacks.append(word + ' ')
      await sleep(40)
    }
    process.stdout.write('\n')
    callbacks.done()
    return
  }

  if (lower.includes('clear') || lower.includes('reset')) {
    // Clear all known panels
    for (const key of [...panels.peek().keys()]) {
      callbacks.clearUI(key)
    }
    const response = "Cleared all panels. The content area is back to chat-only mode."
    process.stdout.write(cyan('\n  Agent: '))
    for (const word of response.split(' ')) {
      callbacks.append(word + ' ')
      await sleep(40)
    }
    process.stdout.write('\n')
    callbacks.done()
    return
  }

  // Default: text-only response
  const response = generateResponse(userText)
  process.stdout.write(cyan('\n  Agent: '))
  for (const word of response.split(' ')) {
    callbacks.append(word + ' ')
    await sleep(50)
  }
  process.stdout.write('\n')
  callbacks.done()
}

// ── Send a user message ─────────────────────────────────────────────────────
async function sendMessage(userText: string): Promise<void> {
  process.stdout.write(green(`\n  You: `) + userText + '\n')

  batch(() => {
    messages.set([
      ...messages.peek(),
      { role: 'user', content: userText, timestamp: new Date().toISOString() },
    ])
    error.set(null)
    streaming.clear()
    status.set('thinking')
  })

  lastPrintedStreaming = ''
  const callbacks = createCallbacks()
  await handleMessage(userText, callbacks)
}

// ── Response generator (fallback) ───────────────────────────────────────────
function generateResponse(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes('hello') || lower.includes('hi')) {
    return "Hello! I'm an Artemis mission agent. Ask me about the trajectory, telemetry data, or mission status — I'll build the UI on the fly using showUI()."
  }
  return `I can show you dynamic visualizations! Try asking about "mission trajectory" (3D scene), "telemetry data" (table), or "clear panels" to reset.`
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Run the demo ────────────────────────────────────────────────────────────
console.log(bold('\n  ╔══════════════════════════════════════════════════╗'))
console.log(bold('  ║') + cyan('   @geometra/agent — Dynamic UI Demo             ') + bold('║'))
console.log(bold('  ╚══════════════════════════════════════════════════╝'))
console.log(dim('  Demonstrating: showUI(), scene3d(), data tables, panels\n'))

await sendMessage('Hello!')
await sleep(300)

await sendMessage('Show me the mission trajectory')
await sleep(300)

await sendMessage('Show telemetry data')
await sleep(300)

await sendMessage('Clear panels')
await sleep(300)

const panelCount = panels.peek().size
console.log(dim(`\n  ── Session complete: ${messages.peek().length} messages, ${panelCount} active panels ──\n`))
process.exit(0)

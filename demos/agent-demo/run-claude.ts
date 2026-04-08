/**
 * Geometra Agent SDK + Claude Code — Dynamic UI Demo.
 *
 * Claude Code powers the agent's responses AND decides what UI to build.
 * The agent can stream text AND push dynamic UIElements (tables, 3D scenes)
 * via showUI().
 *
 * Run: npx tsx demos/agent-demo/run-claude.ts
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { signal, batch, streamText, effect, box, text, scene3d, sphere, line, ambientLight, directionalLight } from '../../packages/core/src/index.js'
import type { UIElement } from '../../packages/core/src/index.js'
import type { AgentCallbacks, AgentStatus, AgentMessage } from '../../packages/agent/src/types.js'

// ── Colors ──────────────────────────────────────────────────────────────────
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

// ── Agent state ─────────────────────────────────────────────────────────────
const messages = signal<AgentMessage[]>([])
const status = signal<AgentStatus>('idle')
const error = signal<string | null>(null)
const streaming = streamText()
const panels = signal<Map<string, UIElement>>(new Map())

// ── Reactive terminal renderer ──────────────────────────────────────────────
let lastPrintedStreaming = ''

effect(() => {
  const s = status.value
  const streamVal = streaming.value

  if (s === 'thinking' && streamVal.length === 0) {
    process.stdout.write(yellow('\n  ⏳ Thinking...\n'))
  }

  if (streamVal.length > lastPrintedStreaming.length) {
    const newChars = streamVal.slice(lastPrintedStreaming.length)
    process.stdout.write(newChars)
    lastPrintedStreaming = streamVal
  }
})

// ── UI builders (the agent triggers these based on Claude's response) ───────

function buildTrajectoryScene(): UIElement {
  return scene3d({
    width: 400,
    height: 300,
    background: 0x0b0e14,
    fov: 60,
    cameraPosition: [0, 80, 150],
    cameraTarget: [0, 0, 0],
    orbitControls: true,
    objects: [
      sphere({ position: [0, 0, 0], radius: 10, color: 0x2563eb }),
      sphere({ position: [60, 5, 0], radius: 3, color: 0x94a3b8 }),
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
      sphere({ position: [30, 12, 26], radius: 1.5, color: 0xfbbf24 }),
      ambientLight({ intensity: 0.4 }),
      directionalLight({ position: [50, 50, 50], intensity: 0.8 }),
    ],
  })
}

function buildTelemetryTable(): UIElement {
  const header = box(
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
  ].map(([sys, stat, val]) =>
    box(
      { flexDirection: 'row', gap: 8, paddingTop: 4, paddingBottom: 4 },
      [sys!, stat!, val!].map((cell, i) =>
        box({ flexGrow: 1 }, [
          text({ text: cell, font: '13px Inter', lineHeight: 18, color: i === 1 && cell === 'Warning' ? '#fbbf24' : '#e2e8f0' }),
        ])
      ),
    )
  )
  return box(
    { flexDirection: 'column', padding: 16, backgroundColor: '#1e293b', borderRadius: 8 },
    [
      text({ text: 'Spacecraft Telemetry', font: 'bold 14px Inter', lineHeight: 20, color: '#f8fafc' }),
      box({ height: 8 }, []),
      header,
      box({ height: 1, backgroundColor: '#334155' }, []),
      ...rows,
    ],
  )
}

// ── Callbacks ───────────────────────────────────────────────────────────────
function createCallbacks(): AgentCallbacks {
  return {
    append(chunk: string) {
      status.set('streaming')
      streaming.append(chunk)
    },
    set(t: string) {
      status.set('streaming')
      streaming.set(t)
    },
    setStatus(s: AgentStatus) {
      status.set(s)
    },
    done(metadata?: Record<string, unknown>) {
      const finalText = streaming.signal.peek()
      streaming.done()
      batch(() => {
        if (finalText.length > 0) {
          messages.set([
            ...messages.peek(),
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
      const panelLabel = key === 'main' ? 'content panel' : `panel "${key}"`
      process.stdout.write(magenta(`\n  📊 [showUI] Pushed ${element.kind} to ${panelLabel}\n`))
    },
    clearUI(key = 'main'): void {
      const current = panels.peek()
      if (!current.has(key)) return
      const next = new Map(current)
      next.delete(key)
      panels.set(next)
      process.stdout.write(dim(`  [clearUI] Removed panel "${key}"\n`))
    },
  }
}

// ── Send a message via Claude Code ──────────────────────────────────────────
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

  try {
    callbacks.setStatus('thinking')

    // Detect if we should show dynamic UI based on keywords
    const lower = userText.toLowerCase()
    if (lower.includes('trajectory') || lower.includes('3d') || lower.includes('orbit')) {
      callbacks.setStatus('tool-use')
      process.stdout.write(yellow('  🔧 Building 3D visualization...\n'))
      callbacks.showUI('trajectory', buildTrajectoryScene())
    }
    if (lower.includes('telemetry') || lower.includes('data') || lower.includes('status')) {
      callbacks.setStatus('tool-use')
      process.stdout.write(yellow('  🔧 Loading telemetry data...\n'))
      callbacks.showUI('telemetry', buildTelemetryTable())
    }

    process.stdout.write(cyan('\n  Claude: '))

    // Stream response from Claude Code
    for await (const message of query({
      prompt: userText,
      options: {
        maxTurns: 1,
        allowedTools: [],
        systemPrompt: `You are a mission control assistant for Artemis II, running inside a Geometra agent UI.
Keep responses concise (2-3 sentences).
If the user asked about trajectory/orbit, mention that a 3D visualization was pushed to the content panel via showUI().
If they asked about telemetry/data/status, mention the telemetry table that was pushed via showUI().
You are demonstrating how Claude Code + Geometra agent SDK enables dynamic UI construction alongside streamed text.`,
      },
    })) {
      if (message.type === 'assistant') {
        const textBlocks = message.message.content
          .flatMap(block => ('text' in block && typeof block.text === 'string' ? [block.text] : []))
          .join('')
        if (textBlocks.length > 0) {
          callbacks.append(textBlocks)
        }
      }
    }

    process.stdout.write('\n')
    callbacks.done({ model: 'claude-code' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stdout.write(`\n\x1b[31m  Error: ${msg}\x1b[0m\n`)
    batch(() => {
      status.set('error')
      error.set(msg)
      streaming.done()
    })
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────
console.log(bold('\n  ╔══════════════════════════════════════════════════════╗'))
console.log(bold('  ║') + cyan('   Artemis II Mission Agent — Claude Code + showUI  ') + bold('║'))
console.log(bold('  ╚══════════════════════════════════════════════════════╝'))
console.log(dim('  Dynamic UI: Claude streams text while agent pushes 3D scenes & tables\n'))

await sendMessage('Show me the Artemis II trajectory and orbit path')
await sleep(500)

await sendMessage('What is the current spacecraft telemetry status?')
await sleep(500)

const panelCount = panels.peek().size
console.log(dim(`\n  ── Session complete: ${messages.peek().length} messages, ${panelCount} active panels ──\n`))
process.exit(0)

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

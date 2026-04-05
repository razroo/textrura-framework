/**
 * Geometra Agent SDK + Claude Code demo.
 *
 * Uses the Claude Agent SDK to power the agent's responses,
 * streaming tokens through Geometra's streamText() primitive.
 *
 * Run: npx tsx demos/agent-demo/run-claude.ts
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { signal, batch, streamText, effect } from '../../packages/core/src/index.js'
import type { AgentState, AgentCallbacks, AgentStatus, AgentMessage } from '../../packages/agent/src/types.js'

// ── Colors ──────────────────────────��───────────────────────────────────────
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

// ── Agent state ───────��─────────────────────────────────────────────────────
const messages = signal<AgentMessage[]>([])
const status = signal<AgentStatus>('idle')
const error = signal<string | null>(null)
const streaming = streamText()
const state: AgentState = { messages, status, streamingText: streaming, error }

// ── Reactive terminal renderer ───��──────────────────────────────────────────
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

// ── Callbacks ───────────���───────────────────────────────────────────────────
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
  }
}

// ── Send a message via Claude Code ──────────────────────────────────────────
async function sendMessage(text: string): Promise<void> {
  process.stdout.write(green(`\n  You: `) + text + '\n')

  batch(() => {
    messages.set([
      ...messages.peek(),
      { role: 'user', content: text, timestamp: new Date().toISOString() },
    ])
    error.set(null)
    streaming.clear()
    status.set('thinking')
  })

  lastPrintedStreaming = ''
  const callbacks = createCallbacks()

  try {
    callbacks.setStatus('thinking')
    process.stdout.write(cyan('\n  Claude: '))

    // Use the Claude Agent SDK (v1 query API)
    for await (const message of query({
      prompt: text,
      options: {
        maxTurns: 1,
        allowedTools: [],  // text-only, no tool use
        systemPrompt: 'You are a helpful assistant running inside a Geometra agent UI demo. Keep responses concise (2-3 sentences). You are demonstrating how Claude Code can power a Geometra server-streamed agent interface.',
      },
    })) {
      if (message.type === 'assistant') {
        const textBlocks = message.message.content
          .filter((block: { type: string }) => block.type === 'text')
          .map((block: { type: string; text: string }) => block.text)
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

// ── Run ─���───────────────────────────────��───────────────────────────────────
console.log(bold('\n  ╔══════════════════════════════════════════════════╗'))
console.log(bold('  ║') + cyan('   @geometra/agent + Claude Code Demo            ') + bold('║'))
console.log(bold('  ╚════��═════════════════════════��═══════════════════╝'))
console.log(dim('  Streaming Claude Code responses through Geometra streamText()\n'))

await sendMessage('What is Geometra and why would someone use it for AI agent UIs?')
await sleep(500)

await sendMessage('How does server-streamed UI differ from traditional React SPAs?')
await sleep(500)

console.log(dim(`\n  ── Session complete: ${messages.peek().length} messages ──\n`))
process.exit(0)

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

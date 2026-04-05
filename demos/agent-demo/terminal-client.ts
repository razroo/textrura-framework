/**
 * Terminal client for the agent demo.
 * Connects to the agent WebSocket, renders the UI in the terminal,
 * and sends typed messages.
 *
 * Run: npx tsx demos/agent-demo/terminal-client.ts
 */
import WebSocket from 'ws'
import * as readline from 'node:readline'

const ws = new WebSocket('ws://localhost:3100')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

let lastTexts: string[] = []

function extractTexts(node: any): string[] {
  const texts: string[] = []
  if (node?.kind === 'text' && node?.props?.text) {
    texts.push(node.props.text)
  }
  if (node?.children) {
    for (const child of node.children) {
      texts.push(...extractTexts(child))
    }
  }
  return texts
}

function renderFrame(tree: any): void {
  const texts = extractTexts(tree)
  // Only re-render if content changed
  const key = texts.join('|')
  const lastKey = lastTexts.join('|')
  if (key === lastKey) return
  lastTexts = texts

  console.clear()
  console.log('━'.repeat(60))
  console.log('  GEOMETRA AGENT (terminal client)')
  console.log('━'.repeat(60))

  for (const t of texts) {
    // Color-code based on content
    if (t === 'Agent' || t.startsWith('Geometra')) {
      console.log(`\x1b[1;36m  ${t}\x1b[0m`) // cyan bold header
    } else if (t.endsWith('...')) {
      console.log(`\x1b[33m  ⏳ ${t}\x1b[0m`) // yellow status
    } else if (t === 'Send' || t === 'Type a message...') {
      // skip UI chrome
    } else {
      console.log(`  ${t}`)
    }
  }

  console.log()
  console.log('━'.repeat(60))
  rl.setPrompt('\x1b[32m  You > \x1b[0m')
  rl.prompt()
}

ws.on('open', () => {
  // Send initial resize
  ws.send(JSON.stringify({ type: 'resize', width: 800, height: 600, protocolVersion: 1 }))
  console.log('\x1b[32mConnected to agent.\x1b[0m\n')
})

ws.on('message', (raw) => {
  try {
    const msg = JSON.parse(String(raw))
    if (msg.type === 'frame' && msg.tree) {
      renderFrame(msg.tree)
    } else if (msg.type === 'patch') {
      // For patches we'd need the full tree; just request a re-render
    }
  } catch {
    // ignore
  }
})

rl.on('line', (line) => {
  const text = line.trim()
  if (!text) {
    rl.prompt()
    return
  }
  if (text === '/quit' || text === '/exit') {
    console.log('Bye!')
    ws.close()
    process.exit(0)
  }

  // Simulate clicking the input, typing, and pressing Enter
  // We send a key event with the Enter key to trigger the input handler
  // But since the server handles this via onClick/onKeyDown handlers,
  // we need to send the text as a special message or simulate the interaction.
  //
  // The simplest approach: directly send the text by simulating the
  // input → keydown(Enter) flow. However, the server's chat-view uses
  // module-level signals for input state, so we need a different approach.
  //
  // For this demo, we'll use the data channel as a simple text submission.
  // But actually, the cleanest way is to just POST the message.
  //
  // Since the agent SDK's chatView uses server-side signals that only
  // update via WebSocket events (clicks/keys), and we can't easily type
  // character-by-character from a terminal client, let's use a simpler
  // approach: send a custom message type that the server can handle.

  // For now, let's simulate by sending key events for each character
  // followed by Enter. This is how a real client would work.

  // Actually, the simplest working approach: send composition events
  // to type the text, then Enter to submit.

  // Type the text via composition
  ws.send(JSON.stringify({
    type: 'composition',
    eventType: 'onCompositionStart',
    data: '',
    protocolVersion: 1,
  }))
  ws.send(JSON.stringify({
    type: 'composition',
    eventType: 'onCompositionEnd',
    data: text,
    protocolVersion: 1,
  }))

  // Press Enter to submit
  ws.send(JSON.stringify({
    type: 'key',
    eventType: 'onKeyDown',
    key: 'Enter',
    code: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    protocolVersion: 1,
  }))
})

ws.on('close', () => {
  console.log('\nDisconnected.')
  process.exit(0)
})

ws.on('error', (err) => {
  console.error('Connection error:', err.message)
  console.error('Is the agent server running? Start it with: npx tsx demos/agent-demo/server.ts')
  process.exit(1)
})

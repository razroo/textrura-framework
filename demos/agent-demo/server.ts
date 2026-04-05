/**
 * Minimal agent demo — simulates an LLM streaming response.
 * Run: npx tsx demos/agent-demo/server.ts
 */
import { createAgentApp } from '../../packages/agent/src/index.js'

const app = await createAgentApp({
  port: 3100,
  title: 'Geometra Agent',
  systemPrompt: 'Welcome! I\'m a demo agent powered by Geometra. Ask me anything.',
  onMessage: async (text, { append, setStatus, done }) => {
    setStatus('thinking')
    // Simulate thinking delay
    await new Promise(r => setTimeout(r, 500))

    // Simulate streaming LLM response word-by-word
    const response = generateResponse(text)
    const words = response.split(' ')

    for (const word of words) {
      append(word + ' ')
      await new Promise(r => setTimeout(r, 60)) // ~60ms per word
    }

    done({ model: 'demo-agent-v1' })
  },
})

function generateResponse(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes('hello') || lower.includes('hi')) {
    return 'Hello! I\'m running as a Geometra agent with server-streamed UI. The layout is computed server-side via Yoga WASM and streamed to your client over WebSocket. Pretty neat, right?'
  }
  if (lower.includes('how') && lower.includes('work')) {
    return 'Here\'s how it works: 1) You type a message in the input field. 2) The server receives it via WebSocket. 3) My onMessage handler streams tokens back using append(). 4) Each append triggers a geometry diff that gets pushed to your client. 5) The client paints the updated layout. All of this happens over a single WebSocket connection with a ~2KB client.'
  }
  if (lower.includes('geometra')) {
    return 'Geometra is a DOM-free UI framework. Instead of the browser rendering pipeline, it uses: Tree → Yoga WASM → Geometry → Pixels. The agent SDK adds createAgentApp() which wires up a WebSocket server with reactive chat state, so you can build agent UIs with a single function call.'
  }
  return `You said: "${input}". This is a demo agent — in production you'd wire the onMessage callback to an LLM like Claude via the Anthropic SDK. Each token would be streamed back via append(), which uses microtask coalescing so rapid tokens produce efficient geometry updates.`
}

console.log('Agent server running on ws://localhost:3100')
console.log('Connect a Geometra client or open the test client to interact.')

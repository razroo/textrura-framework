import { CanvasRenderer } from '@geometra/renderer-canvas'
import { createClient } from '@geometra/client'
import type { TexturaClient } from '@geometra/client'

const TOKENS: Record<string, string> = {
  admin: 'admin-token-demo',
  viewer: 'viewer-token-demo',
  invalid: 'this-token-does-not-exist',
}

const canvas = document.getElementById('app') as HTMLCanvasElement
const statusEl = document.getElementById('status') as HTMLDivElement

let renderer: CanvasRenderer | null = null
let client: TexturaClient | null = null

function log(msg: string) {
  statusEl.textContent = (statusEl.textContent ?? '') + msg + '\n'
  statusEl.scrollTop = statusEl.scrollHeight
}

function clearStatus() {
  statusEl.textContent = ''
}

function connectAs(role: string) {
  if (client) {
    client.close()
    client = null
  }
  if (renderer) {
    renderer.destroy()
    renderer = null
  }

  clearStatus()

  const token = TOKENS[role] ?? role
  const url = `ws://localhost:3100?token=${encodeURIComponent(token)}`

  log(`Connecting as "${role}"…`)
  log(`URL: ${url}`)

  renderer = new CanvasRenderer({ canvas, background: '#1a1a2e' })

  // Clear canvas while connecting
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  client = createClient({
    url,
    renderer,
    canvas,
    reconnect: false,
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'Forbidden') {
        log(`⛔ Server rejected event: ${msg}`)
        log(`   (viewer role cannot send input events)`)
      } else {
        log(`❌ Error: ${msg}`)
      }
    },
  })

  // Detect successful connection by polling for received layout
  let checks = 0
  const poll = setInterval(() => {
    checks++
    if (client?.layout) {
      clearInterval(poll)
      log(`✓ Connected as ${role} — receiving geometry frames`)
      if (role === 'viewer') {
        log(`  (try clicking the button — it will be rejected)`)
      }
    } else if (checks > 20) {
      clearInterval(poll)
      if (!client?.layout) {
        log(`✗ Connection failed — server rejected (code 4001)`)
        log(`  Token "${token.slice(0, 16)}…" not recognized`)
      }
    }
  }, 100)
}

// Expose to onclick handlers in HTML
;(window as unknown as Record<string, unknown>).connectAs = connectAs

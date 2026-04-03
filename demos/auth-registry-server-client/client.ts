import { CanvasRenderer } from '@geometra/renderer-canvas'
import { connectWithAuth } from '@geometra/auth/client'
import type { TexturaClient } from '@geometra/client'

const DEMO_TOKENS_URL = 'http://127.0.0.1:3098/demo-tokens'

const canvas = document.getElementById('app') as HTMLCanvasElement
const statusEl = document.getElementById('status') as HTMLDivElement

let renderer: CanvasRenderer | null = null
let client: TexturaClient | null = null

let cachedTokens: { admin: string; viewer: string } | null = null

function log(msg: string) {
  statusEl.textContent = (statusEl.textContent ?? '') + msg + '\n'
  statusEl.scrollTop = statusEl.scrollHeight
}

function clearStatus() {
  statusEl.textContent = ''
}

async function ensureTokens(): Promise<{ admin: string; viewer: string }> {
  if (cachedTokens) return cachedTokens
  const res = await fetch(DEMO_TOKENS_URL)
  if (!res.ok) {
    throw new Error(
      `GET ${DEMO_TOKENS_URL} failed (${res.status}). Start the demo server first (npm run server).`,
    )
  }
  cachedTokens = (await res.json()) as { admin: string; viewer: string }
  return cachedTokens
}

async function connectAs(role: 'admin' | 'viewer' | 'invalid') {
  if (client) {
    client.close()
    client = null
  }
  if (renderer) {
    renderer.destroy()
    renderer = null
  }

  clearStatus()

  let token: string
  try {
    const tokens = await ensureTokens()
    if (role === 'invalid') {
      token = 'not-a-valid-token'
    } else {
      token = tokens[role]
    }
  } catch (e) {
    log(e instanceof Error ? e.message : String(e))
    return
  }

  log(`Connecting as "${role}"…`)

  renderer = new CanvasRenderer({ canvas, background: '#1a1a2e' })

  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  client = await connectWithAuth({
    token,
    url: 'ws://localhost:3100',
    renderer,
    canvas,
    reconnect: false,
    onAuthRejected: () => {
      log('✗ Auth rejected (WebSocket 4001) — token not accepted by registry')
    },
    onForbidden: () => {
      log('⛔ Forbidden — viewer role cannot send input events')
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg !== 'Forbidden') {
        log(`❌ Error: ${msg}`)
      }
    },
  })

  let checks = 0
  const poll = setInterval(() => {
    checks++
    if (client?.layout) {
      clearInterval(poll)
      log(`✓ Connected as ${role} — receiving geometry frames`)
      if (role === 'viewer') {
        log('  (try the increment button — events are blocked)')
      }
    } else if (checks > 30) {
      clearInterval(poll)
      if (!client?.layout && role !== 'invalid') {
        log('✗ No layout after timeout — check server logs')
      }
    }
  }, 100)
}

;(window as unknown as Record<string, unknown>).connectAs = connectAs

void ensureTokens()
  .then(() => {
    log('Ready — tokens loaded from demo server. Pick a role below.')
  })
  .catch((e) => {
    log(e instanceof Error ? e.message : String(e))
  })

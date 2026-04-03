import { createServer as createHttpServer } from 'node:http'
import { signal, box, text } from '@geometra/core/node'
import { createServer } from '@geometra/server'
import type { TexturaServer } from '@geometra/server'
import { createAuth, remoteVerifier } from '@geometra/auth'
import { serveRegistry } from '@geometra/token-registry'

const REGISTRY_PORT = Number(process.env.REGISTRY_PORT ?? 3200)
/** Serves freshly minted demo tokens to the Vite page (localhost only; demo use). */
const DEMO_TOKENS_PORT = Number(process.env.DEMO_TOKENS_PORT ?? 3098)
const GEOMETRA_PORT = Number(process.env.GEOMETRA_PORT ?? 3100)

const { registry, close: closeRegistry } = await serveRegistry({
  port: REGISTRY_PORT,
  adminKey: process.env.REGISTRY_ADMIN_KEY ?? 'demo-admin-local-only',
})

const adminRecord = await registry.createToken({ role: 'admin' })
const viewerRecord = await registry.createToken({ role: 'viewer' })
const demoTokens = { admin: adminRecord.token, viewer: viewerRecord.token }

const metaHttp = createHttpServer((req, res) => {
  const url = req.url ?? '/'
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    })
    res.end()
    return
  }
  if (req.method === 'GET' && url.startsWith('/demo-tokens')) {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8',
    })
    res.end(JSON.stringify(demoTokens))
    return
  }
  res.writeHead(404).end()
})

await new Promise<void>((resolve, reject) => {
  metaHttp.listen(DEMO_TOKENS_PORT, '127.0.0.1', () => resolve())
  metaHttp.on('error', reject)
})

const count = signal(0)
const connectedClients = signal(0)

let server: TexturaServer

function view() {
  return box(
    { flexDirection: 'column', padding: 24, gap: 16, width: 460, height: 340 },
    [
      box(
        {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0a0a1a',
          padding: 12,
          borderRadius: 8,
        },
        [
          text({
            text: 'Auth + token registry',
            font: 'bold 16px Inter, system-ui',
            lineHeight: 22,
            color: '#e94560',
          }),
          text({
            text: `${connectedClients.value} connected`,
            font: '12px Inter, system-ui',
            lineHeight: 16,
            color: '#666',
          }),
        ],
      ),

      box({ flexDirection: 'column', gap: 8, flexGrow: 1 }, [
        text({
          text: `Count: ${count.value}`,
          font: 'bold 32px Inter, system-ui',
          lineHeight: 40,
          color: '#ffffff',
        }),
        box(
          {
            backgroundColor: '#e94560',
            borderRadius: 8,
            padding: 12,
            cursor: 'pointer',
            alignSelf: 'flex-start',
            onClick: () => {
              count.set(count.peek() + 1)
              server.update()
            },
          },
          [
            text({
              text: '+ Increment',
              font: '600 14px Inter, system-ui',
              lineHeight: 20,
              color: '#ffffff',
            }),
          ],
        ),
        box({ height: 8 }, []),
        text({
          text: 'Tokens come from @geometra/token-registry; verify via remoteVerifier.',
          font: '12px Inter, system-ui',
          lineHeight: 17,
          color: '#555',
        }),
      ]),
    ],
  )
}

const auth = createAuth({
  verify: remoteVerifier(`http://127.0.0.1:${REGISTRY_PORT}/verify`),
  policies: {
    viewer: { allow: ['resize'] },
  },
  onAccept: () => {
    connectedClients.set(connectedClients.peek() + 1)
    server.update()
  },
  onReject: (reason) => {
    console.log(`[auth] rejected — ${reason}`)
  },
  onBlock: (messageType, ctx) => {
    console.log(`[auth] blocked "${messageType}" from ${ctx.role}`)
  },
  onLeave: () => {
    connectedClients.set(Math.max(0, connectedClients.peek() - 1))
    server.update()
  },
})

server = await createServer(view, {
  port: GEOMETRA_PORT,
  width: 460,
  height: 340,
  ...auth,
})

function shutdown() {
  server.close()
  metaHttp.close()
  closeRegistry()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log(`
  Geometra + @geometra/auth + @geometra/token-registry
  ─────────────────────────────────────────────────────
  Registry verify:  http://127.0.0.1:${REGISTRY_PORT}/verify
  Demo token JSON:  http://127.0.0.1:${DEMO_TOKENS_PORT}/demo-tokens
  Geometra server:  ws://localhost:${GEOMETRA_PORT}

  (Tokens are random each run — the browser loads them from /demo-tokens.)

  Run the client:  npm run client  (in another terminal)
`)

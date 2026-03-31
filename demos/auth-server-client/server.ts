import { signal, box, text } from '@geometra/core/node'
import { createServer } from '@geometra/server'

// ─── Tokens ─────────────────────────────────────────────────────────────────
// In production these would be JWTs validated against a JWKS endpoint.
// For the demo, static tokens keep the focus on the hooks.
const TOKEN_ROLES: Record<string, string> = {
  'admin-token-demo': 'admin',
  'viewer-token-demo': 'viewer',
}

// ─── App State ──────────────────────────────────────────────────────────────
const count = signal(0)
const connectedClients = signal(0)

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
            text: 'Auth Demo',
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
          text: 'Admins can click the button. Viewers receive "Forbidden".',
          font: '13px Inter, system-ui',
          lineHeight: 18,
          color: '#555',
        }),
      ]),
    ],
  )
}

// ─── Server with Hooks ──────────────────────────────────────────────────────
const server = await createServer(view, {
  port: 3100,
  width: 460,
  height: 340,

  onConnection: (request) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
    const token = url.searchParams.get('token')

    if (!token) {
      console.log('[auth] rejected — no token')
      return null
    }

    const role = TOKEN_ROLES[token]
    if (!role) {
      console.log(`[auth] rejected — unknown token: ${token.slice(0, 8)}…`)
      return null
    }

    console.log(`[auth] accepted — role: ${role}`)
    connectedClients.set(connectedClients.peek() + 1)
    server.update()
    return { role }
  },

  onDisconnect: (context) => {
    const { role } = context as { role: string }
    console.log(`[auth] disconnected — role: ${role}`)
    connectedClients.set(Math.max(0, connectedClients.peek() - 1))
    server.update()
  },

  onMessage: (message, context) => {
    const { role } = context as { role: string }

    // Viewers can only receive frames — block all input events
    if (role === 'viewer' && message.type !== 'resize') {
      console.log(`[auth] blocked ${message.type} from viewer`)
      return false
    }

    return true
  },
})

console.log(`
  Geometra Auth Demo Server
  ─────────────────────────
  Listening on ws://localhost:3100

  Tokens:
    admin  → admin-token-demo   (full access)
    viewer → viewer-token-demo  (read-only, events rejected)
    other  → connection refused (4001)
`)

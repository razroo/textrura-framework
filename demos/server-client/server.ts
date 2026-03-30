import { signal, box, text } from '@geometra/core/node'
import { createServer } from '@geometra/server'

// Server-side state
const messages = signal<string[]>([
  'Welcome to Textura',
  'Layout computed server-side',
  'Geometry streamed to client',
])
const activeUsers = signal(1)

function chatBubble(msg: string, index: number) {
  const isSystem = index === 0
  return box(
    {
      backgroundColor: isSystem ? '#0f3460' : '#16213e',
      borderRadius: 8,
      padding: 12,
      flexShrink: 0,
    },
    [
      text({
        text: msg,
        font: '14px Inter, system-ui',
        lineHeight: 20,
        color: '#ffffff',
      }),
    ],
  )
}

function view() {
  const msgs = messages.value

  return box(
    {
      flexDirection: 'column',
      padding: 20,
      gap: 12,
      width: 500,
      height: 400,
    },
    [
      // Header bar
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
            text: 'Textura Server',
            font: 'bold 16px Inter, system-ui',
            lineHeight: 22,
            color: '#e94560',
          }),
          text({
            text: `${activeUsers.value} connected`,
            font: '12px Inter, system-ui',
            lineHeight: 16,
            color: '#666',
          }),
        ],
      ),
      // Messages
      box(
        { flexDirection: 'column', gap: 8, flexGrow: 1 },
        msgs.map((msg, i) => chatBubble(msg, i)),
      ),
    ],
  )
}

const server = await createServer(view, { port: 3100, width: 500, height: 400 })

console.log('Textura server listening on ws://localhost:3100')

// Simulate incoming messages
let tick = 0
setInterval(() => {
  tick++
  const current = messages.peek()
  messages.set([...current, `Server tick #${tick}`].slice(-8))
  server.update()
}, 3000)

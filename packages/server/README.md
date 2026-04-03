# @geometra/server

Server-side layout engine with WebSocket streaming for Geometra. Computes layouts on the server and streams them to thin clients.

## Install

```bash
npm install @geometra/server
```

## Key exports

- `createServer` — Geometra layout server with WebSocket streaming (standalone `port` **or** attach to an existing HTTP server)
- `DEFAULT_GEOMETRA_WS_PATH` — default pathname (`/geometra-ws`) when using `httpServer`
- `shouldDeferClientSend` — backpressure helper (used by the server and tests)
- `onTransportMetrics` (option) — per-broadcast deferred send count, coalesced patch delta, binary outbound count
- Binary frame helpers (`encodeBinaryFrameJson`, …) — optional GEOM v1 JSON envelopes; see repo `PROTOCOL_COMPATIBILITY.md`

## Usage

```ts
import { signal, box, text } from '@geometra/core/node'
import { createServer } from '@geometra/server'

const messages = signal(['Hello from server'])

function view() {
  return box({ flexDirection: 'column', padding: 16, gap: 8 },
    messages.value.map((m) =>
      box({ backgroundColor: '#16213e', padding: 10, borderRadius: 8 }, [
        text({ text: m, font: '14px Inter', lineHeight: 20, color: '#fff' }),
      ]),
    ),
  )
}

const server = await createServer(view, { port: 3100, width: 800, height: 500 })
```

### One port: HTTP + WebSocket (attach mode)

Serve static files, REST, and Geometra on the same TCP port by passing your Node `http.Server`. WebSocket clients should connect to `ws(s)://host${wsPath}` (default path `DEFAULT_GEOMETRA_WS_PATH`).

```ts
import http from 'node:http'
import { signal, box, text } from '@geometra/core/node'
import { createServer, DEFAULT_GEOMETRA_WS_PATH } from '@geometra/server'

const count = signal(0)

function view() {
  return box({ padding: 16 }, [
    text({ text: `Count ${count.value}`, font: '16px Inter', lineHeight: 22, color: '#fff' }),
  ])
}

const httpServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<!doctype html><canvas id="app"></canvas><script type="module" src="/client.js"></script>')
    return
  }
  res.writeHead(404).end()
})

await new Promise<void>((resolve) => httpServer.listen(8080, resolve))

const geometra = await createServer(view, {
  httpServer,
  wsPath: DEFAULT_GEOMETRA_WS_PATH,
  width: 800,
  height: 600,
})

// Thin client: new WebSocket(`ws://localhost:8080${DEFAULT_GEOMETRA_WS_PATH}`)
```

Do not pass both `httpServer` and `port`.

## Links

- [Main repo](https://github.com/AiGeekz/geometra)

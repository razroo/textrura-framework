# @geometra/server

Server-side layout engine with WebSocket streaming for Geometra. Computes layouts on the server and streams them to thin clients.

## Install

```bash
npm install @geometra/server
```

## Key exports

- `createServer` — Geometra layout server with WebSocket streaming
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

## Links

- [Main repo](https://github.com/AiGeekz/geometra)

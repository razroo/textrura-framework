# @geometra/client

Thin WebSocket client (~2KB) for Geometra. Connects to a Geometra server and renders streamed layouts on a canvas.

## Install

```bash
npm install @geometra/client
```

## Key exports

- `createClient` — WebSocket client connected to a Geometra server
- `applyServerMessage` — apply a parsed server message to renderer state (advanced/testing)
- `binaryFraming` option — negotiate optional binary GEOM envelopes (same JSON as text frames)

## Usage

```ts
import { createClient } from '@geometra/client'
import { CanvasRenderer } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement
const client = createClient({
  url: 'ws://localhost:3000',
  renderer: new CanvasRenderer({ canvas }),
  canvas,
  // forwards pointer + keyboard + IME composition events to server
  forwardKeyboard: true,
  forwardComposition: true,
  // optional telemetry hook for decode/apply/render budget tracking
  onFrameMetrics: (m) => {
    console.log('frame metrics', m.messageType, m.decodeMs, m.applyMs, m.renderMs)
  },
  // optional: observe closes; auth failures use WebSocket code 4001 and do not auto-reconnect
  onClose: (ev) => {
    if (ev.code === 4001) console.log('auth rejected')
  },
})
```

Auth with `@geometra/auth` is documented in the main repo: [`PLATFORM_AUTH.md`](https://github.com/razroo/geometra/blob/main/PLATFORM_AUTH.md).

## Links

- [Main repo](https://github.com/AiGeekz/geometra)

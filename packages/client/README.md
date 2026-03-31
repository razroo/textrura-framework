# @geometra/client

Thin WebSocket client (~2KB) for Geometra. Connects to a Geometra server and renders streamed layouts on a canvas.

## Install

```bash
npm install @geometra/client
```

## Key Export

- `createClient` -- creates a WebSocket client that connects to a Geometra server

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
})
```

## Links

- [Main repo](https://github.com/AiGeekz/geometra)

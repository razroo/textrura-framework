# Textura Framework

**[Live Demo](https://razroo.github.io/textrura-framework)** | **[npm](https://www.npmjs.com/org/textura)** | **[GitHub](https://github.com/razroo/textrura-framework)**

A DOM-free frontend framework built on the [Textura](https://github.com/razroo/textura) layout engine. No browser layout engine. No DOM. Just computed geometry piped straight to render targets.

Built for the AI Agent Era — where browsers are optional, SEO is irrelevant, and speed is everything.

## How It Works

```
Traditional:  HTML → CSS Parser → DOM → Layout → Paint → Composite
Textura:      Declarative Tree → Yoga WASM → Computed Geometry → Render Target
```

The framework replaces the entire browser rendering pipeline. Layout is computed via Yoga (Facebook's flexbox engine compiled to WASM). Text is measured via Pretext. The output is pure geometry — `{ x, y, width, height }` — rendered by pluggable backends: Canvas2D, Terminal, or raw geometry for AI agents.

## Packages

| Package | Description |
|---|---|
| `@textura/core` | Component model, signals reactivity, hit-testing, tree reconciler |
| `@textura/renderer-canvas` | Canvas2D paint backend |
| `@textura/renderer-terminal` | ANSI terminal/TUI paint backend |
| `@textura/server` | Server-side layout engine with WebSocket geometry streaming |
| `@textura/client` | Thin client that receives pre-computed geometry and paints it |

## Quick Start

### Phase 1: Local Canvas Rendering

```ts
import { signal, box, text, createApp } from '@textura/core'
import { CanvasRenderer } from '@textura/renderer-canvas'

const count = signal(0)

const renderer = new CanvasRenderer({
  canvas: document.getElementById('app') as HTMLCanvasElement,
  background: '#1a1a2e',
})

function view() {
  return box({ flexDirection: 'column', padding: 24, gap: 16 }, [
    text({
      text: `Count: ${count.value}`,
      font: 'bold 24px Inter',
      lineHeight: 32,
      color: '#ffffff',
    }),
    box({
      backgroundColor: '#e94560',
      padding: 12,
      borderRadius: 8,
      onClick: () => count.set(count.peek() + 1),
    }, [
      text({
        text: 'Increment',
        font: '16px Inter',
        lineHeight: 22,
        color: '#ffffff',
      }),
    ]),
  ])
}

await createApp(view, renderer, { width: 400, height: 300 })
```

### Phase 2: Server-Computed Layout

**Server** (Node.js/Bun — no browser needed):

```ts
import { signal, box, text } from '@textura/core'
import { createServer } from '@textura/server'

const data = signal(['Hello', 'from the server'])

function view() {
  return box({ flexDirection: 'column', padding: 20, gap: 8 },
    data.value.map(msg =>
      box({ backgroundColor: '#16213e', padding: 12, borderRadius: 8 }, [
        text({ text: msg, font: '14px Inter', lineHeight: 20, color: '#fff' }),
      ])
    )
  )
}

const server = await createServer(view, { port: 3100, width: 600, height: 400 })
```

**Client** (thin — just a paint loop):

```ts
import { CanvasRenderer } from '@textura/renderer-canvas'
import { createClient } from '@textura/client'

const canvas = document.getElementById('app') as HTMLCanvasElement

createClient({
  url: 'ws://localhost:3100',
  renderer: new CanvasRenderer({ canvas }),
  canvas,
})
```

The client never runs a layout engine. It receives pre-computed `{ x, y, width, height }` geometry over WebSocket and paints it.

### Phase 3: Terminal Rendering

```ts
import { signal, box, text, createApp } from '@textura/core'
import { TerminalRenderer } from '@textura/renderer-terminal'

const renderer = new TerminalRenderer()

function view() {
  return box({ flexDirection: 'column', padding: 16, gap: 8 }, [
    box({ backgroundColor: '#0a0a2e', padding: 12 }, [
      text({ text: 'TEXTURA TUI', font: 'bold 20px monospace', lineHeight: 26, color: '#e94560' }),
    ]),
    text({ text: 'Flexbox layout in your terminal.', font: '14px monospace', lineHeight: 18, color: '#aaa' }),
  ])
}

await createApp(view, renderer, { width: 533, height: 320 })
```

## Reactivity

Textura uses a minimal signals system. When a signal changes, only the affected parts of the tree re-layout and re-render.

```ts
import { signal, computed, effect, batch } from '@textura/core'

const name = signal('world')
const greeting = computed(() => `Hello, ${name.value}!`)

effect(() => console.log(greeting.value))  // "Hello, world!"

name.set('Textura')                         // "Hello, Textura!"

// Batch multiple updates into one flush
batch(() => {
  a.set(1)
  b.set(2)
})
```

## Event Handling

Events are resolved via hit-testing against the computed geometry tree — no DOM event system involved.

```ts
box({
  backgroundColor: '#e94560',
  padding: 16,
  onClick: (e) => console.log(`Clicked at ${e.x}, ${e.y}`),
  onPointerDown: (e) => { /* ... */ },
  onPointerUp: (e) => { /* ... */ },
  onPointerMove: (e) => { /* ... */ },
}, [
  text({ text: 'Click me', font: '16px Inter', lineHeight: 22, color: '#fff' }),
])
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Application                      │
│  Components → Signals → Layout Trees              │
├──────────────────────────────────────────────────┤
│              @textura/core                         │
│  box() / text() → toLayoutTree() → computeLayout()│
├──────────────────────────────────────────────────┤
│              textura (engine)                      │
│  Yoga WASM + Pretext → { x, y, width, height }   │
├───────────┬───────────┬───────────┬──────────────┤
│ Canvas2D  │  Terminal  │  Server   │ Raw Geometry  │
│ Renderer  │  Renderer  │ → Client  │ (AI Agents)   │
└───────────┴───────────┴───────────┴──────────────┘
```

## Running the Demos

```bash
npm install

# Phase 1: Local canvas rendering
cd demos/local-canvas && npm run dev

# Phase 2: Server-client (run in two terminals)
cd demos/server-client && npm run server   # terminal 1
cd demos/server-client && npm run client   # terminal 2

# Phase 3: Terminal UI
cd demos/terminal && npm run dev
```

## Why No DOM?

- **No DOM API calls** — zero style recalculation, zero reflow, zero composite
- **WASM layout** — Yoga runs at near-native speed
- **Server-computed** — clients never pay layout cost, just paint pre-computed coordinates
- **Geometry diffs** — updates send only changed `{ x, y, w, h }`, not full re-renders
- **No framework runtime on client** — the thin client is a paint loop, not a reconciler
- **AI-native** — agents get exact geometry via MCP without needing a browser

## License

MIT

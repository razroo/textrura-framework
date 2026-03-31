# Geometra

**The Singularity Frontend Framework**

**[Live Demo](https://razroo.github.io/geometra)** | **[npm](https://www.npmjs.com/org/geometra)** | **[GitHub](https://github.com/razroo/geometra)**

https://github.com/user-attachments/assets/1610d856-3c7d-4fce-be42-1c43306e6520

The client is the server. The server is the client. Geometra is a DOM-free frontend framework built on the [Textura](https://github.com/razroo/textura) layout engine where client and server are interchangeable — the same JSON geometry protocol powers both. Human and AI interaction is native to both sides. No browser layout engine. No DOM. Just computed geometry piped straight to render targets.

AI agents interact with the server directly via the same JSON protocol the client uses — no browser middleman, no scraping, no hacks. Agents move 1000x faster because they skip the entire rendering pipeline. Multiple client/server instances can run inside a single client. This is singularity tech.

- Dashboard: https://razroo.github.io/geometra-demo/
- Agent Demo: https://razroo.github.io/geometra-demo/agent-demo.html

## How It Works

```
Traditional:  HTML → CSS Parser → DOM → Layout → Paint → Composite
Geometra:     Declarative Tree → Yoga WASM → Computed Geometry → Render Target
```

The framework replaces the entire browser rendering pipeline. Layout is computed via Yoga (Facebook's flexbox engine compiled to WASM). Text is measured via Pretext. The output is pure geometry — `{ x, y, width, height }` — rendered by pluggable backends: Canvas2D, Terminal, or raw geometry for AI agents.

## Packages

| Package | Description |
|---|---|
| `@geometra/core` | Component model, signals, hit-testing, semantic/a11y tree generation, text-input primitives |
| `@geometra/renderer-canvas` | Canvas2D paint backend + selection + optional accessibility mirror |
| `@geometra/renderer-terminal` | ANSI terminal/TUI paint backend |
| `@geometra/server` | Server-side layout engine with WebSocket geometry streaming (versioned protocol) |
| `@geometra/client` | Thin client that receives pre-computed geometry and paints it (versioned protocol checks) |
| `@geometra/router` | Routing foundation package (pattern matching today; navigation/data APIs in progress) |

## Quick Start

### Phase 1: Local Canvas Rendering

```ts
import { signal, box, text, createApp } from '@geometra/core'
import { CanvasRenderer } from '@geometra/renderer-canvas'

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
import { signal, box, text } from '@geometra/core/node'
import { createServer } from '@geometra/server'

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
import { CanvasRenderer } from '@geometra/renderer-canvas'
import { createClient } from '@geometra/client'

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
import { signal, box, text, createApp } from '@geometra/core/node'
import { TerminalRenderer } from '@geometra/renderer-terminal'

const renderer = new TerminalRenderer()

function view() {
  return box({ flexDirection: 'column', padding: 16, gap: 8 }, [
    box({ backgroundColor: '#0a0a2e', padding: 12 }, [
      text({ text: 'GEOMETRA TUI', font: 'bold 20px monospace', lineHeight: 26, color: '#e94560' }),
    ]),
    text({ text: 'Flexbox layout in your terminal.', font: '14px monospace', lineHeight: 18, color: '#aaa' }),
  ])
}

await createApp(view, renderer, { width: 533, height: 320 })
```

## Reactivity

Geometra uses a minimal signals system. When a signal changes, only the affected parts of the tree re-layout and re-render.

```ts
import { signal, computed, effect, batch } from '@geometra/core'

const name = signal('world')
const greeting = computed(() => `Hello, ${name.value}!`)

effect(() => console.log(greeting.value))  // "Hello, world!"

name.set('Geometra')                        // "Hello, Geometra!"

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

## Routing Quick Start

Geometra routing is available in `@geometra/router` and is renderer-agnostic.

```ts
import { createRouter, createMemoryHistory, link, matchRouteTree } from '@geometra/router'

const router = createRouter({
  history: createMemoryHistory({ initialEntries: ['/'] }),
  routes: [
    { id: 'home', path: '/' },
    { id: 'users', path: '/users/:id' },
    { id: 'not-found', path: '/*' },
  ],
})

router.start()
await router.navigate('/users/42')
```

For full routing details, see `packages/router/README.md` and `ROUTER_DELIVERY_REPORT.md`.

## Accessibility and Text Input Foundations

Geometra now exposes runtime primitives so non-DOM renderers can still provide accessibility and editing behavior:

- `toAccessibilityTree(tree, layout)` in `@geometra/core` maps UI + geometry to role/name/bounds/focusable nodes.
- `enableAccessibilityMirror(host, renderer)` in `@geometra/renderer-canvas` syncs a hidden DOM mirror for assistive tech.
- `insertInputText`, `replaceInputSelection`, `backspaceInput`, `deleteInput`, `moveInputCaret` in `@geometra/core` provide selection-aware text editing logic you can wire to keyboard handlers.

### Text-input semantics

- Input state uses `{ nodes, selection }`, where `selection` is `anchor*`/`focus*` node-local offsets.
- Editing helpers normalize reversed selections, replace selected ranges first, then collapse caret at insertion/deletion end.
- `moveInputCaret(state, dir, true)` extends selection from the anchor; without extend it collapses to directional edge first, then moves.
- `Backspace` at node start merges with previous node; `Delete` at node end merges with next node.
- Composition flow should snapshot selection on `onCompositionStart`, update transient draft on `onCompositionUpdate`, and commit text on `onCompositionEnd`.
- `getInputCaretGeometry` only returns non-null for collapsed selections and clamps offsets to measured text bounds.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Application                      │
│  Components → Signals → Layout Trees              │
├──────────────────────────────────────────────────┤
│              @geometra/core                        │
│  box() / text() → toLayoutTree() → computeLayout()│
├──────────────────────────────────────────────────┤
│              textura (layout engine)               │
│  Yoga WASM + Pretext → { x, y, width, height }   │
├───────────┬───────────┬───────────┬──────────────┤
│ Canvas2D  │  Terminal  │  Server   │ Raw Geometry  │
│ Renderer  │  Renderer  │ → Client  │ (AI Agents)   │
└───────────┴───────────┴───────────┴──────────────┘
```

## Protocol (v1)

Client and server exchange JSON messages over WebSocket with optional `protocolVersion`.

- **Server -> Client**
  - `frame`: `{ type: 'frame', layout, tree, protocolVersion?: 1 }`
  - `patch`: `{ type: 'patch', patches, protocolVersion?: 1 }`
  - `error`: `{ type: 'error', message, protocolVersion?: 1 }`
- **Client -> Server**
  - `event`: pointer/click hit-test events (`onClick`, `onPointerDown`, `onPointerUp`, `onPointerMove`)
  - `key`: keyboard events (`onKeyDown`, `onKeyUp`)
  - `composition`: IME events (`onCompositionStart`, `onCompositionUpdate`, `onCompositionEnd`)
  - `resize`: viewport updates (`width`, `height`)

Compatibility notes:

- Unversioned messages are treated as protocol v1.
- If one side receives a **newer** protocol version than it supports, it returns/raises an error instead of silently misbehaving.
- Server layout dimensions can be updated live via `resize`, allowing true server-computed responsive layouts.

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

# Text input playground (canvas)
cd demos/text-input-canvas && npm run dev
```

Bun equivalents (faster install/startup in many environments):

```bash
bun install
bun run demo:build
bun run test
```

## Why Singularity Tech?

The boundary between client and server dissolves. The same geometry protocol that renders pixels on a canvas also feeds data to AI agents. Humans and AI agents are first-class citizens on both sides of the wire.

- **Client = Server** — the same JSON geometry protocol runs on both; either side can compute, either side can render
- **AI-native** — agents interact with the server directly, no browser needed, no scraping — 1000x faster than DOM-based frameworks
- **Multi-instance** — run multiple client/server pairs inside a single client for parallel AI agent workloads
- **No DOM API calls** — zero style recalculation, zero reflow, zero composite
- **WASM layout** — Yoga runs at near-native speed
- **Server-computed** — clients never pay layout cost, just paint pre-computed coordinates
- **Geometry diffs** — updates send only changed `{ x, y, w, h }`, not full re-renders
- **No framework runtime on client** — the thin client is a paint loop, not a reconciler

## License

MIT

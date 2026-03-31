# @geometra/core

DOM-free UI framework core. Build declarative interfaces rendered to Canvas, terminal, or server-streamed layouts.

## Install

```bash
npm install @geometra/core
```

## Key Exports

- `signal`, `computed`, `effect`, `batch` -- reactive primitives
- `box`, `text`, `image` -- element constructors
- `createApp` -- application entry point
- `toSemanticHTML` -- SEO-friendly HTML generation
- `toAccessibilityTree` -- runtime accessibility tree from geometry
- `insertInputText`, `backspaceInput`, `deleteInput` -- text-input editing primitives
- `getInputCaretGeometry` -- caret x/y/height from measured text lines
- `transition`, `spring` -- animation utilities

## Usage

```ts
import { box, text, createApp, signal } from '@geometra/core'

const count = signal(0)

const app = createApp(() =>
  box({ width: 300, height: 200, padding: 20, gap: 10 }, [
    text({ text: `Count: ${count.value}`, font: 'bold 24px sans-serif', lineHeight: 30 }),
    box({ width: 100, height: 40, backgroundColor: '#07f', onClick: () => count.set(count.peek() + 1) }, [
      text({ text: 'Click me', font: '16px sans-serif', lineHeight: 20, color: '#fff' }),
    ]),
  ])
)
```

## Links

- [Main repo](https://github.com/AiGeekz/geometra)

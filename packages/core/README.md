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
- `createTextInputHistory`, `undoTextInputHistory` -- undo/redo state helpers
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

## Text input contract

- `TextInputState` is immutable editor state: `{ nodes: string[], selection }`.
- `selection` is node-local and may be reversed; helpers normalize internally.
- `insertInputText`/`replaceInputSelection` always collapse caret after replacement.
- `backspaceInput`/`deleteInput` delete active selections first, then apply boundary merge behavior across nodes.
- `moveInputCaret` supports range extension via `extendSelection=true`.
- `getInputCaretGeometry` is defined for collapsed selections with measured line metrics; expanded ranges return `null`.

## Accessibility guarantees and limits

- `toAccessibilityTree(tree, layout)` emits deterministic role/name/bounds/focusable nodes for geometry-rendered UIs.
- Semantic overrides (`semantic.tag`, `semantic.role`, `semantic.ariaLabel`, `semantic.alt`) are preserved when projecting accessibility and semantic HTML output.
- The core package does not directly expose native accessibility APIs; renderer integrations (for example canvas mirror strategies) are responsible for host-level assistive technology bridging.

## Links

- [Main repo](https://github.com/AiGeekz/geometra)

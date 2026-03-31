# @geometra/ui

High-level primitives on top of [`@geometra/core`](../core) (`box`, `text`, signals). Intended for app UIs and demos.

## Stability

| API | Status |
|-----|--------|
| `button`, `input`, `list`, `dialog` | **stable** — covered by tests; breaking changes only with major bumps |
| `checkbox`, `radio`, `tabs` | **stable** |
| `toast`, `commandPalette`, `menu`, `selectControl`, `dataTable`, `treeView`, `comboboxField` | **stable** — behavior tested in `src/__tests__/primitives.test.ts`; visual polish may evolve in minors |

Semantics follow ARIA-like `role` / `ariaLabel` fields where applicable; full platform a11y depends on renderer + mirror (see `@geometra/renderer-canvas`).

## Install

```bash
npm install @geometra/ui
```

## Usage

```ts
import { button, input, toast, dataTable } from '@geometra/ui'
import { box, signal } from '@geometra/core'

const msg = signal('')
function view() {
  return box({ flexDirection: 'column', gap: 8, padding: 16 }, [
    input(msg.value, 'Type…', {
      onKeyDown: (e) => { /* update msg from keys */ },
    }),
    dataTable(
      [{ key: 'a', header: 'Name' }],
      [{ a: 'Ada' }],
    ),
  ])
}
```

## Links

- [Main repo](https://github.com/razroo/geometra)

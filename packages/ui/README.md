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

## Key exports

- `button`, `checkbox`, `radio`, `tabs`
- `input`, `selectControl`, `comboboxField`
- `dialog`, `toast`, `menu`, `commandPalette`
- `list`, `dataTable`, `treeView`

## Usage

```ts
import { input, toast, dataTable } from '@geometra/ui'
import { box, signal } from '@geometra/core'

const msg = signal('')
const rows = [
  { name: 'Ada', role: 'Admin' },
  { name: 'Linus', role: 'Editor' },
]

function view() {
  return box({ flexDirection: 'column', gap: 8, padding: 16 }, [
    input(msg.value, 'Type…', {
      focused: true,
      onKeyDown: (e) => {
        if (e.key.length === 1) msg.set(msg.peek() + e.key)
      },
    }),
    toast(`Draft: ${msg.value || 'empty'}`, { variant: 'info' }),
    dataTable([{ key: 'name', header: 'Name' }, { key: 'role', header: 'Role' }], rows),
  ])
}
```

## Notes

- Primitives are renderer-agnostic `UIElement` builders. State, focus, menu open/close, filtering, and async data loading stay in your app.
- `input()` is controlled. You provide the current value, focus state, caret/selection state, and keyboard/composition handlers.
- Semantics use `role` and `ariaLabel` hints when applicable, but full platform accessibility still depends on the renderer and host integration.

## Links

- [Main repo](https://github.com/razroo/geometra)
- [Integration cookbook](https://github.com/razroo/geometra/blob/main/INTEGRATION_COOKBOOK.md)

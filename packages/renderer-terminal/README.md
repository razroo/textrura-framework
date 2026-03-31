# @geometra/renderer-terminal

ANSI terminal renderer for Geometra. Renders UI element trees directly to the terminal using ANSI escape sequences.

## Install

```bash
npm install @geometra/renderer-terminal
```

## Key Export

- `TerminalRenderer` -- renders Geometra element trees to stdout

## Usage

```ts
import { TerminalRenderer } from '@geometra/renderer-terminal'

const renderer = new TerminalRenderer(process.stdout)
renderer.render(tree, layout)
```

## Direction notes

- `dir: 'rtl'` text is right-aligned within each rendered terminal line chunk.
- `dir: 'auto'` inherits parent direction (same baseline behavior as core).
- Full Unicode bidi shaping/reordering is not implemented in the terminal renderer yet.

## Links

- [Main repo](https://github.com/AiGeekz/geometra)

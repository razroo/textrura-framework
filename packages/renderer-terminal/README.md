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

## Links

- [Main repo](https://github.com/AiGeekz/geometra)

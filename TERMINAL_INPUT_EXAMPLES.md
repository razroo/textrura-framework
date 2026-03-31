# Terminal input and focus wiring examples

## 1) Wire raw stdin to `dispatchKey`

```ts
import { createApp, box, text } from '@geometra/core/node'
import { TerminalRenderer } from '@geometra/renderer-terminal'

const renderer = new TerminalRenderer()
const app = await createApp(() =>
  box({ onKeyDown: (e) => console.log('key:', e.key) }, [
    text({ text: 'Terminal input', font: '14px monospace', lineHeight: 18 }),
  ]),
, renderer)

process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdin.setEncoding('utf8')

process.stdin.on('data', (chunk: string) => {
  const key = chunk === '\t' ? 'Tab' : chunk
  app.dispatchKey('onKeyDown', {
    key,
    code: key === 'Tab' ? 'Tab' : 'Unidentified',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
  })
})
```

## 2) Focus traversal with Tab / Shift+Tab

```ts
import { focusNext } from '@geometra/core/node'

if (app.tree && app.layout) {
  focusNext(app.tree, app.layout) // seed initial focus
}

// Map '\x1b[Z' (Shift+Tab in many terminals) to a Tab event with shiftKey=true.
app.dispatchKey('onKeyDown', {
  key: 'Tab',
  code: 'Tab',
  shiftKey: true,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
})
```

## 3) Clean shutdown path (q + Ctrl+C/Ctrl+D)

```ts
function shutdown() {
  app.destroy()
  process.stdin.setRawMode?.(false)
  process.exit(0)
}

process.stdin.on('data', (chunk) => {
  if (chunk === 'q' || chunk === '\x03' || chunk === '\x04') shutdown()
})
```

## 4) Test mode markers for integration tests

Use stderr markers in test mode to assert behavior:

```ts
const testMode = process.env.GEOMETRA_TERMINAL_TEST === '1'
function mark(event: string) {
  if (testMode) process.stderr.write(`[test-event] ${event}\n`)
}
```

Then assert markers from `demos/terminal/input.integration.ts`.

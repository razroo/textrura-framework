import {
  signal,
  box,
  text,
  createApp,
  focusNext,
  focusedElement,
  clearFocus,
} from '../../packages/core/src/node.js'
import type { App, KeyboardHitEvent } from '../../packages/core/src/node.js'
import type { Renderer } from '../../packages/core/src/types.js'
import { TerminalRenderer } from '@geometra/renderer-terminal'

export interface TerminalDemoOptions {
  cols?: number
  rows?: number
  renderer?: Renderer
  onQuit?: () => void
  onTestEvent?: (event: string) => void
}

export interface TerminalDemoHandle {
  app: App
  dispatchChunk(chunk: string): void
  destroy(): void
}

function keyToCode(char: string): string {
  if (char.length !== 1) return 'Unidentified'
  if (char >= 'a' && char <= 'z') return `Key${char.toUpperCase()}`
  if (char >= 'A' && char <= 'Z') return `Key${char}`
  if (char >= '0' && char <= '9') return `Digit${char}`
  return `Key${char.toUpperCase()}`
}

function stdinToKeyboardEvents(chunk: string): Array<Omit<KeyboardHitEvent, 'target'> | 'quit'> {
  const events: Array<Omit<KeyboardHitEvent, 'target'> | 'quit'> = []
  let i = 0

  while (i < chunk.length) {
    const remaining = chunk.slice(i)
    if (remaining.startsWith('\x1b[Z')) {
      events.push({
        key: 'Tab',
        code: 'Tab',
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })
      i += 3
      continue
    }
    if (remaining.startsWith('\x1b[A')) {
      events.push({
        key: 'ArrowUp',
        code: 'ArrowUp',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })
      i += 3
      continue
    }
    if (remaining.startsWith('\x1b[B')) {
      events.push({
        key: 'ArrowDown',
        code: 'ArrowDown',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })
      i += 3
      continue
    }

    const c = chunk[i]!
    if (c === '\x03' || c === '\x04') {
      events.push('quit')
      i++
      continue
    }
    if (c === '\t') {
      events.push({
        key: 'Tab',
        code: 'Tab',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })
      i++
      continue
    }
    if (c === '\r' || c === '\n') {
      events.push({
        key: 'Enter',
        code: 'Enter',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })
      i++
      continue
    }

    const isUpper = c >= 'A' && c <= 'Z'
    events.push({
      key: c,
      code: keyToCode(c),
      shiftKey: isUpper,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    i++
  }

  return events
}

export async function createTerminalDemo(options: TerminalDemoOptions = {}): Promise<TerminalDemoHandle> {
  clearFocus()

  const cols = options.cols ?? 80
  const rows = options.rows ?? 24
  const renderer = options.renderer ?? new TerminalRenderer({ width: cols, height: rows })
  const logTest = (event: string): void => options.onTestEvent?.(event)

  const items = signal(['Build UI', 'No DOM needed', 'Pure geometry', 'Terminal render'])
  const selected = signal(0)
  const statsTicks = signal(0)

  let appInstance: App | null = null
  let destroyed = false

  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    appInstance?.destroy()
    clearFocus()
  }

  const quit = (): void => {
    destroy()
    options.onQuit?.()
  }

  function listItem(label: string, _index: number, isSelected: boolean) {
    return box(
      {
        backgroundColor: isSelected ? '#e94560' : '#16213e',
        padding: 8,
        flexDirection: 'row',
        gap: 8,
        minHeight: 30,
      },
      [
        text({
          text: isSelected ? '>' : ' ',
          font: 'bold 14px monospace',
          lineHeight: 18,
          color: '#ffffff',
        }),
        text({
          text: label,
          font: '14px monospace',
          lineHeight: 18,
          color: isSelected ? '#ffffff' : '#aaaaaa',
        }),
      ],
    )
  }

  function view() {
    const list = items.value
    const sel = selected.value

    return box(
      {
        flexDirection: 'column',
        padding: 16,
        gap: 8,
        width: cols / 0.15,
        height: rows / (0.15 * 0.5),
      },
      [
        box({ backgroundColor: '#0a0a2e', padding: 12, borderRadius: 0 }, [
          text({
            text: 'TEXTURA TUI',
            font: 'bold 20px monospace',
            lineHeight: 26,
            color: '#e94560',
          }),
        ]),
        box(
          {
            flexDirection: 'column',
            gap: 4,
            flexGrow: 1,
            onKeyDown: (e) => {
              const k = e.key
              if (k === 'j' || k === 'ArrowDown') {
                const next = Math.min(selected.peek() + 1, items.peek().length - 1)
                selected.set(next)
                logTest('nav-down')
                return
              }
              if (k === 'k' || k === 'ArrowUp') {
                const prev = Math.max(selected.peek() - 1, 0)
                selected.set(prev)
                logTest('nav-up')
                return
              }
              if (k === 'a' || k === 'A') {
                const current = items.peek()
                items.set([...current, `Item ${current.length + 1}`])
                logTest('add-item')
                return
              }
              if (k === 'q' || k === 'Q') {
                logTest('quit')
                quit()
              }
            },
          },
          list.map((item, i) => listItem(item, i, i === sel)),
        ),
        box(
          {
            backgroundColor: '#1f2937',
            padding: 8,
            onKeyDown: (e) => {
              if (e.key === 'x' || e.key === 'X') {
                statsTicks.set(statsTicks.peek() + 1)
                logTest('stats-tick')
              }
            },
          },
          [
            text({
              text: `Stats panel (focus target): ticks=${statsTicks.value} | press x`,
              font: '12px monospace',
              lineHeight: 16,
              color: '#d1d5db',
            }),
          ],
        ),
        box({ backgroundColor: '#111122', padding: 8 }, [
          text({
            text: 'j/k or arrows: navigate | Tab/Shift+Tab: focus | a/x: actions | q: quit',
            font: '12px monospace',
            lineHeight: 16,
            color: '#555555',
          }),
        ]),
      ],
    )
  }

  const app = await createApp(view, renderer, {
    width: cols / 0.15,
    height: rows / (0.15 * 0.5),
  })

  appInstance = app

  if (app.tree && app.layout) {
    focusNext(app.tree, app.layout)
  }

  return {
    app,
    dispatchChunk(chunk: string): void {
      if (destroyed) return
      const events = stdinToKeyboardEvents(chunk)
      for (const ev of events) {
        if (ev === 'quit') {
          logTest('stdin-quit')
          quit()
          return
        }
        app.dispatchKey('onKeyDown', ev)
        if (ev.key === 'Tab') {
          const idx = focusedElement.peek()?.focusIndex
          if (idx !== undefined) {
            logTest(`focus-slot-${idx}`)
          }
        }
      }
    },
    destroy,
  }
}

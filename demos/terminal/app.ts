import { signal, box, text, createApp } from '@textura/core/node'
import { TerminalRenderer } from '@textura/renderer-terminal'

const cols = process.stdout.columns ?? 80
const rows = process.stdout.rows ?? 24

const renderer = new TerminalRenderer({ width: cols, height: rows })

// State
const items = signal(['Build UI', 'No DOM needed', 'Pure geometry', 'Terminal render'])
const selected = signal(0)

function listItem(label: string, index: number, isSelected: boolean) {
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
      width: cols / 0.15,       // Reverse the terminal scale
      height: rows / (0.15 * 0.5),
    },
    [
      // Title
      box({ backgroundColor: '#0a0a2e', padding: 12, borderRadius: 0 }, [
        text({
          text: 'TEXTURA TUI',
          font: 'bold 20px monospace',
          lineHeight: 26,
          color: '#e94560',
        }),
      ]),
      // List
      box(
        { flexDirection: 'column', gap: 4, flexGrow: 1 },
        list.map((item, i) => listItem(item, i, i === sel)),
      ),
      // Footer
      box({ backgroundColor: '#111122', padding: 8 }, [
        text({
          text: 'j/k: navigate  |  q: quit  |  a: add item',
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

// Keyboard input
process.stdin.setRawMode(true)
process.stdin.resume()
process.stdin.setEncoding('utf8')

process.stdin.on('data', (key: string) => {
  if (key === 'q' || key === '\x03') {
    app.destroy()
    process.exit(0)
  }
  if (key === 'j') {
    const next = Math.min(selected.peek() + 1, items.peek().length - 1)
    selected.set(next)
  }
  if (key === 'k') {
    const prev = Math.max(selected.peek() - 1, 0)
    selected.set(prev)
  }
  if (key === 'a') {
    const current = items.peek()
    items.set([...current, `Item ${current.length + 1}`])
  }
})

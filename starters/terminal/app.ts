import { box, text, createApp } from '@geometra/core/node'
import { TerminalRenderer } from '@geometra/renderer-terminal'

const renderer = new TerminalRenderer({ width: process.stdout.columns ?? 80, height: process.stdout.rows ?? 24 })

await createApp(
  () =>
    box({ padding: 8, gap: 1, flexDirection: 'column' }, [
      text({ text: 'Terminal starter', font: '14px monospace', lineHeight: 18, color: '#ffffff' }),
      text({ text: 'Press Ctrl+C to exit', font: '12px monospace', lineHeight: 16, color: '#94a3b8' }),
    ]),
  renderer,
  { width: 600, height: 300 },
)

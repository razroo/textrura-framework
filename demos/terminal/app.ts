import { TerminalRenderer } from '@geometra/renderer-terminal'
import { createTerminalDemo } from './demo.js'

const cols = process.stdout.columns ?? 80
const rows = process.stdout.rows ?? 24
const testMode = process.env.GEOMETRA_TERMINAL_TEST === '1'

function logTest(event: string): void {
  if (!testMode) return
  process.stderr.write(`[test-event] ${event}\n`)
}

const hasRawMode = typeof process.stdin.setRawMode === 'function' && process.stdin.isTTY
const renderer = new TerminalRenderer({ width: cols, height: rows })

const demo = await createTerminalDemo({
  cols,
  rows,
  renderer,
  onQuit: () => {
    if (hasRawMode) {
      process.stdin.setRawMode(false)
    }
    process.exit(0)
  },
  onTestEvent: logTest,
})

if (hasRawMode) {
  process.stdin.setRawMode(true)
}
process.stdin.resume()
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk: string) => {
  demo.dispatchChunk(chunk)
})

// Emit readiness marker only after stdin listeners are wired.
logTest('boot')

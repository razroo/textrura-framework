import { TerminalRenderer } from '@geometra/renderer-terminal'
import { createTerminalDemo } from './demo.js'

// eslint-disable-next-line no-control-regex -- strip ANSI CSI sequences from captured output
const ESCAPE_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g

function stripAnsi(text: string): string {
  return text.replace(ESCAPE_PATTERN, '').replace(/\r/g, '')
}

class MemoryOutput {
  output = ''

  write(chunk: string | Uint8Array): boolean {
    this.output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    return true
  }
}

interface RunOptions {
  name: string
  steps: Array<{ keys: string }>
  assert: (ctx: { events: string[]; exitCode: number; output: string }) => void
}

async function runScenario(options: RunOptions): Promise<void> {
  const output = new MemoryOutput()
  const events: string[] = []
  let exitCode = 1

  const demo = await createTerminalDemo({
    cols: 80,
    rows: 24,
    renderer: new TerminalRenderer({
      width: 80,
      height: 24,
      output: output as unknown as NodeJS.WritableStream,
    }),
    onTestEvent: (event) => events.push(event),
    onQuit: () => {
      exitCode = 0
    },
  })

  try {
    for (const step of options.steps) {
      demo.dispatchChunk(step.keys)
    }

    options.assert({
      events,
      exitCode,
      output: stripAnsi(output.output),
    })
  } finally {
    demo.destroy()
  }
}

async function run(): Promise<void> {
  for (const scenario of [
    {
      name: 'chunked-keys-and-quit',
      steps: [
        { keys: 'aj' },
        { keys: 'q' },
      ],
      assert: ({ events, exitCode, output }) => {
        if (!output.includes('TEXTURA TUI')) {
          throw new Error('Expected title not rendered')
        }
        if (!events.includes('add-item')) {
          throw new Error(`Expected add-item (saw: ${events.join(', ')})`)
        }
        if (!events.includes('nav-down')) {
          throw new Error(`Expected nav-down (saw: ${events.join(', ')})`)
        }
        if (!events.includes('quit')) {
          throw new Error(`Expected quit from handler (saw: ${events.join(', ')})`)
        }
        if (exitCode !== 0) {
          throw new Error(`Expected exit 0, got ${exitCode}`)
        }
      },
    },
    {
      name: 'arrow-escape-sequences',
      steps: [
        { keys: '\x1b[B\x1b[A' },
        { keys: 'q' },
      ],
      assert: ({ events, exitCode }) => {
        if (!events.includes('nav-down')) {
          throw new Error(`Expected ArrowDown -> nav-down (saw: ${events.join(', ')})`)
        }
        if (!events.includes('nav-up')) {
          throw new Error(`Expected ArrowUp -> nav-up (saw: ${events.join(', ')})`)
        }
        if (exitCode !== 0) {
          throw new Error(`Expected exit 0, got ${exitCode}`)
        }
      },
    },
    {
      name: 'tab-focus-and-stats',
      steps: [{ keys: '\tx\x1b[Zq' }],
      assert: ({ events, exitCode }) => {
        if (!events.includes('focus-slot-1')) {
          throw new Error(`Expected focus on stats panel (focus-slot-1) (saw: ${events.join(', ')})`)
        }
        if (!events.includes('stats-tick')) {
          throw new Error(`Expected stats-tick after x (saw: ${events.join(', ')})`)
        }
        if (!events.includes('focus-slot-0')) {
          throw new Error(`Expected focus back on list after Shift+Tab (saw: ${events.join(', ')})`)
        }
        if (exitCode !== 0) {
          throw new Error(`Expected exit 0, got ${exitCode}`)
        }
      },
    },
    {
      name: 'tab-wrap-focus-cycles',
      steps: [{ keys: '\t\tq' }],
      assert: ({ events, exitCode }) => {
        const focusEvents = events.filter(e => e.startsWith('focus-slot-'))
        if (!focusEvents.includes('focus-slot-1')) {
          throw new Error(`Expected first Tab to reach focus-slot-1 (saw: ${events.join(', ')})`)
        }
        if (!focusEvents.includes('focus-slot-0')) {
          throw new Error(`Expected second Tab to wrap back to focus-slot-0 (saw: ${events.join(', ')})`)
        }
        if (exitCode !== 0) {
          throw new Error(`Expected exit 0, got ${exitCode}`)
        }
      },
    },
    {
      name: 'ctrl-c-exit',
      steps: [{ keys: '\x03' }],
      assert: ({ events, exitCode }) => {
        if (!events.includes('stdin-quit')) {
          throw new Error(`Expected stdin-quit for Ctrl+C (saw: ${events.join(', ')})`)
        }
        if (exitCode !== 0) {
          throw new Error(`Expected exit 0, got ${exitCode}`)
        }
      },
    },
    {
      name: 'ctrl-d-exit',
      steps: [{ keys: '\x04' }],
      assert: ({ events, exitCode }) => {
        if (!events.includes('stdin-quit')) {
          throw new Error(`Expected stdin-quit for Ctrl+D (saw: ${events.join(', ')})`)
        }
        if (exitCode !== 0) {
          throw new Error(`Expected exit 0, got ${exitCode}`)
        }
      },
    },
  ] satisfies RunOptions[]) {
    await runScenario(scenario)
  }

  process.stdout.write('Terminal input integration tests passed.\n')
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})

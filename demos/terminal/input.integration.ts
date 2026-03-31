import { spawn } from 'node:child_process'

// eslint-disable-next-line no-control-regex -- strip ANSI CSI sequences from captured output
const ESCAPE_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g

function stripAnsi(text: string): string {
  return text.replace(ESCAPE_PATTERN, '').replace(/\r/g, '')
}

function observedTestEvents(output: string): string[] {
  return [...output.matchAll(/\[test-event\]\s+([^\n]+)/g)].map((m) => m[1]!)
}

interface RunOptions {
  name: string
  /** Wait before sending keys (ms). Default 1200. */
  bootDelayMs?: number
  /** Key sequences with optional per-step delay (ms). */
  steps: Array<{ keys: string; delayMs?: number }>
  assert: (ctx: { events: string[]; exitCode: number; output: string }) => void
}

function spawnDemo(): ReturnType<typeof spawn> {
  return spawn('npx', ['tsx', 'app.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, TERM: 'xterm-256color', GEOMETRA_TERMINAL_TEST: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

async function runScenario(options: RunOptions): Promise<void> {
  const child = spawnDemo()
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })

  const send = (key: string, delayMs = 300): Promise<void> =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        if (child.killed || child.exitCode !== null) {
          reject(new Error(`${options.name}: process exited before key send`))
          return
        }
        child.stdin.write(key, 'utf8')
        resolve()
      }, delayMs)
    })

  const exitPromise = new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })

  await send('', options.bootDelayMs ?? 1200)
  for (const step of options.steps) {
    await send(step.keys, step.delayMs ?? 300)
  }

  const exitCode = await Promise.race<number>([
    exitPromise,
    new Promise<number>((_, reject) => {
      setTimeout(() => reject(new Error(`${options.name}: timed out waiting for exit`)), 12_000)
    }),
  ])

  const allFrames = stripAnsi(output)
  const events = observedTestEvents(allFrames)
  options.assert({ events, exitCode, output: allFrames })
}

async function run(): Promise<void> {
  await runScenario({
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
  })

  await runScenario({
    name: 'arrow-escape-sequences',
    steps: [
      { keys: '\x1b[B\x1b[A', delayMs: 400 },
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
  })

  await runScenario({
    name: 'tab-focus-and-stats',
    bootDelayMs: 1600,
    // One stdin chunk so Tab → x → Shift+Tab → q stay ordered (matches real TTY coalescing).
    steps: [{ keys: '\tx\x1b[Zq', delayMs: 400 }],
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
  })

  await runScenario({
    name: 'ctrl-c-exit',
    steps: [{ keys: '\x03', delayMs: 500 }],
    assert: ({ events, exitCode }) => {
      if (!events.includes('stdin-quit')) {
        throw new Error(`Expected stdin-quit for Ctrl+C (saw: ${events.join(', ')})`)
      }
      if (exitCode !== 0) {
        throw new Error(`Expected exit 0, got ${exitCode}`)
      }
    },
  })

  await runScenario({
    name: 'ctrl-d-exit',
    steps: [{ keys: '\x04', delayMs: 500 }],
    assert: ({ events, exitCode }) => {
      if (!events.includes('stdin-quit')) {
        throw new Error(`Expected stdin-quit for Ctrl+D (saw: ${events.join(', ')})`)
      }
      if (exitCode !== 0) {
        throw new Error(`Expected exit 0, got ${exitCode}`)
      }
    },
  })

  process.stdout.write('Terminal input integration tests passed.\n')
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})

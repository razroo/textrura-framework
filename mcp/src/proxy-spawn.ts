import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import path from 'node:path'

const require = createRequire(import.meta.url)

/** Resolve bundled @geometra/proxy CLI entry (dist/index.js). */
export function resolveProxyScriptPath(): string {
  try {
    const pkgJson = require.resolve('@geometra/proxy/package.json')
    return path.join(path.dirname(pkgJson), 'dist/index.js')
  } catch {
    throw new Error(
      'Could not resolve @geometra/proxy. Install it with the MCP package: npm install @geometra/proxy',
    )
  }
}

function canBindPort(p: number): Promise<boolean> {
  return new Promise(resolve => {
    const s = createServer()
    s.once('error', () => resolve(false))
    s.listen(p, '127.0.0.1', () => {
      s.close(() => resolve(true))
    })
  })
}

function getEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const a = s.address()
      s.close(err => {
        if (err) {
          reject(err)
          return
        }
        if (typeof a === 'object' && a !== null && 'port' in a) resolve(a.port)
        else reject(new Error('Could not allocate ephemeral port'))
      })
    })
  })
}

/** Prefer `preferred` when free; otherwise an ephemeral port on 127.0.0.1. */
export async function pickFreePort(preferred?: number): Promise<number> {
  if (preferred != null && preferred > 0 && preferred <= 65535) {
    if (await canBindPort(preferred)) return preferred
  }
  return getEphemeralPort()
}

export interface SpawnProxyParams {
  pageUrl: string
  port: number
  headless?: boolean
  width?: number
  height?: number
  slowMo?: number
}

const LISTEN_RE = /WebSocket listening on (ws:\/\/127\.0\.0\.1:\d+)/

/**
 * Spawn geometra-proxy as a child process and resolve when the WebSocket is listening.
 */
export function spawnGeometraProxy(opts: SpawnProxyParams): Promise<{ child: ChildProcess; wsUrl: string }> {
  const script = resolveProxyScriptPath()
  const args = [script, opts.pageUrl, '--port', String(opts.port)]
  if (opts.width != null && opts.width > 0) args.push('--width', String(opts.width))
  if (opts.height != null && opts.height > 0) args.push('--height', String(opts.height))
  if (opts.slowMo != null && opts.slowMo > 0) args.push('--slow-mo', String(opts.slowMo))
  if (opts.headless === true) args.push('--headless')
  else if (opts.headless === false) args.push('--headed')

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let settled = false
    let stderrBuf = ''

    const deadline = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill('SIGTERM')
        reject(new Error('geometra-proxy did not report a listening WebSocket within 45s'))
      }
    }, 45_000)

    const flushStderr = (chunk: Buffer) => {
      stderrBuf += chunk.toString()
      const m = stderrBuf.match(LISTEN_RE)
      if (m && !settled) {
        settled = true
        clearTimeout(deadline)
        child.stderr?.removeAllListeners('data')
        resolve({ child, wsUrl: m[1]! })
      }
    }

    child.stderr?.on('data', flushStderr)

    child.on('error', err => {
      if (!settled) {
        settled = true
        clearTimeout(deadline)
        reject(err)
      }
    })

    child.on('exit', (code, sig) => {
      if (!settled) {
        settled = true
        clearTimeout(deadline)
        const tail = stderrBuf.trim().slice(-2000)
        reject(
          new Error(
            `geometra-proxy exited before ready (code=${code} signal=${sig}). Stderr (tail): ${tail || '(empty)'}`,
          ),
        )
      }
    })
  })
}

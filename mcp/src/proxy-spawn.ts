import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const READY_SIGNAL_TYPE = 'geometra-proxy-ready'
const READY_TIMEOUT_MS = 45_000
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

/** Resolve bundled @geometra/proxy CLI entry (dist/index.js). */
export function resolveProxyScriptPath(): string {
  return resolveProxyScriptPathWith(require)
}

export function resolveProxyScriptPathWith(customRequire: NodeRequire, moduleDir = MODULE_DIR): string {
  const errors: string[] = []

  try {
    const pkgJson = customRequire.resolve('@geometra/proxy/package.json')
    return path.join(path.dirname(pkgJson), 'dist/index.js')
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  try {
    return customRequire.resolve('@geometra/proxy')
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  const packagedSiblingDist = path.resolve(moduleDir, '../../proxy/dist/index.js')
  if (existsSync(packagedSiblingDist)) {
    return packagedSiblingDist
  }
  errors.push(`Packaged sibling fallback not found at ${packagedSiblingDist}`)

  const workspaceDist = path.resolve(moduleDir, '../../packages/proxy/dist/index.js')
  if (existsSync(workspaceDist)) {
    return workspaceDist
  }
  errors.push(`Workspace fallback not found at ${workspaceDist}`)

  throw new Error(
    `Could not resolve @geometra/proxy. Install it with the MCP package: npm install @geometra/proxy. Resolution errors: ${errors.join(' | ')}`,
  )
}

export interface SpawnProxyParams {
  pageUrl: string
  port: number
  headless?: boolean
  width?: number
  height?: number
  slowMo?: number
}

export function parseProxyReadySignalLine(line: string): string | undefined {
  const trimmed = line.trim()
  if (!trimmed) return undefined

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { type?: unknown; wsUrl?: unknown }
      if (
        parsed.type === READY_SIGNAL_TYPE &&
        typeof parsed.wsUrl === 'string' &&
        /^ws:\/\/127\.0\.0\.1:\d+$/.test(parsed.wsUrl)
      ) {
        return parsed.wsUrl
      }
    } catch {
      /* ignore non-JSON lines */
    }
  }

  const fallback = trimmed.match(/WebSocket listening on (ws:\/\/127\.0\.0\.1:\d+)/)
  return fallback?.[1]
}

export function formatProxyStartupFailure(message: string, opts: SpawnProxyParams): string {
  const hints: string[] = []

  if (/Executable doesn't exist|playwright install chromium|browserType\.launch/i.test(message)) {
    hints.push('Install Chromium with: npx playwright install chromium')
  }

  if (opts.port > 0 && /EADDRINUSE|address already in use/i.test(message)) {
    hints.push(
      `Requested port ${opts.port} is unavailable. Omit the port to use an ephemeral OS-assigned port, or choose another local port.`,
    )
  }

  if (hints.length === 0) return message
  return `${message}\nHint: ${hints.join(' ')}`
}

/**
 * Spawn geometra-proxy as a child process and resolve when it emits a structured ready signal.
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
      env: { ...process.env, GEOMETRA_PROXY_READY_JSON: '1' },
    })

    let settled = false
    let stdoutBuf = ''
    let stderrBuf = ''

    const cleanup = () => {
      clearTimeout(deadline)
      child.stdout?.removeAllListeners('data')
      child.stderr?.removeAllListeners('data')
    }

    const tryResolveReady = (line: string) => {
      const wsUrl = parseProxyReadySignalLine(line)
      if (!wsUrl || settled) return false
      settled = true
      cleanup()
      resolve({ child, wsUrl })
      return true
    }

    const consumeStdout = (chunk: Buffer) => {
      stdoutBuf += chunk.toString()
      const lines = stdoutBuf.split(/\r?\n/)
      stdoutBuf = lines.pop() ?? ''
      for (const line of lines) {
        if (tryResolveReady(line)) return
      }
    }

    const consumeStderr = (chunk: Buffer) => {
      stderrBuf += chunk.toString()
      const lines = stderrBuf.split(/\r?\n/)
      stderrBuf = lines.pop() ?? ''
      for (const line of lines) {
        if (tryResolveReady(line)) return
      }
    }

    const deadline = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill('SIGTERM')
        cleanup()
        reject(
          new Error(
            formatProxyStartupFailure('geometra-proxy did not emit a ready signal within 45s', opts),
          ),
        )
      }
    }, READY_TIMEOUT_MS)

    child.stdout?.on('data', consumeStdout)
    child.stderr?.on('data', consumeStderr)

    child.on('error', err => {
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error(formatProxyStartupFailure(err.message, opts)))
      }
    })

    child.on('exit', (code, sig) => {
      if (!settled) {
        settled = true
        cleanup()
        const stderrTail = stderrBuf.trim().slice(-2000)
        reject(
          new Error(
            formatProxyStartupFailure(
              `geometra-proxy exited before ready (code=${code} signal=${sig}). Stderr (tail): ${stderrTail || '(empty)'}`,
              opts,
            ),
          ),
        )
      }
    })
  })
}

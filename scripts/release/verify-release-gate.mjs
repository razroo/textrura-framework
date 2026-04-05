import { access, readFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

/** Stable repo-relative path for duplicate checks; rejects `..` segments that escape `root`. */
function canonicalPackagesTestPath(rel) {
  const abs = resolve(root, rel)
  const back = relative(root, abs)
  if (back.startsWith('..') || back === '') {
    throw new Error(`release:gate: vitest path must resolve inside repo root: ${rel}`)
  }
  return back.split('\\').join('/')
}

async function main() {
  const raw = await readFile(join(root, 'package.json'), 'utf8')
  const pkg = JSON.parse(raw)
  const gate = pkg.scripts?.['release:gate']
  if (typeof gate !== 'string' || !gate.trim()) {
    throw new Error('package.json: missing scripts.release:gate string')
  }

  if (!gate.includes('verify-release-gate')) {
    throw new Error(
      'release:gate: package.json scripts.release:gate must invoke verify-release-gate (duplicate/missing test path check)',
    )
  }
  if (!gate.includes('test:terminal-input')) {
    throw new Error(
      'release:gate: package.json scripts.release:gate must invoke test:terminal-input (@geometra/demo-terminal input suite)',
    )
  }

  const segments = gate.split(/\s+&&\s+/).map(s => s.trim())
  const lastSegment = segments[segments.length - 1] ?? ''
  if (!lastSegment.includes('test:terminal-input')) {
    throw new Error(
      'release:gate: test:terminal-input must be the final && segment (nothing may run after the demo-terminal input suite)',
    )
  }
  // CI and local docs require Bun for `@geometra/demo-terminal` input wiring; `npm run` here would hide missing Bun.
  if (!/\bbun\s+run\s+test:terminal-input\b/.test(lastSegment)) {
    throw new Error(
      'release:gate: final && segment must be `bun run test:terminal-input` (Bun on PATH is required for the demo-terminal input suite)',
    )
  }

  const terminalMatches = gate.match(/\bbun\s+run\s+test:terminal-input\b/g)
  if (!terminalMatches || terminalMatches.length !== 1) {
    throw new Error(
      'release:gate: scripts.release:gate must include exactly one `bun run test:terminal-input` (duplicate or missing breaks ordering and wastes CI time)',
    )
  }

  const firstSegment = segments[0] ?? ''
  if (!firstSegment.includes('verify-release-gate.mjs')) {
    throw new Error(
      'release:gate: first && segment must run scripts/release/verify-release-gate.mjs so duplicate/missing vitest paths fail before the long vitest run',
    )
  }

  const tokens = gate.split(/\s+/).filter(Boolean)
  const paths = tokens.filter(t => t.startsWith('packages/') && t.endsWith('.test.ts'))

  if (paths.length === 0) {
    throw new Error('release:gate: no packages/**/*.test.ts paths found (gate misconfigured)')
  }

  const seen = new Map()
  for (const rel of paths) {
    if (rel.includes('\\')) {
      throw new Error(
        `release:gate: vitest allowlist paths must use forward slashes (POSIX); backslashes break duplicate resolution and cross-platform CI: ${rel}`,
      )
    }
    if (!rel.includes('/src/__tests__/')) {
      throw new Error(
        `release:gate: vitest allowlist paths must live under packages/<pkg>/src/__tests__/ (got: ${rel})`,
      )
    }
    const canonical = canonicalPackagesTestPath(rel)
    if (seen.has(canonical)) {
      throw new Error(
        `release:gate: duplicate vitest entry after path resolution "${canonical}" (listed as "${seen.get(canonical)}" and "${rel}"; vitest would run it twice)`,
      )
    }
    seen.set(canonical, rel)
    const abs = resolve(root, rel)
    try {
      await access(abs, fsConstants.R_OK)
    } catch {
      throw new Error(`release:gate: missing or unreadable file: ${rel}`)
    }
  }
}

main().catch(err => {
  console.error(String(err?.message ?? err))
  process.exit(1)
})

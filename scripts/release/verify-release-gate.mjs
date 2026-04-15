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
  if (!/\bvitest\s+run\b/.test(gate)) {
    throw new Error(
      'release:gate: scripts.release:gate must include `vitest run` (allowlisted suites); `vitest` alone is watch-mode and must not ship as the gate',
    )
  }

  const vitestRunMatches = gate.match(/\bvitest\s+run\b/g)
  if (!vitestRunMatches || vitestRunMatches.length !== 1) {
    throw new Error(
      'release:gate: scripts.release:gate must include exactly one `vitest run` (single argv batch for the allowlist; multiple runs split duplicate detection and can double CI time)',
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

  if (segments.length !== 3) {
    const preview = segments.map((s, i) => `${i + 1}:${s.length > 72 ? `${s.slice(0, 72)}…` : s}`).join(' | ')
    throw new Error(
      `release:gate: expected exactly three && segments (verify-release-gate.mjs, single vitest run batch, bun run test:terminal-input); got ${segments.length} (${preview})`,
    )
  }
  const vitestSegment = segments[1] ?? ''
  if (!/^\s*vitest\s+run\b/.test(vitestSegment)) {
    throw new Error(
      'release:gate: second && segment must be the single vitest allowlist batch (must start with `vitest run`)',
    )
  }
  // Watch mode never belongs in CI gate scripts — it blocks until interrupted and ignores the allowlist intent.
  if (/--watch(?:All)?\b/.test(vitestSegment) || /(^|\s)-w(\s|$)/.test(vitestSegment)) {
    throw new Error(
      'release:gate: vitest batch segment must not include watch-mode flags (--watch, --watchAll, -w); the gate must be a single non-interactive `vitest run` batch',
    )
  }

  const tokens = gate.split(/\s+/).filter(Boolean)
  const paths = tokens.filter(t => t.startsWith('packages/') && t.endsWith('.test.ts'))

  if (paths.length === 0) {
    throw new Error('release:gate: no packages/**/*.test.ts paths found (gate misconfigured)')
  }

  /** Invariants: do not drop these from `scripts.release:gate` without an explicit docs/gate update. */
  const requiredVitestAllowlistPaths = [
    'packages/core/src/__tests__/geometry-snapshot-ci.test.ts',
    'packages/core/src/__tests__/layout-bounds.test.ts',
    'packages/core/src/__tests__/hit-test.test.ts',
    'packages/core/src/__tests__/keyboard.test.ts',
    'packages/core/src/__tests__/text-input.test.ts',
    'packages/core/src/__tests__/text-input-invariants.test.ts',
    'packages/core/src/__tests__/text-input-history.test.ts',
    'packages/core/src/__tests__/virtual-scroll.test.ts',
    'packages/core/src/__tests__/performance-now.test.ts',
  ]
  for (const required of requiredVitestAllowlistPaths) {
    if (!paths.includes(required)) {
      throw new Error(
        `release:gate: required vitest allowlist entry missing: ${required} (geometry CI, layout-bounds, hit-test, keyboard dispatch/focus order, text input + IME/history, virtual-scroll windowing, performance-now timing guards are release-critical; see GEOMETRY_SNAPSHOT_TESTING.md / FRAMEWORK_NORTH_STAR)`,
      )
    }
  }

  /** @type {Array<{ rel: string, canonical: string }>} */
  const validated = []
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
    validated.push({ rel, canonical })
  }

  /** @type {Map<string, string[]>} */
  const byCanonical = new Map()
  for (const { rel, canonical } of validated) {
    const list = byCanonical.get(canonical) ?? []
    list.push(rel)
    byCanonical.set(canonical, list)
  }
  for (const [canonical, list] of byCanonical) {
    if (list.length > 1) {
      const sorted = [...new Set(list)].sort()
      // 1-based indices into the whitespace-split scripts.release:gate string (npm run argv order).
      const argvPositions = []
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]
        if (!t.startsWith('packages/') || !t.endsWith('.test.ts')) continue
        if (t.includes('\\')) continue
        if (!t.includes('/src/__tests__/')) continue
        let can
        try {
          can = canonicalPackagesTestPath(t)
        } catch {
          continue
        }
        if (can === canonical) argvPositions.push(i + 1)
      }
      const posHint =
        argvPositions.length > 0
          ? ` Duplicate path tokens appear at argv positions ${argvPositions.join(', ')} (1-based words in scripts.release:gate).`
          : ''
      throw new Error(
        `release:gate: duplicate vitest entry after path resolution "${canonical}" (listed as: ${sorted.join(' | ')}; vitest would run the file ${list.length} times).${posHint} ` +
          `Search the full scripts.release:gate line in package.json — allowlist paths are not grouped by package, so the same file can appear twice far apart (e.g. near the start and again later).`,
      )
    }
  }

  for (const { rel } of validated) {
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

import { access, readFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

async function main() {
  const raw = await readFile(join(root, 'package.json'), 'utf8')
  const pkg = JSON.parse(raw)
  const gate = pkg.scripts?.['release:gate']
  if (typeof gate !== 'string' || !gate.trim()) {
    throw new Error('package.json: missing scripts.release:gate string')
  }

  const tokens = gate.split(/\s+/).filter(Boolean)
  const paths = tokens.filter(t => t.startsWith('packages/') && t.endsWith('.test.ts'))

  if (paths.length === 0) {
    throw new Error('release:gate: no packages/**/*.test.ts paths found (gate misconfigured)')
  }

  const seen = new Set()
  for (const rel of paths) {
    if (seen.has(rel)) {
      throw new Error(`release:gate: duplicate vitest entry "${rel}" (vitest would run it twice)`)
    }
    seen.add(rel)
    const abs = join(root, rel)
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

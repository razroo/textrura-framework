import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const demosRoot = path.join(repoRoot, 'demos')

const directories = readdirSync(demosRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

for (const dirname of directories) {
  const cwd = path.join(demosRoot, dirname)
  const manifestPath = path.join(cwd, 'package.json')
  if (!existsSync(manifestPath)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  if (!manifest.scripts?.build) continue

  const label = manifest.name ?? dirname
  process.stdout.write(`\n[examples] building ${label}\n`)
  const result = spawnSync('bun', ['run', 'build'], {
    cwd,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

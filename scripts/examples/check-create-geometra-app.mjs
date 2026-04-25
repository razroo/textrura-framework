import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const createAppScript = path.join(repoRoot, 'scripts', 'create-geometra-app.mjs')
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'geometra-create-app-'))

const templateChecks = {
  'full-stack-dashboard': ['package.json', 'server.ts', 'client.ts', 'index.html', 'tsconfig.json', 'README.md'],
  'server-client': ['package.json', 'server.ts', 'client.ts', 'index.html', 'tsconfig.json', 'README.md'],
  'canvas-local': ['package.json', 'app.ts', 'index.html', 'tsconfig.json', 'README.md'],
  terminal: ['package.json', 'app.ts', 'tsconfig.json', 'README.md'],
  'agent-workstation': ['package.json', 'server.ts', 'tsconfig.json', 'README.md'],
  'claims-compliance': ['package.json', 'server.ts', 'tsconfig.json', 'README.md'],
}

try {
  for (const [template, expectedFiles] of Object.entries(templateChecks)) {
    const targetDir = path.join(tempRoot, template)
    process.stdout.write(`[create:app] generating ${template}\n`)

    const result = spawnSync(
      process.execPath,
      [createAppScript, targetDir, '--template', template],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    )

    if (result.status !== 0) {
      process.stderr.write(result.stdout)
      process.stderr.write(result.stderr)
      process.exit(result.status ?? 1)
    }

    for (const relativePath of expectedFiles) {
      const absolutePath = path.join(targetDir, relativePath)
      if (!existsSync(absolutePath)) {
        process.stderr.write(`Missing generated file for ${template}: ${relativePath}\n`)
        process.exit(1)
      }
    }

    const manifest = JSON.parse(readFileSync(path.join(targetDir, 'package.json'), 'utf8'))
    if (manifest.name !== template) {
      process.stderr.write(`Unexpected package name for ${template}: ${manifest.name}\n`)
      process.exit(1)
    }
  }

  process.stdout.write('[create:app] scaffold smoke checks passed\n')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

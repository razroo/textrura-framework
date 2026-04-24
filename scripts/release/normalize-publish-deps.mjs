#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { publishTimeDependencyUpdates } from './package-manifest.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const version = process.argv[2]

if (!version) {
  console.error('Usage: node scripts/release/normalize-publish-deps.mjs <version>')
  process.exit(1)
}

async function run() {
  for (const update of publishTimeDependencyUpdates(version)) {
    if (Object.keys(update.dependencies).length === 0) continue
    const packageJsonPath = join(root, update.path, 'package.json')
    const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    pkg.dependencies = pkg.dependencies ?? {}
    for (const [name, spec] of Object.entries(update.dependencies)) {
      pkg.dependencies[name] = spec
      console.log(`${update.name}: dependencies.${name}=${spec}`)
    }
    await writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`)
  }
}

run().catch(err => {
  console.error(String(err?.message ?? err))
  process.exit(1)
})

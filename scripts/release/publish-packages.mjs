#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { publishablePackages } from './package-manifest.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

for (const pkg of publishablePackages) {
  console.log(`Publishing ${pkg.name} from ${pkg.path}`)
  const result = spawnSync('npm', ['publish', '--provenance', '--access', 'public'], {
    cwd: join(root, pkg.path),
    env: process.env,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

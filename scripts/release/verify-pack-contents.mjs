import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { publishablePackages } from './package-manifest.mjs'

const execFileAsync = promisify(execFile)
const rootUrl = new URL('../..', import.meta.url)
const root = fileURLToPath(rootUrl)

function normalizeTarPath(path) {
  return path.replace(/^package\//, '')
}

function isTestArtifact(path) {
  return (
    /(^|\/)__tests__(\/|$)/.test(path) ||
    /(^|\/)(test|tests|__snapshots__)(\/|$)/.test(path) ||
    /\.(test|spec)\.(c?m?js|jsx|tsx?|d\.ts)(\.map)?$/.test(path)
  )
}

function isTypescriptSource(path) {
  return /\.(tsx?|mts|cts)$/.test(path) && !/\.d\.ts(\.map)?$/.test(path)
}

function addRequiredFile(required, value) {
  if (typeof value === 'string' && value.startsWith('./')) required.add(value.slice(2))
}

function collectRequiredFiles(packageJson) {
  const required = new Set(['package.json'])
  addRequiredFile(required, packageJson.main)
  addRequiredFile(required, packageJson.module)
  addRequiredFile(required, packageJson.types)

  for (const bin of Object.values(packageJson.bin ?? {})) {
    addRequiredFile(required, bin)
  }

  const collectExport = (entry) => {
    if (typeof entry === 'string') {
      addRequiredFile(required, entry)
      return
    }
    if (!entry || typeof entry !== 'object') return
    for (const value of Object.values(entry)) {
      collectExport(value)
    }
  }
  collectExport(packageJson.exports)

  return required
}

async function npmPackDryRun(pkg) {
  const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: new URL(`${pkg.path}/`, rootUrl),
    maxBuffer: 1024 * 1024 * 20,
  })

  const payload = JSON.parse(stdout)
  const [pack] = payload
  if (!pack || !Array.isArray(pack.files)) {
    throw new Error(`${pkg.name}: npm pack --dry-run did not return a file list`)
  }
  return pack.files.map(file => normalizeTarPath(file.path))
}

async function verifyPackage(pkg) {
  const packageJson = JSON.parse(await readFile(join(root, pkg.path, 'package.json'), 'utf8'))
  const files = await npmPackDryRun(pkg)
  const fileSet = new Set(files)
  const failures = []

  for (const required of collectRequiredFiles(packageJson)) {
    if (!fileSet.has(required)) failures.push(`missing required entrypoint: ${required}`)
  }

  for (const file of files) {
    if (isTestArtifact(file)) failures.push(`test artifact included: ${file}`)
    if (file.startsWith('src/')) failures.push(`source file included: ${file}`)
    if (isTypescriptSource(file)) failures.push(`TypeScript source included: ${file}`)
  }

  if (failures.length > 0) {
    throw new Error(`${pkg.name} pack contents failed:\n  - ${failures.join('\n  - ')}`)
  }

  console.log(`${pkg.name}: ${files.length} packed files verified`)
}

async function main() {
  for (const pkg of publishablePackages) {
    await verifyPackage(pkg)
  }
}

main().catch(err => {
  console.error(String(err?.message ?? err))
  process.exit(1)
})

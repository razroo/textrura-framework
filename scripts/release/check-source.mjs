import { readFile } from 'node:fs/promises'

const version = process.argv[2]

if (!version) {
  console.error('Usage: node scripts/release/check-source.mjs <version>')
  process.exit(1)
}

// Canonical list of every package this monorepo publishes. MUST stay in
// sync with PUBLISH_PACKAGES in .github/workflows/release.yml — if a new
// publishable package is added there without being added here, its version
// can drift unnoticed across releases. `scripts/release/bump-version.mjs`
// reads the same file structure to update versions in lockstep.
const packages = [
  ['textura', 'packages/textura/package.json'],
  ['@geometra/core', 'packages/core/package.json'],
  ['@geometra/renderer-canvas', 'packages/renderer-canvas/package.json'],
  ['@geometra/renderer-terminal', 'packages/renderer-terminal/package.json'],
  ['@geometra/renderer-webgpu', 'packages/renderer-webgpu/package.json'],
  ['@geometra/renderer-three', 'packages/renderer-three/package.json'],
  ['@geometra/server', 'packages/server/package.json'],
  ['@geometra/client', 'packages/client/package.json'],
  ['@geometra/ui', 'packages/ui/package.json'],
  ['@geometra/router', 'packages/router/package.json'],
  ['@geometra/tw', 'packages/tw/package.json'],
  ['@geometra/agent', 'packages/agent/package.json'],
  ['@geometra/cli', 'packages/cli/package.json'],
  ['@geometra/proxy', 'packages/proxy/package.json'],
  ['@geometra/mcp', 'mcp/package.json'],
]

function assertNoFileProtocolDeps(pkg, relPath, releaseVersion) {
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[section]
    if (!deps || typeof deps !== 'object') continue
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === 'string' && spec.startsWith('file:')) {
        throw new Error(
          `${relPath}: ${section}["${name}"] is "${spec}" — file: deps are published verbatim to npm and break consumers; use semver (e.g. ^${releaseVersion})`,
        )
      }
    }
  }
}

async function run() {
  for (const [expectedName, path] of packages) {
    const raw = await readFile(path, 'utf8')
    const pkg = JSON.parse(raw)
    if (pkg.name !== expectedName) {
      throw new Error(`${path}: expected name ${expectedName}, found ${pkg.name ?? 'unknown'}`)
    }
    if (pkg.version !== version) {
      throw new Error(`${pkg.name}: package.json version ${pkg.version ?? 'unknown'} expected ${version}`)
    }
    assertNoFileProtocolDeps(pkg, path, version)
    console.log(`${pkg.name}: ${pkg.version}`)
  }
}

run().catch((err) => {
  console.error(String(err))
  process.exit(1)
})

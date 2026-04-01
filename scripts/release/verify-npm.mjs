const version = process.argv[2]

if (!version) {
  console.error('Usage: node scripts/release/verify-npm.mjs <version>')
  process.exit(1)
}

const packages = [
  '@geometra/core',
  '@geometra/renderer-canvas',
  '@geometra/renderer-terminal',
  '@geometra/renderer-webgpu',
  '@geometra/server',
  '@geometra/client',
  '@geometra/ui',
  '@geometra/router',
]

async function run() {
  for (const pkg of packages) {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`)
    if (!res.ok) {
      throw new Error(`Failed to fetch npm metadata for ${pkg}: ${res.status}`)
    }
    const body = await res.json()
    const published = body?.['dist-tags']?.latest
    if (published !== version) {
      throw new Error(`${pkg} latest=${published ?? 'unknown'} expected=${version}`)
    }
    console.log(`${pkg}: ${published}`)
  }
}

run().catch((err) => {
  console.error(String(err))
  process.exit(1)
})

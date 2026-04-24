import { rm } from 'node:fs/promises'

const paths = [
  'dist',
  'dist-demo',
  'playwright-report',
  'test-results',
  '.playwright',
  '.playwright-mcp',
  'mcp/dist',
  'mcp/.playwright-mcp',
  ...[
    'agent',
    'cli',
    'client',
    'core',
    'proxy',
    'renderer-canvas',
    'renderer-pdf',
    'renderer-terminal',
    'renderer-three',
    'renderer-webgpu',
    'router',
    'server',
    'textura',
    'tw',
    'ui',
  ].map(name => `packages/${name}/dist`),
]

for (const path of paths) {
  await rm(path, { recursive: true, force: true })
}

console.log(`Removed ${paths.length} build/test artifact paths`)

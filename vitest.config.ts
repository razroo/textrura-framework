import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))

function fromRoot(...segments: string[]) {
  return path.resolve(repoRoot, ...segments)
}

// Exact-match aliases keep workspace package imports on source files without requiring dist builds.
const workspaceAliases = [
  { find: /^textura$/, replacement: fromRoot('packages/textura/src/index.ts') },
  { find: /^@geometra\/core$/, replacement: fromRoot('packages/core/src/index.ts') },
  { find: /^@geometra\/core\/node$/, replacement: fromRoot('packages/core/src/node.ts') },
  { find: /^@geometra\/renderer-canvas$/, replacement: fromRoot('packages/renderer-canvas/src/index.ts') },
  { find: /^@geometra\/renderer-terminal$/, replacement: fromRoot('packages/renderer-terminal/src/index.ts') },
  { find: /^@geometra\/renderer-webgpu$/, replacement: fromRoot('packages/renderer-webgpu/src/index.ts') },
  { find: /^@geometra\/server$/, replacement: fromRoot('packages/server/src/index.ts') },
  { find: /^@geometra\/client$/, replacement: fromRoot('packages/client/src/index.ts') },
  { find: /^@geometra\/router$/, replacement: fromRoot('packages/router/src/index.ts') },
  { find: /^@geometra\/ui$/, replacement: fromRoot('packages/ui/src/index.ts') },
]

export default defineConfig({
  resolve: {
    alias: workspaceAliases,
  },
  test: {
    pool: 'threads',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    setupFiles: [fromRoot('vitest.setup.ts')],
  },
})

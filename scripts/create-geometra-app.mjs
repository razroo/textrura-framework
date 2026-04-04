#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(import.meta.dirname, '..')
const startersRoot = path.join(repoRoot, 'starters')

const rootManifest = readJson(path.join(repoRoot, 'package.json'))
const demoFullStackManifest = readJson(path.join(repoRoot, 'demos', 'full-stack-dashboard', 'package.json'))
const terminalDemoManifest = readJson(path.join(repoRoot, 'demos', 'terminal', 'package.json'))
const packageVersions = loadWorkspacePackageVersions()

const toolVersions = {
  typescript: rootManifest.devDependencies?.typescript ?? '^6.0.0',
  vite: rootManifest.devDependencies?.vite ?? '^8.0.0',
  tsx:
    demoFullStackManifest.devDependencies?.tsx ??
    terminalDemoManifest.devDependencies?.tsx ??
    '^4.19.0',
  nodeTypes: '^24.0.0',
}

const sharedGitignore = `node_modules
dist
.DS_Store
`

const TEMPLATES = {
  'full-stack-dashboard': {
    label: 'Full-stack dashboard',
    description: 'Server-side routed canvas app with @geometra/ui, @geometra/router, and thin-client transport.',
    starterFiles: ['server.ts', 'client.ts'],
    dependencies: [
      '@geometra/client',
      '@geometra/core',
      '@geometra/renderer-canvas',
      '@geometra/router',
      '@geometra/server',
      '@geometra/ui',
    ],
    devDependencies: ['typescript', 'tsx', 'vite'],
    scripts: {
      server: 'tsx server.ts',
      client: 'vite',
      dev: "echo 'Run: npm run server  (terminal 1)  &&  npm run client  (terminal 2)'",
      build: 'vite build',
      check: 'tsc --noEmit',
    },
    extraFiles: (appName) => ({
      '.gitignore': sharedGitignore,
      'tsconfig.json': createTsconfig(),
      'index.html': createFullStackHtml(appName),
      'README.md': createReadme({
        appName,
        template: 'full-stack-dashboard',
        description:
          'This starter combines server-side route loaders/actions with a thin canvas client over WebSocket geometry.',
        commands: [
          'npm install',
          'npm run server',
          'npm run client',
          'npm run check',
          'npm run build',
        ],
        notes: [
          'The browser client listens on Vite and connects to the Geometra server on ws://localhost:3300.',
          'Open the URL printed by Vite, then click the canvas once to focus keyboard forwarding.',
        ],
      }),
    }),
    nextSteps: ['npm install', 'npm run server', 'npm run client'],
  },
  'server-client': {
    label: 'Thin client + server',
    description: 'Server-computed layout streamed into a canvas client.',
    starterFiles: ['server.ts', 'client.ts'],
    dependencies: [
      '@geometra/client',
      '@geometra/core',
      '@geometra/renderer-canvas',
      '@geometra/server',
    ],
    devDependencies: ['typescript', 'tsx', 'vite'],
    scripts: {
      server: 'tsx server.ts',
      client: 'vite',
      dev: "echo 'Run: npm run server  (terminal 1)  &&  npm run client  (terminal 2)'",
      build: 'vite build',
      check: 'tsc --noEmit',
    },
    extraFiles: (appName) => ({
      '.gitignore': sharedGitignore,
      'tsconfig.json': createTsconfig(),
      'index.html': createThinClientHtml(appName),
      'README.md': createReadme({
        appName,
        template: 'server-client',
        description: 'This starter keeps layout and app state on the server and streams geometry to the browser.',
        commands: [
          'npm install',
          'npm run server',
          'npm run client',
          'npm run check',
          'npm run build',
        ],
        notes: [
          'The server listens on ws://localhost:8080.',
          'The browser client only paints frames; it does not run a layout engine.',
          'The host page is a full-viewport canvas; window resize is forwarded to the server.',
        ],
      }),
    }),
    nextSteps: ['npm install', 'npm run server', 'npm run client'],
  },
  'canvas-local': {
    label: 'Local canvas app',
    description: 'Single-process canvas rendering with @geometra/core and @geometra/renderer-canvas.',
    starterFiles: ['app.ts'],
    dependencies: ['@geometra/core', '@geometra/renderer-canvas'],
    devDependencies: ['typescript', 'vite'],
    scripts: {
      dev: 'vite',
      build: 'vite build',
      check: 'tsc --noEmit',
    },
    extraFiles: (appName) => ({
      '.gitignore': sharedGitignore,
      'tsconfig.json': createTsconfig(),
      'index.html': createCanvasHtml(appName),
      'README.md': createReadme({
        appName,
        template: 'canvas-local',
        description: 'This starter runs layout and paint locally in the browser with no server transport layer.',
        commands: ['npm install', 'npm run dev', 'npm run check', 'npm run build'],
        notes: [
          'The host page is a full-viewport canvas; layout tracks window resize.',
          'Open the Vite URL and click inside the canvas to interact with the app.',
        ],
      }),
    }),
    nextSteps: ['npm install', 'npm run dev'],
  },
  terminal: {
    label: 'Terminal app',
    description: 'DOM-free terminal renderer starter.',
    starterFiles: ['app.ts'],
    dependencies: ['@geometra/core', '@geometra/renderer-terminal'],
    devDependencies: ['@types/node', 'typescript', 'tsx'],
    scripts: {
      dev: 'tsx app.ts',
      'dev:watch': 'tsx watch app.ts',
      check: 'tsc --noEmit',
      build: "echo 'No build step required for terminal starter.'",
    },
    extraFiles: (appName) => ({
      '.gitignore': sharedGitignore,
      'tsconfig.json': createTsconfig({ nodeTypes: true }),
      'README.md': createReadme({
        appName,
        template: 'terminal',
        description: 'This starter renders directly to the terminal with no browser involved.',
        commands: ['npm install', 'npm run dev', 'npm run dev:watch', 'npm run check'],
        notes: ['Resize the terminal before launch if you want a larger initial viewport.'],
      }),
    }),
    nextSteps: ['npm install', 'npm run dev'],
  },
}

main()

function main() {
  const args = process.argv.slice(2)
  let destination = null
  let templateName = 'full-stack-dashboard'
  let listOnly = false
  let helpOnly = false

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--template' || arg === '-t') {
      const value = args[index + 1]
      if (!value) {
        fail('Missing value for --template.')
      }
      templateName = value
      index++
      continue
    }
    if (arg === '--list') {
      listOnly = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      helpOnly = true
      continue
    }
    if (arg.startsWith('-')) {
      fail(`Unknown option: ${arg}`)
    }
    if (destination !== null) {
      fail(`Unexpected argument: ${arg}`)
    }
    destination = arg
  }

  if (helpOnly) {
    printHelp()
    process.exit(0)
  }

  if (listOnly) {
    printTemplateList()
    process.exit(0)
  }

  if (destination === null) {
    printHelp()
    process.exit(1)
  }

  const template = TEMPLATES[templateName]
  if (!template) {
    fail(`Unknown template: ${templateName}`)
  }

  const targetDir = path.resolve(process.cwd(), destination)
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    fail(`Target directory is not empty: ${targetDir}`)
  }

  mkdirSync(targetDir, { recursive: true })

  for (const starterFile of template.starterFiles) {
    const sourcePath = path.join(startersRoot, templateName, starterFile)
    const targetPath = path.join(targetDir, starterFile)
    copyFileSync(sourcePath, targetPath)
  }

  const appName = createPackageName(path.basename(targetDir))
  const manifest = {
    name: appName,
    private: true,
    type: 'module',
    scripts: template.scripts,
    dependencies: buildDependencyMap(template.dependencies),
    devDependencies: buildToolDependencyMap(template.devDependencies),
  }

  writeTextFile(path.join(targetDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')

  const extraFiles = template.extraFiles(appName)
  for (const [relativePath, contents] of Object.entries(extraFiles)) {
    writeTextFile(path.join(targetDir, relativePath), contents)
  }

  process.stdout.write(`Created ${template.label} app in ${targetDir}\n`)
  process.stdout.write('\nNext steps:\n')
  process.stdout.write(`  cd ${targetDir}\n`)
  for (const step of template.nextSteps) {
    process.stdout.write(`  ${step}\n`)
  }
}

function buildDependencyMap(packageNames) {
  const entries = packageNames.map((packageName) => {
    const version = packageVersions.get(packageName)
    if (!version) {
      fail(`Missing workspace version for ${packageName}`)
    }
    return [packageName, `^${version}`]
  })
  return Object.fromEntries(entries)
}

function buildToolDependencyMap(toolNames) {
  const entries = toolNames.map((toolName) => {
    const version = toolVersions[toToolVersionKey(toolName)]
    if (!version) {
      fail(`Missing tool version for ${toolName}`)
    }
    return [toolName, version]
  })
  return Object.fromEntries(entries)
}

function toToolVersionKey(toolName) {
  if (toolName === '@types/node') return 'nodeTypes'
  return toolName
}

function loadWorkspacePackageVersions() {
  const packagesRoot = path.join(repoRoot, 'packages')
  const versions = new Map()
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(packagesRoot, entry.name, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = readJson(manifestPath)
    if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') continue
    versions.set(manifest.name, manifest.version)
  }
  return versions
}

function readJson(filename) {
  return JSON.parse(readFileSync(filename, 'utf8'))
}

function writeTextFile(filename, contents) {
  mkdirSync(path.dirname(filename), { recursive: true })
  writeFileSync(filename, contents, 'utf8')
}

function createPackageName(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'geometra-app'
}

function createTitle(value) {
  return value
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function createTsconfig(options = {}) {
  const compilerOptions = {
    lib: ['ESNext', 'DOM'],
    target: 'ESNext',
    module: 'NodeNext',
    moduleResolution: 'nodenext',
    strict: true,
    skipLibCheck: true,
    noUncheckedIndexedAccess: true,
    noImplicitReturns: true,
    noImplicitOverride: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noFallthroughCasesInSwitch: true,
  }

  if (options.nodeTypes) {
    compilerOptions.types = ['node']
  }

  return JSON.stringify(
    {
      compilerOptions,
      include: ['*.ts'],
    },
    null,
    2,
  ) + '\n'
}

function createReadme({ appName, template, description, commands, notes }) {
  const title = createTitle(appName)
  return `# ${title}

Generated from Geometra's \`${template}\` template.

${description}

## Commands

${commands.map((command) => `- \`${command}\``).join('\n')}

## Notes

${notes.map((note) => `- ${note}`).join('\n')}
`
}

function createCanvasHtml(appName) {
  const title = createTitle(appName)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    html, body {
      width: 100%;
      height: 100%;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      overflow: hidden;
      background: #0f172a;
    }
    canvas {
      display: block;
      width: 100vw;
      height: 100vh;
      outline: none;
    }
  </style>
</head>
<body>
  <canvas id="app" tabindex="0"></canvas>
  <script type="module" src="./app.ts"></script>
</body>
</html>
`
}

function createThinClientHtml(appName) {
  const title = createTitle(appName)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    html, body {
      width: 100%;
      height: 100%;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      overflow: hidden;
      background: #111827;
    }
    canvas {
      display: block;
      width: 100vw;
      height: 100vh;
      outline: none;
    }
  </style>
</head>
<body>
  <canvas id="app" tabindex="0"></canvas>
  <script type="module" src="./client.ts"></script>
</body>
</html>
`
}

function createFullStackHtml(appName) {
  const title = createTitle(appName)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    html, body {
      width: 100%;
      height: 100%;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      overflow: hidden;
      background: #07131f;
    }
    canvas {
      display: block;
      width: 100vw;
      height: 100vh;
      outline: none;
    }
  </style>
</head>
<body>
  <canvas id="app"></canvas>
  <script type="module" src="./client.ts"></script>
</body>
</html>
`
}

function printHelp() {
  process.stdout.write(`Usage: npm run create:app -- [destination] [--template <name>]

Create a standalone Geometra app from the repo starter templates.

Examples:
  npm run create:app -- ./my-dashboard
  npm run create:app -- ./my-terminal --template terminal
  npm run create:app -- --list

`)
  printTemplateList()
}

function printTemplateList() {
  process.stdout.write('Templates:\n')
  for (const [name, template] of Object.entries(TEMPLATES)) {
    process.stdout.write(`  ${name.padEnd(20)} ${template.description}\n`)
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

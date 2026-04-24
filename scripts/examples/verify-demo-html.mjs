import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

const domFixtureReasons = new Map([
  ['demo/ai-on-demand/index.html', 'DOM authoring comparison shell; generated Geometra output still renders on canvas.'],
  ['demos/ai-on-demand/index.html', 'DOM authoring comparison shell; generated Geometra output still renders on canvas.'],
  ['demos/auth-server-client/client.html', 'Connection harness for switching WebSocket auth tokens before server geometry is available.'],
  ['demos/auth-registry-server-client/client.html', 'Connection harness for registry-issued token selection before server geometry is available.'],
  ['demos/full-stack-dashboard/client.html', 'Redirect shim for legacy client entrypoint.'],
  ['demos/mcp-form-benchmark/index.html', 'DOM benchmark fixture for MCP/proxy comparisons.'],
  ['demos/mcp-form-benchmark-heavy/index.html', 'DOM benchmark fixture for MCP/proxy comparisons.'],
  ['demos/mcp-greenhouse-fixture/index.html', 'Third-party-style DOM fixture used by MCP benchmarks.'],
  ['demos/mcp-radix-fixture/index.html', 'Radix DOM fixture used by MCP benchmarks.'],
  ['demos/mcp-triage-benchmark/index.html', 'DOM benchmark fixture for MCP/proxy comparisons.'],
  ['demos/proxy-mcp-sample/index.html', 'Small DOM fixture for proxy/MCP extraction.'],
  ['demos/security-demo/index.html', 'Intentional DOM attack-surface fixture compared against Geometra canvas rendering.'],
])

const prohibitedShellTags = /<(?:aside|button|details|dialog|div|fieldset|footer|form|h[1-6]|header|input|label|main|nav|output|p|section|select|textarea)\b/i

async function listHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue
      files.push(...await listHtmlFiles(abs))
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(abs)
    }
  }
  return files
}

function bodyMarkup(html) {
  return html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? ''
}

async function main() {
  const files = [
    ...await listHtmlFiles(join(root, 'demo')),
    ...await listHtmlFiles(join(root, 'demos')),
  ].sort()
  const failures = []
  const exceptions = []

  for (const file of files) {
    const rel = relative(root, file).split('\\').join('/')
    const html = await readFile(file, 'utf8')
    const exception = domFixtureReasons.get(rel)
    if (exception) {
      exceptions.push(`${rel}: ${exception}`)
      continue
    }

    const body = bodyMarkup(html)
    if (!/<canvas\b[^>]*\bid=["']app["'][^>]*><\/canvas>/i.test(body)) {
      failures.push(`${rel}: browser Geometra demos must expose a single canvas#app in body`)
    }
    if (!/<script\b[^>]*type=["']module["'][^>]*>/i.test(body)) {
      failures.push(`${rel}: browser Geometra demos must load a module script entrypoint`)
    }
    if (prohibitedShellTags.test(body)) {
      failures.push(`${rel}: move headings, buttons, status, and supporting UI into Geometra or add an explicit fixture exception`)
    }
  }

  if (failures.length > 0) {
    throw new Error(`Demo HTML ownership check failed:\n  - ${failures.join('\n  - ')}`)
  }

  console.log(`Verified ${files.length - exceptions.length} minimal Geometra demo HTML files`)
  console.log(`Documented ${exceptions.length} DOM fixture/redirect exceptions`)
}

main().catch(err => {
  console.error(String(err?.message ?? err))
  process.exit(1)
})

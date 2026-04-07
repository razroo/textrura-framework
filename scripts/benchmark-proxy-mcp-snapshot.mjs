#!/usr/bin/env node
/**
 * Compare payload sizes: @geometra/proxy extractGeometry + MCP compact snapshot
 * vs raw HTML vs Playwright ariaSnapshot({ mode: 'ai' }).
 *
 * Run from repo root after:
 *   npm run build -w @geometra/proxy && npm run build -w @geometra/mcp
 *
 *   node scripts/benchmark-proxy-mcp-snapshot.mjs
 */
import { chromium } from 'playwright'
import { extractGeometry } from '../packages/proxy/dist/extractor.js'
import { buildA11yTree, buildCompactUiIndex } from '../mcp/dist/session.js'

const VIEWPORT = { width: 1280, height: 720 }
const URLS = ['https://example.com', 'https://news.ycombinator.com']

function bytes(v) {
  return Buffer.byteLength(typeof v === 'string' ? v : JSON.stringify(v), 'utf8')
}

function approxTokens(b) {
  return Math.round(b / 4)
}

async function measure(url) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: VIEWPORT })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(2000)

  const html = await page.content()
  let ariaAi = ''
  try {
    ariaAi = await page.locator('body').ariaSnapshot({ mode: 'ai', timeout: 15_000 })
  } catch (e) {
    ariaAi = `error:${e.message}`
  }

  const geom = await extractGeometry(page)
  const geometraFull = bytes({ layout: geom.layout, tree: geom.tree })

  const a11y = buildA11yTree(structuredClone(geom.tree), structuredClone(geom.layout))
  const { nodes, truncated } = buildCompactUiIndex(a11y, { maxNodes: 400 })
  const mcpCompactObj = {
    view: 'compact',
    viewport: { width: a11y.bounds.width, height: a11y.bounds.height },
    nodes,
    truncated,
  }
  const mcpCompact = bytes(mcpCompactObj)
  const mcpFullPretty = bytes(JSON.stringify(a11y, null, 2))

  const htmlB = bytes(html)
  const ariaB = typeof ariaAi === 'string' && !ariaAi.startsWith('error') ? bytes(ariaAi) : null

  await browser.close()

  const row = {
    url,
    htmlBytes: htmlB,
    ariaAiBytes: ariaB,
    geometraFullBytes: geometraFull,
    mcpCompactBytes: mcpCompact,
    mcpFullPrettyBytes: mcpFullPretty,
    truncated,
    compactVsAria: ariaB != null ? (mcpCompact / ariaB).toFixed(3) : null,
    compactVsHtml: (mcpCompact / htmlB).toFixed(3),
    fullGeometraVsCompact: (geometraFull / mcpCompact).toFixed(3),
  }
  return row
}

function main() {
  console.log('Geometra proxy + MCP compact vs Playwright (same viewport, 2s settle after domcontentloaded)\n')
}

async function run() {
  main()
  const rows = []
  for (const u of URLS) {
    rows.push(await measure(u))
  }

  console.log('| URL | HTML B | Playwright aria AI B | Geometra full layout+tree B | MCP compact snapshot B | MCP full a11y pretty B | compact / aria | compact / full GEOM |')
  console.log('|---|--:|--:|--:|--:|--:|--:|--:|')
  for (const r of rows) {
    const shortUrl = r.url.replace('https://', '')
    console.log(
      `| ${shortUrl} | ${r.htmlBytes} | ${r.ariaAiBytes ?? 'n/a'} | ${r.geometraFullBytes} | ${r.mcpCompactBytes} | ${r.mcpFullPrettyBytes} | ${r.compactVsAria ?? 'n/a'} | ${r.fullGeometraVsCompact} |`,
    )
  }

  console.log('\nApprox tokens (~4 bytes/token):')
  for (const r of rows) {
    console.log(`  ${r.url}`)
    console.log(
      `    MCP compact: ~${approxTokens(r.mcpCompactBytes)}  |  aria AI: ~${r.ariaAiBytes != null ? approxTokens(r.ariaAiBytes) : 'n/a'}  |  Geometra full raw: ~${approxTokens(r.geometraFullBytes)}`,
    )
    if (r.ariaAiBytes != null && r.mcpCompactBytes < r.ariaAiBytes) {
      const saved = approxTokens(r.ariaAiBytes - r.mcpCompactBytes)
      console.log(`    → MCP compact smaller than aria AI by ~${saved} tokens (${((1 - r.mcpCompactBytes / r.ariaAiBytes) * 100).toFixed(1)}%)`)
    } else if (r.ariaAiBytes != null) {
      console.log(`    → aria AI smaller than MCP compact by ~${approxTokens(r.mcpCompactBytes - r.ariaAiBytes)} tokens`)
    }
    if (r.truncated) console.log('    (compact list truncated at maxNodes=400)')
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

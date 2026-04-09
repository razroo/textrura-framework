#!/usr/bin/env node
/**
 * Compare safe proxy startup variants for the first cold page load.
 *
 * Variants differ only in:
 * - page creation style (`browser.newPage()` vs explicit `browser.newContext().newPage()`)
 * - DOM observer bootstrap style (current install vs bridge-only pre-navigation bootstrap)
 *
 * Run from repo root:
 *   node scripts/benchmark-proxy-startup-variants.mjs
 *   node scripts/benchmark-proxy-startup-variants.mjs --runs 5
 *   node scripts/benchmark-proxy-startup-variants.mjs --url https://example.com
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VIEWPORT = { width: 1280, height: 900 }
const DEFAULT_URL = 'https://www.saucedemo.com/'

const VARIANTS = [
  {
    name: 'newPage_currentObserver',
    pageMode: 'newPage',
    observerMode: 'current',
    description: 'browser.newPage + current observer install',
  },
  {
    name: 'newPage_bridgeOnly',
    pageMode: 'newPage',
    observerMode: 'bridge',
    description: 'browser.newPage + bridge-only observer bootstrap',
  },
  {
    name: 'contextNewPage_currentObserver',
    pageMode: 'context',
    observerMode: 'current',
    description: 'browser.newContext().newPage + current observer install',
  },
  {
    name: 'contextNewPage_bridgeOnly',
    pageMode: 'context',
    observerMode: 'bridge',
    description: 'browser.newContext().newPage + bridge-only observer bootstrap',
  },
]

function parseArgs(argv) {
  let runs = 3
  let url = DEFAULT_URL
  let headless = true
  let json = false

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--runs') {
      const value = Number(argv[index + 1] ?? '')
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --runs value "${argv[index + 1] ?? ''}". Expected a positive integer.`)
      }
      runs = value
      index++
      continue
    }
    if (arg.startsWith('--runs=')) {
      const value = Number(arg.slice('--runs='.length))
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --runs value "${arg.slice('--runs='.length)}". Expected a positive integer.`)
      }
      runs = value
      continue
    }
    if (arg === '--url') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Missing value for --url')
      }
      url = value
      index++
      continue
    }
    if (arg.startsWith('--url=')) {
      url = arg.slice('--url='.length)
      continue
    }
    if (arg === '--headed') {
      headless = false
      continue
    }
    if (arg === '--headless') {
      headless = true
      continue
    }
    if (arg === '--json') {
      json = true
      continue
    }
  }

  return { runs, url, headless, json }
}

function runBuild(label, command, args, cwd, outputPath) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`Failed to build ${label}`)
  }
  if (!existsSync(outputPath)) {
    throw new Error(`Build for ${label} completed without producing ${outputPath}`)
  }
}

async function primeDomObserver(page, scheduleExtract) {
  await page.exposeFunction('__geometraProxyNotify', () => {
    scheduleExtract()
  })
  await page.addInitScript(() => {
    const w = window
    if (w.__geometraProxyObserverBootstrapped) return

    const install = () => {
      if (w.__geometraProxyObserverInstalled) return
      const root = document.documentElement
      if (!root) return
      const observer = new MutationObserver(() => {
        void w.__geometraProxyNotify?.()
      })
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      })
      w.__geometraProxyObserverInstalled = true
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true })
    } else {
      install()
    }

    w.__geometraProxyObserverBootstrapped = true
  })
}

function summarizeVariant(rows) {
  const avg = key => Number((rows.reduce((sum, row) => sum + row[key], 0) / rows.length).toFixed(1))
  const sortedByTotal = [...rows].sort((a, b) => a.totalMs - b.totalMs)
  return {
    avgBrowserLaunchMs: avg('browserLaunchMs'),
    avgPageCreateMs: avg('pageCreateMs'),
    avgObserverMs: avg('observerMs'),
    avgNavigateMs: avg('navigateMs'),
    avgExtractMs: avg('extractMs'),
    avgTotalMs: avg('totalMs'),
    medianTotalMs: sortedByTotal[Math.floor(sortedByTotal.length / 2)]?.totalMs ?? 0,
    bestTotalMs: sortedByTotal[0]?.totalMs ?? 0,
    worstTotalMs: sortedByTotal[sortedByTotal.length - 1]?.totalMs ?? 0,
    runs: rows.map(row => row.totalMs),
  }
}

function printTable(summaryRows) {
  console.log('\n| Variant | avg total ms | median ms | avg launch ms | avg page ms | avg observer ms | avg nav ms | avg extract ms |')
  console.log('|---|--:|--:|--:|--:|--:|--:|--:|')
  for (const row of summaryRows) {
    console.log(
      `| ${row.variant} | ${row.avgTotalMs.toFixed(1)} | ${row.medianTotalMs.toFixed(1)} | ${row.avgBrowserLaunchMs.toFixed(1)} | ${row.avgPageCreateMs.toFixed(1)} | ${row.avgObserverMs.toFixed(1)} | ${row.avgNavigateMs.toFixed(1)} | ${row.avgExtractMs.toFixed(1)} |`,
    )
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  runBuild(
    '@geometra/proxy',
    'bun',
    ['run', '--filter', '@geometra/proxy', 'build'],
    ROOT,
    path.join(ROOT, 'packages/proxy/dist/extractor.js'),
  )

  const [{ extractGeometry }, { installDomObserver }] = await Promise.all([
    import(pathToFileURL(path.join(ROOT, 'packages/proxy/dist/extractor.js')).href),
    import(pathToFileURL(path.join(ROOT, 'packages/proxy/dist/geometry-ws.js')).href),
  ])

  const results = []

  for (const variant of VARIANTS) {
    for (let run = 0; run < args.runs; run++) {
      const startedAt = performance.now()
      const browserLaunchStartedAt = performance.now()
      const browser = await chromium.launch({ headless: args.headless })
      const browserLaunchMs = performance.now() - browserLaunchStartedAt

      let context
      let page
      try {
        const pageCreateStartedAt = performance.now()
        if (variant.pageMode === 'context') {
          context = await browser.newContext({ viewport: VIEWPORT })
          page = await context.newPage()
        } else {
          page = await browser.newPage({ viewport: VIEWPORT })
        }
        const pageCreateMs = performance.now() - pageCreateStartedAt

        const observerStartedAt = performance.now()
        if (variant.observerMode === 'current') {
          await installDomObserver(page, () => {})
        } else {
          await primeDomObserver(page, () => {})
        }
        const observerMs = performance.now() - observerStartedAt

        const navigateStartedAt = performance.now()
        await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        const navigateMs = performance.now() - navigateStartedAt

        const extractTrace = {}
        const extractStartedAt = performance.now()
        await extractGeometry(page, { trace: extractTrace })
        const extractMs = performance.now() - extractStartedAt

        results.push({
          variant: variant.name,
          description: variant.description,
          run: run + 1,
          browserLaunchMs: Number(browserLaunchMs.toFixed(1)),
          pageCreateMs: Number(pageCreateMs.toFixed(1)),
          observerMs: Number(observerMs.toFixed(1)),
          navigateMs: Number(navigateMs.toFixed(1)),
          extractMs: Number(extractMs.toFixed(1)),
          totalMs: Number((performance.now() - startedAt).toFixed(1)),
          axRan: extractTrace.axRan === true,
        })
      } finally {
        await browser.close()
      }
    }
  }

  const summary = Object.entries(
    results.reduce((acc, row) => {
      ;(acc[row.variant] ||= []).push(row)
      return acc
    }, {}),
  )
    .map(([variant, rows]) => ({
      variant,
      description: rows[0]?.description ?? variant,
      ...summarizeVariant(rows),
    }))
    .sort((a, b) => a.avgTotalMs - b.avgTotalMs)

  if (args.json) {
    console.log(JSON.stringify({ url: args.url, headless: args.headless, runs: args.runs, summary, results }, null, 2))
    return
  }

  console.log(`Startup variant benchmark for ${args.url}`)
  console.log(`Browser mode: ${args.headless ? 'headless' : 'headed'}`)
  console.log(`Runs per variant: ${args.runs}`)
  printTable(summary)

  console.log('\nBest variant by average total:')
  console.log(`${summary[0]?.variant ?? 'n/a'} — ${summary[0]?.description ?? 'n/a'}`)

  console.log('\nRaw totals by run:')
  for (const row of results) {
    console.log(
      `${row.variant} run ${row.run}: total=${row.totalMs.toFixed(1)} ms, launch=${row.browserLaunchMs.toFixed(1)} ms, page=${row.pageCreateMs.toFixed(1)} ms, observer=${row.observerMs.toFixed(1)} ms, nav=${row.navigateMs.toFixed(1)} ms, extract=${row.extractMs.toFixed(1)} ms`,
    )
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

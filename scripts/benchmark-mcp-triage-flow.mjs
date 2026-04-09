#!/usr/bin/env node
/**
 * Compare summary-first board exploration workflows:
 * - Geometra MCP: connect (with inline page model) + contextual semantic click
 * - Playwright MCP style: navigate + aria snapshot + browser_run_code
 *
 * This benchmark is meant to answer a different question than the form-flow benchmark:
 * whether Geometra MCP's summary-first exploration path stays meaningfully smaller than a
 * snapshot-plus-script browser flow on a dense, ambiguous board with repeated actions.
 *
 * Run from repo root:
 *   node scripts/benchmark-mcp-triage-flow.mjs
 *   node scripts/benchmark-mcp-triage-flow.mjs --assert
 *   node scripts/benchmark-mcp-triage-flow.mjs --headed --slow-mo 250
 */
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VIEWPORT = { width: 1440, height: 960 }
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const SCENARIO = {
  id: 'triage-board',
  title: 'Incident triage board exploration benchmark',
  htmlPath: path.join(ROOT, 'demos', 'mcp-triage-benchmark', 'index.html'),
  target: {
    listName: 'Escalations',
    title: 'Northwind renewal blocked',
    actionName: 'Open incident',
  },
}

function parseArgs(argv) {
  let headless = true
  let slowMo = 0
  let deferredPageModel = false

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--headed') {
      headless = false
      continue
    }
    if (arg === '--headless') {
      const value = argv[index + 1]
      if (value === 'true' || value === 'false') {
        headless = value === 'true'
        index++
      } else {
        headless = true
      }
      continue
    }
    if (arg.startsWith('--headless=')) {
      const value = arg.slice('--headless='.length)
      if (value !== 'true' && value !== 'false') {
        throw new Error(`Invalid --headless value "${value}". Expected true or false.`)
      }
      headless = value === 'true'
      continue
    }
    if (arg === '--slow-mo') {
      const value = Number(argv[index + 1] ?? '')
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid --slow-mo value "${argv[index + 1] ?? ''}". Expected a non-negative number.`)
      }
      slowMo = value
      index++
      continue
    }
    if (arg.startsWith('--slow-mo=')) {
      const value = Number(arg.slice('--slow-mo='.length))
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid --slow-mo value "${arg.slice('--slow-mo='.length)}". Expected a non-negative number.`)
      }
      slowMo = value
      continue
    }
    if (arg === '--deferred-page-model') {
      deferredPageModel = true
    }
  }

  return {
    assert: argv.includes('--assert'),
    deferredPageModel,
    headless,
    slowMo,
  }
}

function bytes(value) {
  return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
}

function approxTokens(byteCount) {
  return Math.round(byteCount / 4)
}

function toolInputBytes(tool, input) {
  return bytes({ tool, input })
}

function contentText(result) {
  const items = Array.isArray(result?.content) ? result.content : []
  return items
    .map(item => (typeof item?.text === 'string' ? item.text : ''))
    .filter(Boolean)
    .join('\n')
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

function buildResult(step, input, outputText, elapsedMs) {
  const inputBytes = toolInputBytes(step, input)
  const outputBytes = bytes(outputText)
  return {
    step,
    inputBytes,
    outputBytes,
    totalBytes: inputBytes + outputBytes,
    approxTokens: approxTokens(inputBytes + outputBytes),
    elapsedMs,
    outputText,
  }
}

function summarizeTotals(steps) {
  return steps.reduce(
    (acc, step) => {
      acc.inputBytes += step.inputBytes
      acc.outputBytes += step.outputBytes
      acc.totalBytes += step.totalBytes
      acc.elapsedMs += step.elapsedMs
      return acc
    },
    { inputBytes: 0, outputBytes: 0, totalBytes: 0, elapsedMs: 0, turns: steps.length, approxTokens: 0 },
  )
}

function withApproxTokens(totals) {
  return { ...totals, approxTokens: approxTokens(totals.totalBytes) }
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function parseJsonOutput(step) {
  const text = step.outputText.trim()
  if (!text.startsWith('{') && !text.startsWith('[')) {
    throw new Error(`${step.step} did not return JSON: ${step.outputText}`)
  }
  return JSON.parse(text)
}

async function startStaticServer(filePath) {
  const html = await readFile(filePath, 'utf8')
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    if (pathname === '/favicon.ico') {
      res.writeHead(204)
      res.end()
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind benchmark HTTP server')
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  }
}

function getToolHandler(server, name) {
  return server._registeredTools[name].handler
}

async function invokeTool(handler, name, input) {
  const started = performance.now()
  const result = await handler(input)
  return buildResult(name, input, contentText(result), performance.now() - started)
}

async function runGeometraFlow(url, createServer, scenario, options) {
  const server = createServer()
  const connect = getToolHandler(server, 'geometra_connect')
  const click = getToolHandler(server, 'geometra_click')
  const disconnect = getToolHandler(server, 'geometra_disconnect')
  let browserOpen = false

  try {
    const connectStep = await invokeTool(connect, 'geometra_connect', {
      pageUrl: url,
      port: 0,
      headless: options.headless,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      slowMo: options.slowMo > 0 ? options.slowMo : undefined,
      returnPageModel: true,
      ...(options.deferredPageModel ? { pageModelMode: 'deferred' } : {}),
      maxPrimaryActions: 8,
      maxSectionsPerKind: 8,
      detail: 'terse',
    })
    const connectPayload = parseJsonOutput(connectStep)
    browserOpen = true

    const clickStep = await invokeTool(click, 'geometra_click', {
      role: 'button',
      name: scenario.target.actionName,
      itemText: scenario.target.title,
      sectionText: scenario.target.listName,
      waitFor: {
        role: 'dialog',
        text: scenario.target.title,
        present: true,
        timeoutMs: 4_000,
      },
      detail: 'terse',
    })
    const clickPayload = parseJsonOutput(clickStep)

    return {
      steps: [connectStep, clickStep],
      semanticSteps: [connectStep, clickStep],
      explorationSteps: [connectStep],
      connectPayload,
      pageModelPayload: connectPayload.pageModel,
      clickStep,
      clickPayload,
    }
  } finally {
    if (browserOpen) {
      try {
        await disconnect({ closeBrowser: true })
      } catch {
        /* best effort cleanup */
      }
    }
  }
}

function renderPlaywrightRunCode(scenario) {
  return `
const column = page.getByRole('region', { name: ${JSON.stringify(scenario.target.listName)} });
const card = column.locator('article').filter({ has: page.getByRole('heading', { name: ${JSON.stringify(scenario.target.title)} }) }).first();
await card.getByRole('button', { name: ${JSON.stringify(scenario.target.actionName)} }).click();
const dialog = page.getByRole('dialog');
await dialog.waitFor({ state: 'visible', timeout: 4000 });
return {
  ok: true,
  dialogTitle: await dialog.getByRole('heading').textContent(),
  status: await page.getByRole('status').textContent(),
}
`.trim()
}

async function runPlaywrightFlow(url, scenario, options) {
  const launchStarted = performance.now()
  const browser = await chromium.launch({
    headless: options.headless,
    slowMo: options.slowMo,
  })
  const page = await browser.newPage({ viewport: VIEWPORT })
  const launchMs = performance.now() - launchStarted

  try {
    const navigateInput = { url }
    const navigateStarted = performance.now()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const navigateOutput = JSON.stringify({ url: page.url(), title: await page.title() })
    const navigateStep = buildResult('browser_navigate', navigateInput, navigateOutput, performance.now() - navigateStarted)

    const snapshotInput = { scope: 'body', mode: 'ai' }
    const snapshotStarted = performance.now()
    const snapshot = await page.locator('body').ariaSnapshot({ mode: 'ai', timeout: 15_000 })
    const snapshotStep = buildResult('browser_snapshot', snapshotInput, snapshot, performance.now() - snapshotStarted)

    const code = renderPlaywrightRunCode(scenario)
    const runCodeStarted = performance.now()
    const runCodeResult = await new AsyncFunction('page', code)(page)
    const runCodeOutput = JSON.stringify(runCodeResult)
    const runCodeStep = buildResult(
      'browser_run_code',
      { code },
      runCodeOutput,
      performance.now() - runCodeStarted,
    )

    return {
      launchMs,
      steps: [navigateStep, snapshotStep, runCodeStep],
      semanticSteps: [snapshotStep, runCodeStep],
      explorationSteps: [snapshotStep],
      runCodeResult,
      snapshot,
    }
  } finally {
    await browser.close()
  }
}

function printStepTable(title, steps) {
  console.log(`\n${title}`)
  console.log('| Step | Input B | Output B | Total B | ~Tokens | ms |')
  console.log('|---|--:|--:|--:|--:|--:|')
  for (const step of steps) {
    console.log(
      `| ${step.step} | ${step.inputBytes} | ${step.outputBytes} | ${step.totalBytes} | ${step.approxTokens} | ${step.elapsedMs.toFixed(1)} |`,
    )
  }
}

function printTotals(label, totals) {
  console.log(
    `${label}: ${totals.turns} turns, ${totals.totalBytes} B total (~${totals.approxTokens} tokens), ${totals.elapsedMs.toFixed(1)} ms`,
  )
}

function printDelta(label, geometraTotals, playwrightTotals) {
  const diff = playwrightTotals.totalBytes - geometraTotals.totalBytes
  if (diff > 0) {
    console.log(
      `${label}: Geometra used ${diff} fewer bytes (~${approxTokens(diff)} tokens, ${((diff / playwrightTotals.totalBytes) * 100).toFixed(1)}% smaller).`,
    )
    return
  }
  if (diff < 0) {
    const over = Math.abs(diff)
    console.log(
      `${label}: Playwright used ${over} fewer bytes (~${approxTokens(over)} tokens, ${((over / geometraTotals.totalBytes) * 100).toFixed(1)}% smaller).`,
    )
    return
  }
  console.log(`${label}: Geometra and Playwright were equal on combined bytes.`)
}

function assertBenchmark(geometra, playwright, scenario) {
  const geometraTotals = withApproxTokens(summarizeTotals(geometra.steps))
  const geometraSemanticTotals = withApproxTokens(summarizeTotals(geometra.semanticSteps))
  const geometraExplorationTotals = withApproxTokens(summarizeTotals(geometra.explorationSteps))
  const playwrightTotals = withApproxTokens(summarizeTotals(playwright.steps))
  const playwrightSemanticTotals = withApproxTokens(summarizeTotals(playwright.semanticSteps))
  const playwrightExplorationTotals = withApproxTokens(summarizeTotals(playwright.explorationSteps))

  const failures = []
  if (geometra.connectPayload.connected !== true) {
    failures.push(
      `[${scenario.id}] Expected Geometra to connect successfully.`,
    )
  }
  if ((geometra.clickPayload?.postWait?.matchCount ?? 0) < 1) {
    failures.push(
      `[${scenario.id}] Expected Geometra post-click wait to confirm the dialog for "${scenario.target.title}", received ${JSON.stringify(geometra.clickPayload)}`,
    )
  }
  if (normalizeText(playwright.runCodeResult.dialogTitle) !== normalizeText(scenario.target.title)) {
    failures.push(
      `[${scenario.id}] Expected Playwright dialog title to equal "${scenario.target.title}", received ${JSON.stringify(playwright.runCodeResult.dialogTitle)}`,
    )
  }
  if (!normalizeText(playwright.runCodeResult.status).includes(normalizeText(scenario.target.title))) {
    failures.push(
      `[${scenario.id}] Expected Playwright status to mention "${scenario.target.title}", received ${JSON.stringify(playwright.runCodeResult.status)}`,
    )
  }
  if (geometraExplorationTotals.totalBytes >= playwrightExplorationTotals.totalBytes) {
    failures.push(
      `[${scenario.id}] Expected Geometra exploration flow (${geometraExplorationTotals.totalBytes} B) to beat Playwright snapshot (${playwrightExplorationTotals.totalBytes} B).`,
    )
  }
  if (geometraSemanticTotals.totalBytes >= playwrightSemanticTotals.totalBytes) {
    failures.push(
      `[${scenario.id}] Expected Geometra semantic flow (${geometraSemanticTotals.totalBytes} B) to beat Playwright semantic flow (${playwrightSemanticTotals.totalBytes} B).`,
    )
  }
  if (geometraTotals.totalBytes >= playwrightTotals.totalBytes) {
    failures.push(
      `[${scenario.id}] Expected Geometra end-to-end flow (${geometraTotals.totalBytes} B) to beat Playwright (${playwrightTotals.totalBytes} B).`,
    )
  }

  if (failures.length > 0) {
    throw new Error(`Benchmark assertion failure:\n- ${failures.join('\n- ')}`)
  }
}

async function runScenario(createServer, options) {
  const { server, url } = await startStaticServer(SCENARIO.htmlPath)

  try {
    const warmup = await fetch(url)
    if (!warmup.ok) {
      throw new Error(`Benchmark page warmup failed: ${warmup.status}`)
    }

    console.log(`Scenario: ${SCENARIO.id}`)
    console.log(SCENARIO.title)
    console.log('Geometra MCP vs Playwright MCP-style summary-first board benchmark')
    console.log('Playwright side is approximated as navigate + aria snapshot + browser_run_code.')
    console.log(
      `Browser mode: ${options.headless ? 'headless' : 'headed'}${options.slowMo > 0 ? `, slowMo=${options.slowMo} ms` : ''}`,
    )
    console.log(`Page model mode: ${options.deferredPageModel ? 'deferred connect + later fetch' : 'inline on connect'}`)
    console.log(`Benchmark page: ${url}`)
    console.log(
      `Target task: open "${SCENARIO.target.title}" from the "${SCENARIO.target.listName}" queue.`,
    )

    const geometra = await runGeometraFlow(url, createServer, SCENARIO, options)
    const playwright = await runPlaywrightFlow(url, SCENARIO, options)

    printStepTable('Geometra steps', geometra.steps)
    printStepTable('Playwright-style steps', playwright.steps)

    const geometraTotals = withApproxTokens(summarizeTotals(geometra.steps))
    const geometraSemanticTotals = withApproxTokens(summarizeTotals(geometra.semanticSteps))
    const geometraExplorationTotals = withApproxTokens(summarizeTotals(geometra.explorationSteps))
    const playwrightTotals = withApproxTokens(summarizeTotals(playwright.steps))
    const playwrightSemanticTotals = withApproxTokens(summarizeTotals(playwright.semanticSteps))
    const playwrightExplorationTotals = withApproxTokens(summarizeTotals(playwright.explorationSteps))

    console.log('\nTotals')
    printTotals('Geometra end-to-end', geometraTotals)
    printTotals('Playwright-style end-to-end', playwrightTotals)
    console.log(
      `Playwright-style cold start: ${playwright.launchMs.toFixed(1)} ms browser launch + page setup (not counted in model-facing bytes/turns)`,
    )
    console.log(
      `Playwright-style full runtime including launch: ${(playwright.launchMs + playwrightTotals.elapsedMs).toFixed(1)} ms`,
    )
    printTotals('Geometra semantic-only', geometraSemanticTotals)
    printTotals('Playwright-style semantic-only', playwrightSemanticTotals)
    printTotals('Geometra exploration-only', geometraExplorationTotals)
    printTotals('Playwright-style exploration-only', playwrightExplorationTotals)

    console.log('')
    printDelta('End-to-end', geometraTotals, playwrightTotals)
    printDelta('Semantic-only', geometraSemanticTotals, playwrightSemanticTotals)
    printDelta('Exploration-only', geometraExplorationTotals, playwrightExplorationTotals)

    console.log('\nKey payloads')
    if (geometra.pageModelPayload?.deferred) {
      console.log(
        `Geometra deferred connect output: ${geometra.steps[0].outputBytes} B (~${approxTokens(geometra.steps[0].outputBytes)} tokens), connected=${geometra.connectPayload.connected === true}, ready=${geometra.pageModelPayload.ready === true}`,
      )
      console.log(
        `Geometra deferred page_model handoff: tool=${geometra.pageModelPayload.tool}, maxPrimaryActions=${geometra.pageModelPayload.options?.maxPrimaryActions ?? 'n/a'}, maxSectionsPerKind=${geometra.pageModelPayload.options?.maxSectionsPerKind ?? 'n/a'}`,
      )
    } else {
      console.log(
        `Geometra connect+page_model output: ${geometra.steps[0].outputBytes} B (~${approxTokens(geometra.steps[0].outputBytes)} tokens), connected=${geometra.connectPayload.connected === true}, landmarks=${geometra.pageModelPayload.landmarks.length}`,
      )
      console.log(
        `Geometra inline page_model primary actions: ${geometra.pageModelPayload.primaryActions.length}, lists=${geometra.pageModelPayload.lists.length}`,
      )
    }
    console.log(
      `Geometra contextual click output: ${geometra.steps[1].outputBytes} B (~${approxTokens(geometra.steps[1].outputBytes)} tokens), postWaitMatches=${geometra.clickPayload.postWait?.matchCount ?? 0}`,
    )
    console.log(
      `Playwright aria snapshot output: ${playwright.steps[1].outputBytes} B (~${approxTokens(playwright.steps[1].outputBytes)} tokens)`,
    )
    console.log(
      `Playwright run_code input: ${playwright.steps[2].inputBytes} B (~${approxTokens(playwright.steps[2].inputBytes)} tokens), dialogTitle=${JSON.stringify(playwright.runCodeResult.dialogTitle)}`,
    )

    if (options.assert) {
      assertBenchmark(geometra, playwright, SCENARIO)
      console.log('\nAssertions passed.')
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()))
    })
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
  runBuild(
    '@geometra/mcp',
    'npm',
    ['run', 'build'],
    path.join(ROOT, 'mcp'),
    path.join(ROOT, 'mcp/dist/server.js'),
  )

  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'mcp/dist/server.js')).href)
  await runScenario(createServer, args)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

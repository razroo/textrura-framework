#!/usr/bin/env node
/**
 * Compare a real semantic form workflow:
 * - Geometra MCP: connect + form_schema + fill_form
 * - Playwright MCP style: navigate + aria snapshot + browser_run_code
 *
 * This measures model-facing payload size (tool inputs + outputs), tool turns, and wall-clock time.
 * The Playwright side is an approximation of common MCP usage patterns rather than a literal invocation
 * of the Playwright MCP server.
 *
 * Run from repo root:
 *   node scripts/benchmark-mcp-form-flow.mjs
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
const BENCHMARK_HTML = path.join(ROOT, 'demos', 'mcp-form-benchmark', 'index.html')
const VIEWPORT = { width: 1280, height: 900 }
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const FORM_DATA = {
  fullName: 'Taylor Applicant',
  email: 'taylor@example.com',
  phone: '+49 30 1234 5678',
  location: 'Berlin, Germany',
  authorization: 'Yes',
  sponsorship: 'No',
  futureRoles: true,
  whyGeometra:
    'Geometra treats browser automation as a semantic systems problem instead of a sequence of brittle clicks, which is exactly the layer I want to help push forward.',
  hardProblem:
    'I rebuilt a failing workflow orchestration path by isolating race conditions, adding deterministic retries, and redesigning the state model so late async events could not corrupt user-visible progress.',
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

async function startStaticServer(filePath) {
  const html = await readFile(filePath, 'utf8')
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    if (req.url === '/favicon.ico') {
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

async function runGeometraFlow(url, createServer) {
  const server = createServer()
  const connect = getToolHandler(server, 'geometra_connect')
  const disconnect = getToolHandler(server, 'geometra_disconnect')
  const formSchema = getToolHandler(server, 'geometra_form_schema')
  const fillForm = getToolHandler(server, 'geometra_fill_form')

  let connected = false
  try {
    const connectStep = await invokeTool(connect, 'geometra_connect', {
      pageUrl: url,
      port: 0,
      headless: true,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      detail: 'minimal',
    })
    if (/^Failed to connect:/i.test(connectStep.outputText)) {
      throw new Error(connectStep.outputText)
    }
    connected = true

    const formSchemaStep = await invokeTool(formSchema, 'geometra_form_schema', {})
    if (!formSchemaStep.outputText.startsWith('{')) {
      throw new Error(`geometra_form_schema failed: ${formSchemaStep.outputText}`)
    }
    const formSchemaPayload = JSON.parse(formSchemaStep.outputText)
    const form = formSchemaPayload.forms?.[0]
    if (!form?.formId) throw new Error('Geometra form schema did not return a form id')

    const fieldsByLabel = Object.fromEntries(form.fields.map(field => [field.label, field.id]))

    const fillStep = await invokeTool(fillForm, 'geometra_fill_form', {
      formId: form.formId,
      valuesById: {
        [fieldsByLabel['Full name']]: FORM_DATA.fullName,
        [fieldsByLabel['Email']]: FORM_DATA.email,
        [fieldsByLabel['Phone']]: FORM_DATA.phone,
        [fieldsByLabel['Preferred location']]: FORM_DATA.location,
        [fieldsByLabel['Are you legally authorized to work in Germany?']]: FORM_DATA.authorization,
        [fieldsByLabel['Will you now or in the future require sponsorship?']]: FORM_DATA.sponsorship,
        [fieldsByLabel['Share my profile for future roles']]: FORM_DATA.futureRoles,
        [fieldsByLabel['Why Geometra?']]: FORM_DATA.whyGeometra,
        [fieldsByLabel['Describe a hard problem you solved.']]: FORM_DATA.hardProblem,
      },
      includeSteps: false,
      detail: 'minimal',
      failOnInvalid: true,
    })

    const fillPayload = JSON.parse(fillStep.outputText)

    return {
      steps: [connectStep, formSchemaStep, fillStep],
      semanticSteps: [formSchemaStep, fillStep],
      fillPayload,
      formId: form.formId,
    }
  } finally {
    if (connected) {
      try {
        await disconnect({})
      } catch {
        /* best effort cleanup */
      }
    }
  }
}

function renderPlaywrightRunCode() {
  return `
await page.getByLabel('Full name').fill(${JSON.stringify(FORM_DATA.fullName)});
await page.getByLabel('Email').fill(${JSON.stringify(FORM_DATA.email)});
await page.getByLabel('Phone').fill(${JSON.stringify(FORM_DATA.phone)});
await page.getByLabel('Preferred location').selectOption({ label: ${JSON.stringify(FORM_DATA.location)} });
const authorizationFieldset = page.locator('fieldset').filter({ hasText: ${JSON.stringify('Are you legally authorized to work in Germany?')} });
await authorizationFieldset.getByLabel(${JSON.stringify(FORM_DATA.authorization)}).check();
const sponsorshipFieldset = page.locator('fieldset').filter({ hasText: ${JSON.stringify('Will you now or in the future require sponsorship?')} });
await sponsorshipFieldset.getByLabel(${JSON.stringify(FORM_DATA.sponsorship)}).check();
await page.getByLabel(${JSON.stringify('Share my profile for future roles')}).setChecked(${FORM_DATA.futureRoles ? 'true' : 'false'});
await page.getByLabel('Why Geometra?').fill(${JSON.stringify(FORM_DATA.whyGeometra)});
await page.getByLabel('Describe a hard problem you solved.').fill(${JSON.stringify(FORM_DATA.hardProblem)});
return {
  ok: true,
  invalidCount: await page.locator(':invalid').count(),
  status: await page.getByRole('status').textContent(),
}
`.trim()
}

async function runPlaywrightFlow(url) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: VIEWPORT })

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

    const code = renderPlaywrightRunCode()
    const runCodeStarted = performance.now()
    const result = await new AsyncFunction('page', code)(page)
    const runCodeOutput = JSON.stringify(result)
    const runCodeStep = buildResult(
      'browser_run_code',
      { code },
      runCodeOutput,
      performance.now() - runCodeStarted,
    )

    return {
      steps: [navigateStep, snapshotStep, runCodeStep],
      semanticSteps: [snapshotStep, runCodeStep],
      runCodeResult: result,
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

function assertBenchmark(geometra, playwright) {
  const geometraTotals = withApproxTokens(summarizeTotals(geometra.steps))
  const geometraSemanticTotals = withApproxTokens(summarizeTotals(geometra.semanticSteps))
  const playwrightTotals = withApproxTokens(summarizeTotals(playwright.steps))
  const playwrightSemanticTotals = withApproxTokens(summarizeTotals(playwright.semanticSteps))

  const failures = []
  if (geometra.steps[1].outputBytes >= playwright.steps[1].outputBytes) {
    failures.push(
      `Expected geometra_form_schema output (${geometra.steps[1].outputBytes} B) to be smaller than the Playwright snapshot (${playwright.steps[1].outputBytes} B).`,
    )
  }
  if (geometraSemanticTotals.totalBytes >= playwrightSemanticTotals.totalBytes) {
    failures.push(
      `Expected Geometra semantic flow (${geometraSemanticTotals.totalBytes} B) to beat Playwright (${playwrightSemanticTotals.totalBytes} B).`,
    )
  }
  if (geometraTotals.totalBytes >= playwrightTotals.totalBytes) {
    failures.push(
      `Expected Geometra end-to-end flow (${geometraTotals.totalBytes} B) to beat Playwright (${playwrightTotals.totalBytes} B).`,
    )
  }

  if (failures.length > 0) {
    throw new Error(`Benchmark assertion failure:\n- ${failures.join('\n- ')}`)
  }
}

async function main() {
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
  const { server, url } = await startStaticServer(BENCHMARK_HTML)

  try {
    const warmup = await fetch(url)
    if (!warmup.ok) {
      throw new Error(`Benchmark page warmup failed: ${warmup.status}`)
    }

    console.log('Geometra MCP vs Playwright MCP-style form-flow benchmark')
    console.log('Playwright side is approximated as navigate + aria snapshot + browser_run_code.')
    console.log(`Benchmark page: ${url}`)

    const geometra = await runGeometraFlow(url, createServer)
    const playwright = await runPlaywrightFlow(url)

    printStepTable('Geometra steps', geometra.steps)
    printStepTable('Playwright-style steps', playwright.steps)

    const geometraTotals = withApproxTokens(summarizeTotals(geometra.steps))
    const geometraSemanticTotals = withApproxTokens(summarizeTotals(geometra.semanticSteps))
    const playwrightTotals = withApproxTokens(summarizeTotals(playwright.steps))
    const playwrightSemanticTotals = withApproxTokens(summarizeTotals(playwright.semanticSteps))

    console.log('\nTotals')
    printTotals('Geometra end-to-end', geometraTotals)
    printTotals('Playwright-style end-to-end', playwrightTotals)
    printTotals('Geometra semantic-only', geometraSemanticTotals)
    printTotals('Playwright-style semantic-only', playwrightSemanticTotals)

    console.log('')
    printDelta('End-to-end', geometraTotals, playwrightTotals)
    printDelta('Semantic-only', geometraSemanticTotals, playwrightSemanticTotals)

    console.log('\nKey payloads')
    console.log(
      `Geometra form_schema output: ${geometra.steps[1].outputBytes} B (~${approxTokens(geometra.steps[1].outputBytes)} tokens)`,
    )
    console.log(
      `Playwright aria snapshot output: ${playwright.steps[1].outputBytes} B (~${approxTokens(playwright.steps[1].outputBytes)} tokens)`,
    )
    console.log(
      `Geometra fill_form output: ${geometra.steps[2].outputBytes} B (~${approxTokens(geometra.steps[2].outputBytes)} tokens), invalidCount=${geometra.fillPayload.final?.invalidCount ?? 'n/a'}`,
    )
    console.log(
      `Playwright run_code input: ${playwright.steps[2].inputBytes} B (~${approxTokens(playwright.steps[2].inputBytes)} tokens), invalidCount=${playwright.runCodeResult.invalidCount}`,
    )

    if (process.argv.includes('--assert')) {
      assertBenchmark(geometra, playwright)
      console.log('\nAssertions passed.')
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()))
    })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

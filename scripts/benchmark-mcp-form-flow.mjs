#!/usr/bin/env node
/**
 * Compare semantic form workflows:
 * - Geometra MCP: connect + form_schema + fill_form
 * - Playwright MCP style: navigate + aria snapshot + browser_run_code
 *
 * This measures model-facing payload size (tool inputs + outputs), tool turns, and wall-clock time.
 * The Playwright side is an approximation of common MCP usage patterns rather than a literal invocation
 * of the Playwright MCP server.
 *
 * Run from repo root:
 *   node scripts/benchmark-mcp-form-flow.mjs
 *   node scripts/benchmark-mcp-form-flow.mjs --scenario heavy
 *   node scripts/benchmark-mcp-form-flow.mjs --all
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
const VIEWPORT = { width: 1280, height: 900 }
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const SCENARIOS = {
  baseline: {
    id: 'baseline',
    title: 'Baseline semantic application form',
    htmlPath: path.join(ROOT, 'demos', 'mcp-form-benchmark', 'index.html'),
    steps: [
      { kind: 'text', label: 'Full name', value: 'Taylor Applicant' },
      { kind: 'text', label: 'Email', value: 'taylor@example.com' },
      { kind: 'text', label: 'Phone', value: '+49 30 1234 5678' },
      { kind: 'select', label: 'Preferred location', value: 'Berlin, Germany' },
      { kind: 'radio', groupLabel: 'Are you legally authorized to work in Germany?', value: 'Yes' },
      { kind: 'radio', groupLabel: 'Will you now or in the future require sponsorship?', value: 'No' },
      { kind: 'checkbox', label: 'Share my profile for future roles', checked: true },
      {
        kind: 'text',
        label: 'Why Geometra?',
        value:
          'Geometra treats browser automation as a semantic systems problem instead of a sequence of brittle clicks, which is exactly the layer I want to help push forward.',
      },
      {
        kind: 'text',
        label: 'Describe a hard problem you solved.',
        value:
          'I rebuilt a failing workflow orchestration path by isolating race conditions, adding deterministic retries, and redesigning the state model so late async events could not corrupt user-visible progress.',
      },
    ],
  },
  heavy: {
    id: 'heavy',
    title: 'Heavy long-form application benchmark',
    htmlPath: path.join(ROOT, 'demos', 'mcp-form-benchmark-heavy', 'index.html'),
    steps: [
      { kind: 'text', label: 'Full name', value: 'Taylor Applicant' },
      { kind: 'text', label: 'Email', value: 'taylor@example.com' },
      { kind: 'text', label: 'Phone', value: '+49 30 1234 5678' },
      { kind: 'select', label: 'Preferred location', value: 'Berlin, Germany' },
      { kind: 'text', label: 'Current title', value: 'Staff Product Engineer' },
      { kind: 'text', label: 'Current company', value: 'Observatory Systems' },
      { kind: 'text', label: 'LinkedIn URL', value: 'https://www.linkedin.com/in/taylor-applicant' },
      { kind: 'text', label: 'Portfolio URL', value: 'https://taylor.example.com' },
      { kind: 'select', label: 'Years building developer tools', value: '6-8 years' },
      { kind: 'select', label: 'Years leading teams', value: '3-5 years' },
      { kind: 'select', label: 'Largest team managed', value: '6-10 people' },
      { kind: 'select', label: 'Preferred employment type', value: 'Full-time' },
      { kind: 'select', label: 'Which platform have you spent the most time on?', value: 'B2B SaaS' },
      { kind: 'select', label: 'Which programming language do you reach for first?', value: 'TypeScript' },
      { kind: 'text', label: 'Earliest start date', value: '2026-06-01' },
      { kind: 'text', label: 'Desired annual cash compensation', value: '$220,000 USD' },
      { kind: 'select', label: 'Preferred working timezone', value: 'Central European Time' },
      { kind: 'radio', groupLabel: 'Are you legally authorized to work in Germany?', value: 'Yes' },
      { kind: 'radio', groupLabel: 'Will you now or in the future require sponsorship?', value: 'No' },
      { kind: 'radio', groupLabel: 'Can you work a hybrid schedule in Berlin three days a week?', value: 'Yes' },
      { kind: 'radio', groupLabel: 'Are you open to travel up to 20 percent?', value: 'Yes' },
      { kind: 'radio', groupLabel: 'Can you overlap at least four hours with Eastern Time?', value: 'Yes' },
      { kind: 'radio', groupLabel: 'Are you comfortable participating in an on-call rotation?', value: 'Yes' },
      { kind: 'checkbox', label: 'Share my profile for future roles', checked: true },
      { kind: 'checkbox', label: 'I can complete a take-home exercise within one week', checked: true },
      { kind: 'checkbox', label: 'I have read the working agreement for this role', checked: true },
      {
        kind: 'text',
        label: 'Why Geometra?',
        value:
          'Geometra is interesting because it pushes browser automation up a level. I care about making agentic systems reliable in messy real interfaces, and the combination of semantic extraction, geometry, and compact tool surfaces is exactly the kind of systems problem I like working on.',
      },
      {
        kind: 'text',
        label: 'Describe a hard problem you solved.',
        value:
          'I inherited a workflow engine that mixed user-visible state with late asynchronous side effects. I isolated the races, split durable state from transient execution state, and added deterministic replay instrumentation so we could verify that retries and delayed callbacks could no longer corrupt the active run.',
      },
      {
        kind: 'text',
        label: 'Tell us about a product launch you drove end-to-end.',
        value:
          'I led the rollout of a new incident review surface from discovery through launch. That meant shaping the API, pairing on interaction design, building migration tooling, defining success metrics, and running the staged rollout until adoption and task completion hit the target thresholds.',
      },
      {
        kind: 'text',
        label: 'Describe a time you changed a system through measurement.',
        value:
          'A performance debate kept circling without progress, so I instrumented the rendering path, built a representative workload harness, and published regression budgets. Once the team could see the actual cost centers, we removed speculative fixes and focused on the two operations that dominated tail latency.',
      },
      {
        kind: 'text',
        label: 'What kind of team environment helps you do your best work?',
        value:
          'I do best on teams that are direct, evidence-driven, and willing to make constraints explicit. I like environments where quality is discussed concretely, tradeoffs are written down, and shipping quickly does not excuse vague ownership or unclear operating standards.',
      },
      {
        kind: 'text',
        label: 'Describe a debugging session that changed how you build software.',
        value:
          'I once spent days chasing an intermittent failure that only appeared under production timing. After that, I started building diagnostic hooks and reproducible harnesses before touching fixes, because the shortest path is usually to improve observability first and only then change behavior.',
      },
      { kind: 'text', label: 'Best writing sample URL', value: 'https://taylor.example.com/writing/performance-playbooks' },
      { kind: 'text', label: 'Open source project URL', value: 'https://github.com/taylor-applicant/control-plane-lab' },
    ],
  },
}

function parseArgs(argv) {
  let scenario = 'baseline'
  let runAll = false
  const assert = argv.includes('--assert')

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--scenario') {
      scenario = argv[index + 1] ?? ''
      index++
      continue
    }
    if (arg === '--all') {
      runAll = true
    }
  }

  return { scenario, runAll, assert }
}

function selectedScenarios({ scenario, runAll }) {
  if (runAll) return Object.values(SCENARIOS)
  const selected = SCENARIOS[scenario]
  if (!selected) {
    throw new Error(`Unknown scenario "${scenario}". Available scenarios: ${Object.keys(SCENARIOS).join(', ')}`)
  }
  return [selected]
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

function scenarioValuesByLabel(scenario) {
  return Object.fromEntries(
    scenario.steps.map(step => {
      if (step.kind === 'radio') return [step.groupLabel, step.value]
      if (step.kind === 'checkbox') return [step.label, step.checked]
      return [step.label, step.value]
    }),
  )
}

async function runGeometraFlow(url, createServer, scenario) {
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

    const fieldIdsByLabel = Object.fromEntries(form.fields.map(field => [field.label, field.id]))
    const valuesByLabel = scenarioValuesByLabel(scenario)
    const missingLabels = Object.keys(valuesByLabel).filter(label => !fieldIdsByLabel[label])
    if (missingLabels.length > 0) {
      throw new Error(`Scenario ${scenario.id} is missing form schema labels: ${missingLabels.join(', ')}`)
    }

    const fillStep = await invokeTool(fillForm, 'geometra_fill_form', {
      formId: form.formId,
      valuesById: Object.fromEntries(
        Object.entries(valuesByLabel).map(([label, value]) => [fieldIdsByLabel[label], value]),
      ),
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

function renderPlaywrightStep(step) {
  if (step.kind === 'text') {
    return `await page.getByLabel(${JSON.stringify(step.label)}).fill(${JSON.stringify(step.value)});`
  }
  if (step.kind === 'select') {
    return `await page.getByLabel(${JSON.stringify(step.label)}).selectOption({ label: ${JSON.stringify(step.value)} });`
  }
  if (step.kind === 'radio') {
    return `await page.locator('fieldset').filter({ hasText: ${JSON.stringify(step.groupLabel)} }).getByLabel(${JSON.stringify(step.value)}).check();`
  }
  return `await page.getByLabel(${JSON.stringify(step.label)}).setChecked(${step.checked ? 'true' : 'false'});`
}

function renderPlaywrightRunCode(scenario) {
  const lines = scenario.steps.map(renderPlaywrightStep)
  lines.push(`
return {
  ok: true,
  invalidCount: await page.locator(':invalid').count(),
  status: await page.getByRole('status').textContent(),
}
`.trim())
  return lines.join('\n')
}

async function runPlaywrightFlow(url, scenario) {
  const launchStarted = performance.now()
  const browser = await chromium.launch({ headless: true })
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
    const result = await new AsyncFunction('page', code)(page)
    const runCodeOutput = JSON.stringify(result)
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

function assertBenchmark(geometra, playwright, scenario) {
  const geometraTotals = withApproxTokens(summarizeTotals(geometra.steps))
  const geometraSemanticTotals = withApproxTokens(summarizeTotals(geometra.semanticSteps))
  const playwrightTotals = withApproxTokens(summarizeTotals(playwright.steps))
  const playwrightSemanticTotals = withApproxTokens(summarizeTotals(playwright.semanticSteps))
  const geometraInvalidCount = geometra.fillPayload.final?.invalidCount
  const playwrightInvalidCount = playwright.runCodeResult.invalidCount

  const failures = []
  if (geometraInvalidCount !== 0) {
    failures.push(
      `[${scenario.id}] Expected Geometra to finish with invalidCount=0, received ${String(geometraInvalidCount ?? 'unknown')}.`,
    )
  }
  if (playwrightInvalidCount !== 0) {
    failures.push(
      `[${scenario.id}] Expected Playwright to finish with invalidCount=0, received ${String(playwrightInvalidCount ?? 'unknown')}.`,
    )
  }
  if (geometra.steps[1].outputBytes >= playwright.steps[1].outputBytes) {
    failures.push(
      `[${scenario.id}] Expected geometra_form_schema output (${geometra.steps[1].outputBytes} B) to be smaller than the Playwright snapshot (${playwright.steps[1].outputBytes} B).`,
    )
  }
  if (geometraSemanticTotals.totalBytes >= playwrightSemanticTotals.totalBytes) {
    failures.push(
      `[${scenario.id}] Expected Geometra semantic flow (${geometraSemanticTotals.totalBytes} B) to beat Playwright (${playwrightSemanticTotals.totalBytes} B).`,
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

async function runScenario(scenario, createServer, assert) {
  const { server, url } = await startStaticServer(scenario.htmlPath)

  try {
    const warmup = await fetch(url)
    if (!warmup.ok) {
      throw new Error(`Benchmark page warmup failed: ${warmup.status}`)
    }

    console.log(`\nScenario: ${scenario.id}`)
    console.log(`${scenario.title}`)
    console.log('Geometra MCP vs Playwright MCP-style form-flow benchmark')
    console.log('Playwright side is approximated as navigate + aria snapshot + browser_run_code.')
    console.log(`Benchmark page: ${url}`)

    const geometra = await runGeometraFlow(url, createServer, scenario)
    const playwright = await runPlaywrightFlow(url, scenario)

    printStepTable('Geometra steps', geometra.steps)
    printStepTable('Playwright-style steps', playwright.steps)

    const geometraTotals = withApproxTokens(summarizeTotals(geometra.steps))
    const geometraSemanticTotals = withApproxTokens(summarizeTotals(geometra.semanticSteps))
    const playwrightTotals = withApproxTokens(summarizeTotals(playwright.steps))
    const playwrightSemanticTotals = withApproxTokens(summarizeTotals(playwright.semanticSteps))

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
    console.log(`Geometra fill_form execution: ${geometra.fillPayload.execution ?? 'unknown'}`)
    console.log(
      `Playwright run_code input: ${playwright.steps[2].inputBytes} B (~${approxTokens(playwright.steps[2].inputBytes)} tokens), invalidCount=${playwright.runCodeResult.invalidCount}`,
    )

    if (assert) {
      assertBenchmark(geometra, playwright, scenario)
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
  const scenarios = selectedScenarios(args)

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

  for (const [index, scenario] of scenarios.entries()) {
    if (index > 0) {
      console.log('\n' + '='.repeat(80))
    }
    await runScenario(scenario, createServer, args.assert)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

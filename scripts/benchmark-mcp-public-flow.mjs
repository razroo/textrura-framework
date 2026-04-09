#!/usr/bin/env node
/**
 * Compare a public multi-step checkout workflow:
 * - Geometra MCP: one auto-connected run_actions batch with semantic waits
 * - Playwright MCP style: navigate + aria snapshots + browser_run_code across route shifts
 *
 * This benchmark focuses on a stable public demo flow that exercises login, repeated actions,
 * route changes, and a checkout form without completing a real purchase.
 *
 * Run from repo root:
 *   node scripts/benchmark-mcp-public-flow.mjs
 *   node scripts/benchmark-mcp-public-flow.mjs --assert
 *   node scripts/benchmark-mcp-public-flow.mjs --prewarm
 *   node scripts/benchmark-mcp-public-flow.mjs --warm-reuse
 *   node scripts/benchmark-mcp-public-flow.mjs --headed --slow-mo 250
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VIEWPORT = { width: 1280, height: 900 }
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const SCENARIO = {
  id: 'swaglabs-checkout',
  title: 'Public e-commerce checkout benchmark',
  site: 'Swag Labs',
  url: 'https://www.saucedemo.com/',
  productName: 'Sauce Labs Backpack',
  credentials: {
    username: 'standard_user',
    password: 'secret_sauce',
  },
  shopper: {
    firstName: 'Taylor',
    lastName: 'Benchmark',
    postalCode: '10001',
  },
  stopBeforeSubmit: true,
}

function parseArgs(argv) {
  let headless = true
  let slowMo = 0
  let prewarm = false
  let warmReuse = false

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
    if (arg === '--warm-reuse') {
      warmReuse = true
      continue
    }
    if (arg === '--prewarm') {
      prewarm = true
    }
  }

  return {
    assert: argv.includes('--assert'),
    headless,
    prewarm,
    slowMo,
    warmReuse,
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

function buildResult(tool, step, input, outputText, elapsedMs) {
  const inputBytes = toolInputBytes(tool, input)
  const outputBytes = bytes(outputText)
  return {
    tool,
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

function cloneJson(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value))
}

function getToolHandler(server, name) {
  return server._registeredTools[name].handler
}

async function invokeTool(handler, tool, input, step = tool) {
  const started = performance.now()
  const result = await handler(input)
  const outputText = contentText(result)
  if (result?.isError === true) {
    throw new Error(`${step} failed: ${outputText || 'Unknown tool error'}`)
  }
  return buildResult(tool, step, input, outputText, performance.now() - started)
}

async function runGeometraFlow(createServer, getSession, scenario, options, runOptions = {}) {
  const server = createServer()
  const prepareBrowser = getToolHandler(server, 'geometra_prepare_browser')
  const runActions = getToolHandler(server, 'geometra_run_actions')
  const disconnect = getToolHandler(server, 'geometra_disconnect')
  let browserOpen = false

  try {
    const prepareStep = runOptions.prewarm
      ? await invokeTool(
          prepareBrowser,
          'geometra_prepare_browser',
          {
            pageUrl: scenario.url,
            port: 0,
            headless: options.headless,
            width: VIEWPORT.width,
            height: VIEWPORT.height,
            slowMo: options.slowMo > 0 ? options.slowMo : undefined,
          },
          runOptions.prepareStepName ?? 'geometra_prepare_browser.checkout_flow',
        )
      : null
    const preparePayload = prepareStep ? parseJsonOutput(prepareStep) : null
    const stepName = runOptions.stepName ?? 'geometra_run_actions.checkout_flow'
    const runStep = await invokeTool(
      runActions,
      'geometra_run_actions',
      {
        pageUrl: scenario.url,
        port: 0,
        headless: options.headless,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        slowMo: options.slowMo > 0 ? options.slowMo : undefined,
        actions: [
          {
            type: 'fill_fields',
            fields: [
              { kind: 'text', fieldLabel: 'Username', value: scenario.credentials.username },
              { kind: 'text', fieldLabel: 'Password', value: scenario.credentials.password },
            ],
          },
          {
            type: 'click',
            role: 'button',
            name: 'Login',
            waitFor: { text: 'Products', present: true, timeoutMs: 15_000 },
            timeoutMs: 15_000,
          },
          {
            type: 'click',
            role: 'button',
            name: 'Add to cart',
            itemText: scenario.productName,
            timeoutMs: 8_000,
          },
          {
            type: 'click',
            role: 'link',
            name: '1',
            waitFor: { text: 'Your Cart', present: true, timeoutMs: 10_000 },
            timeoutMs: 10_000,
          },
          {
            type: 'click',
            role: 'button',
            name: 'Checkout',
            waitFor: { text: 'Checkout: Your Information', present: true, timeoutMs: 10_000 },
            timeoutMs: 10_000,
          },
          {
            type: 'fill_fields',
            fields: [
              { kind: 'text', fieldLabel: 'First Name', value: scenario.shopper.firstName },
              { kind: 'text', fieldLabel: 'Last Name', value: scenario.shopper.lastName },
              { kind: 'text', fieldLabel: 'Zip/Postal Code', value: scenario.shopper.postalCode },
            ],
          },
          {
            type: 'click',
            role: 'button',
            name: 'Continue',
            waitFor: { text: 'Checkout: Overview', present: true, timeoutMs: 10_000 },
            timeoutMs: 10_000,
          },
          {
            type: 'wait_for',
            role: 'link',
            name: scenario.productName,
            present: true,
            timeoutMs: 10_000,
          },
        ],
        includeSteps: false,
        output: 'final',
        detail: 'terse',
      },
      stepName,
    )
    const runPayload = parseJsonOutput(runStep)
    browserOpen = runPayload.autoConnected === true
    const session = browserOpen ? getSession() : null
    const connectTrace = cloneJson(session?.connectTrace ?? null)
    const proxyTrace = typeof session?.proxyRuntime?.getTrace === 'function'
      ? cloneJson(session.proxyRuntime.getTrace())
      : null

    return {
      label: runOptions.label ?? 'cold',
      prepareStep,
      preparePayload,
      steps: [runStep],
      semanticSteps: [runStep],
      runPayload,
      connectTrace,
      proxyTrace,
    }
  } finally {
    if (browserOpen) {
      try {
        await disconnect({ closeBrowser: runOptions.closeBrowser ?? true })
      } catch {
        /* best effort cleanup */
      }
    }
  }
}

function renderPlaywrightLoginCode(scenario) {
  return `
await page.locator('[data-test="username"]').fill(${JSON.stringify(scenario.credentials.username)});
await page.locator('[data-test="password"]').fill(${JSON.stringify(scenario.credentials.password)});
await page.locator('[data-test="login-button"]').click();
await page.getByText('Products').waitFor({ state: 'visible', timeout: 15000 });
return {
  ok: true,
  heading: await page.getByText('Products').textContent(),
  url: page.url(),
}
`.trim()
}

function renderPlaywrightCartCode(scenario) {
  return `
await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
const cartCount = await page.locator('[data-test="shopping-cart-badge"]').textContent();
await page.locator('[data-test="shopping-cart-link"]').click();
await page.getByText('Your Cart').waitFor({ state: 'visible', timeout: 10000 });
await page.locator('[data-test="checkout"]').click();
await page.getByText('Checkout: Your Information').waitFor({ state: 'visible', timeout: 10000 });
return {
  ok: true,
  cartCount,
  heading: await page.getByText('Checkout: Your Information').textContent(),
  url: page.url(),
}
`.trim()
}

function renderPlaywrightOverviewCode(scenario) {
  return `
await page.locator('[data-test="firstName"]').fill(${JSON.stringify(scenario.shopper.firstName)});
await page.locator('[data-test="lastName"]').fill(${JSON.stringify(scenario.shopper.lastName)});
await page.locator('[data-test="postalCode"]').fill(${JSON.stringify(scenario.shopper.postalCode)});
await page.locator('[data-test="continue"]').click();
await page.getByText('Checkout: Overview').waitFor({ state: 'visible', timeout: 10000 });
return {
  ok: true,
  heading: await page.getByText('Checkout: Overview').textContent(),
  finishVisible: await page.getByRole('button', { name: 'Finish' }).isVisible(),
  backpackCount: await page.getByRole('link', { name: ${JSON.stringify(scenario.productName)} }).count(),
  url: page.url(),
}
`.trim()
}

async function runPlaywrightCode(page, stepName, code) {
  const started = performance.now()
  const result = await new AsyncFunction('page', code)(page)
  return {
    step: buildResult('browser_run_code', stepName, { code }, JSON.stringify(result), performance.now() - started),
    result,
  }
}

async function runPlaywrightSnapshot(page, label, pageName) {
  const input = { scope: 'body', mode: 'ai', page: pageName }
  const started = performance.now()
  const snapshot = await page.locator('body').ariaSnapshot({ mode: 'ai', timeout: 15_000 })
  return {
    step: buildResult('browser_snapshot', label, input, snapshot, performance.now() - started),
    snapshot,
  }
}

async function runPlaywrightFlow(scenario, options) {
  const launchStarted = performance.now()
  const browser = await chromium.launch({
    headless: options.headless,
    slowMo: options.slowMo,
  })
  const page = await browser.newPage({ viewport: VIEWPORT })
  const launchMs = performance.now() - launchStarted

  try {
    const navigateInput = { url: scenario.url }
    const navigateStarted = performance.now()
    await page.goto(scenario.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const navigateOutput = JSON.stringify({ url: page.url(), title: await page.title() })
    const navigateStep = buildResult('browser_navigate', 'browser_navigate', navigateInput, navigateOutput, performance.now() - navigateStarted)

    const loginSnapshot = await runPlaywrightSnapshot(page, 'browser_snapshot.login', 'login')

    const loginRun = await runPlaywrightCode(page, 'browser_run_code.login', renderPlaywrightLoginCode(scenario))

    const inventorySnapshot = await runPlaywrightSnapshot(page, 'browser_snapshot.inventory', 'inventory')

    const cartRun = await runPlaywrightCode(page, 'browser_run_code.cart', renderPlaywrightCartCode(scenario))

    const checkoutSnapshot = await runPlaywrightSnapshot(page, 'browser_snapshot.checkout_info', 'checkout_info')

    const overviewRun = await runPlaywrightCode(page, 'browser_run_code.overview', renderPlaywrightOverviewCode(scenario))

    return {
      launchMs,
      steps: [
        navigateStep,
        loginSnapshot.step,
        loginRun.step,
        inventorySnapshot.step,
        cartRun.step,
        checkoutSnapshot.step,
        overviewRun.step,
      ],
      semanticSteps: [
        loginSnapshot.step,
        loginRun.step,
        inventorySnapshot.step,
        cartRun.step,
        checkoutSnapshot.step,
        overviewRun.step,
      ],
      loginRunResult: loginRun.result,
      cartRunResult: cartRun.result,
      overviewRunResult: overviewRun.result,
      snapshots: {
        login: loginSnapshot.snapshot,
        inventory: inventorySnapshot.snapshot,
        checkoutInfo: checkoutSnapshot.snapshot,
      },
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

function formatMs(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} ms` : 'n/a'
}

function printGeometraTrace(run) {
  if (!run.connectTrace && !run.proxyTrace) return

  console.log(`\nGeometra ${run.label} trace`)
  if (run.connectTrace) {
    const trace = run.connectTrace
    const mode = trace.mode === 'fresh-proxy'
      ? `fresh proxy${trace.proxyStartMode ? ` (${trace.proxyStartMode})` : ''}`
      : trace.mode === 'reused-proxy'
        ? 'reused proxy'
        : 'direct ws'
    console.log(
      `Connect/attach: ${formatMs(trace.totalMs)} total, mode=${mode}, awaitInitialFrame=${trace.awaitInitialFrame === true}`,
    )
    if (trace.proxyStartMs !== undefined) {
      console.log(`Proxy start inside connect: ${formatMs(trace.proxyStartMs)}`)
    }
    if (trace.connectMs !== undefined) {
      console.log(`WebSocket handshake inside connect: ${formatMs(trace.connectMs)}`)
    }
    if (trace.wsOpenMs !== undefined) {
      console.log(`WebSocket open: ${formatMs(trace.wsOpenMs)}`)
    }
    if (trace.firstFrameMs !== undefined) {
      console.log(`First frame observed by MCP: ${formatMs(trace.firstFrameMs)}`)
    }
    if (trace.resizeKickoffMs !== undefined) {
      console.log(`Resize kickoff wait: ${formatMs(trace.resizeKickoffMs)}`)
    }
    if (trace.navigateMs !== undefined) {
      console.log(`Proxy-side navigate: ${formatMs(trace.navigateMs)}`)
    }
  }

  const postConnectMs = Math.max(0, run.steps[0].elapsedMs - (run.connectTrace?.totalMs ?? 0))
  console.log(`run_actions after connect returned: ${postConnectMs.toFixed(1)} ms`)

  if (!run.proxyTrace) return

  const trace = run.proxyTrace
  console.log(`Proxy browser launch: ${formatMs(trace.browserLaunchMs)}`)
  console.log(`Proxy newPage: ${formatMs(trace.newPageMs)}`)
  console.log(`Proxy WebSocket listening: ${formatMs(trace.wsListeningMs)}`)
  console.log(`Initial navigation to domcontentloaded: ${formatMs(trace.initialNavigationMs)}`)
  if (trace.observerInstallMs !== undefined) {
    console.log(`DOM observer install: ${formatMs(trace.observerInstallMs)}`)
  }
  console.log(`Proxy ready (startup -> first extract flushed): ${formatMs(trace.readyMs)}`)

  const firstExtract = trace.geometry?.firstExtract
  if (!firstExtract) return

  console.log(
    `First extract: ${formatMs(firstExtract.totalMs)} total = beforeInput ${formatMs(firstExtract.beforeInputMs)}, extract ${formatMs(firstExtract.extractMs)}, broadcast ${formatMs(firstExtract.broadcastMs)}`,
  )
  console.log(
    `Extractor detail: main frame ${formatMs(firstExtract.extractor.mainFrameMs)}, iframe merge ${formatMs(firstExtract.extractor.iframeMergeMs)} (${firstExtract.extractor.iframeCount ?? 0} iframe(s)), AX decision ${formatMs(firstExtract.extractor.axDecisionMs)}, AX enrich ${firstExtract.extractor.axRan ? formatMs(firstExtract.extractor.axEnrichMs) : 'skipped'}, treeJson ${formatMs(firstExtract.extractor.treeJsonMs)}`,
  )
  if (
    firstExtract.recovery.attemptCount > 1
    || firstExtract.recovery.domContentLoadedWaitMs > 0
    || firstExtract.recovery.loadWaitMs > 0
  ) {
    console.log(
      `Extract recovery: ${firstExtract.recovery.attemptCount} attempt(s), domcontentloaded wait ${formatMs(firstExtract.recovery.domContentLoadedWaitMs)}, load wait ${formatMs(firstExtract.recovery.loadWaitMs)}`,
    )
  }
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

function assertBenchmark(geometra, playwright, scenario, label = 'Geometra') {
  const geometraTotals = withApproxTokens(summarizeTotals(geometra.steps))
  const geometraSemanticTotals = withApproxTokens(summarizeTotals(geometra.semanticSteps))
  const playwrightTotals = withApproxTokens(summarizeTotals(playwright.steps))
  const playwrightSemanticTotals = withApproxTokens(summarizeTotals(playwright.semanticSteps))

  const failures = []
  if (geometra.preparePayload && geometra.preparePayload.prepared !== true) {
    failures.push(`[${scenario.id}] Expected ${label} browser prep to report prepared=true.`)
  }
  if (geometra.runPayload.autoConnected !== true) {
    failures.push(`[${scenario.id}] Expected ${label} run_actions to auto-connect successfully.`)
  }
  if (geometra.runPayload.completed !== true) {
    failures.push(`[${scenario.id}] Expected ${label} run_actions to complete successfully.`)
  }
  if (!normalizeText(playwright.loginRunResult.heading).includes('products')) {
    failures.push(
      `[${scenario.id}] Expected Playwright login step to reach Products, received ${JSON.stringify(playwright.loginRunResult.heading)}`,
    )
  }
  if (normalizeText(playwright.cartRunResult.heading) !== normalizeText('Checkout: Your Information')) {
    failures.push(
      `[${scenario.id}] Expected Playwright cart step to reach checkout info, received ${JSON.stringify(playwright.cartRunResult.heading)}`,
    )
  }
  if (normalizeText(playwright.overviewRunResult.heading) !== normalizeText('Checkout: Overview')) {
    failures.push(
      `[${scenario.id}] Expected Playwright overview step to reach checkout overview, received ${JSON.stringify(playwright.overviewRunResult.heading)}`,
    )
  }
  if (playwright.overviewRunResult.finishVisible !== true) {
    failures.push(`[${scenario.id}] Expected Playwright overview step to leave Finish visible without submitting.`)
  }
  if (Number(playwright.overviewRunResult.backpackCount ?? 0) < 1) {
    failures.push(`[${scenario.id}] Expected Playwright overview step to keep "${scenario.productName}" in the checkout summary.`)
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

  const [{ createServer }, { getSession }] = await Promise.all([
    import(pathToFileURL(path.join(ROOT, 'mcp/dist/server.js')).href),
    import(pathToFileURL(path.join(ROOT, 'mcp/dist/session.js')).href),
  ])

  console.log(`Scenario: ${SCENARIO.id}`)
  console.log(`${SCENARIO.title} (${SCENARIO.site})`)
  console.log('Geometra MCP vs Playwright MCP-style public checkout benchmark')
  console.log('Playwright side is approximated as navigate + aria snapshots + browser_run_code across route changes.')
  console.log(
    `Browser mode: ${args.headless ? 'headless' : 'headed'}${args.slowMo > 0 ? `, slowMo=${args.slowMo} ms` : ''}`,
  )
  console.log(`Prewarm mode: ${args.prewarm ? 'yes (prepare browser before measured task runtime)' : 'no'}`)
  console.log(`Warm reuse mode: ${args.warmReuse ? 'yes (cold run keeps proxy/browser warm, then reruns)' : 'no'}`)
  console.log(`Benchmark URL: ${SCENARIO.url}`)
  console.log(`Target path: login -> add "${SCENARIO.productName}" -> cart -> checkout info -> overview`)
  console.log(`Stop before submit: ${SCENARIO.stopBeforeSubmit ? 'yes' : 'no'}`)

  const geometra = await runGeometraFlow(createServer, getSession, SCENARIO, args, {
    label: args.prewarm ? 'prepared' : 'cold',
    prewarm: args.prewarm,
    prepareStepName: 'geometra_prepare_browser.checkout_flow',
    stepName: `geometra_run_actions.checkout_flow.${args.prewarm ? 'prepared' : 'cold'}`,
    closeBrowser: !args.warmReuse,
  })
  const geometraWarm = args.warmReuse
    ? await runGeometraFlow(createServer, getSession, SCENARIO, args, {
        label: 'warm',
        stepName: 'geometra_run_actions.checkout_flow.warm',
        closeBrowser: true,
      })
    : null
  const playwright = await runPlaywrightFlow(SCENARIO, args)

  if (geometra.prepareStep) {
    printStepTable('Geometra browser prep', [geometra.prepareStep])
  }
  printStepTable(`Geometra ${geometra.label} steps`, geometra.steps)
  if (geometraWarm) {
    printStepTable('Geometra warm steps', geometraWarm.steps)
  }
  printStepTable('Playwright-style steps', playwright.steps)

  const geometraPrepareTotals = geometra.prepareStep ? withApproxTokens(summarizeTotals([geometra.prepareStep])) : null
  const geometraTotals = withApproxTokens(summarizeTotals(geometra.steps))
  const geometraSemanticTotals = withApproxTokens(summarizeTotals(geometra.semanticSteps))
  const geometraWarmTotals = geometraWarm ? withApproxTokens(summarizeTotals(geometraWarm.steps)) : null
  const geometraWarmSemanticTotals = geometraWarm ? withApproxTokens(summarizeTotals(geometraWarm.semanticSteps)) : null
  const playwrightTotals = withApproxTokens(summarizeTotals(playwright.steps))
  const playwrightSemanticTotals = withApproxTokens(summarizeTotals(playwright.semanticSteps))

  console.log('\nTotals')
  if (geometraPrepareTotals) {
    printTotals('Geometra browser prep', geometraPrepareTotals)
    console.log(
      `Geometra full runtime including prep: ${(geometraPrepareTotals.elapsedMs + geometraTotals.elapsedMs).toFixed(1)} ms`,
    )
  }
  printTotals(`Geometra ${geometra.label} end-to-end`, geometraTotals)
  if (geometraWarmTotals) {
    printTotals('Geometra warm end-to-end', geometraWarmTotals)
  }
  printTotals('Playwright-style end-to-end', playwrightTotals)
  console.log(
    `Playwright-style cold start: ${playwright.launchMs.toFixed(1)} ms browser launch + page setup (not counted in model-facing bytes/turns)`,
  )
  console.log(
    `Playwright-style full runtime including launch: ${(playwright.launchMs + playwrightTotals.elapsedMs).toFixed(1)} ms`,
  )
  printTotals('Geometra cold semantic-only', geometraSemanticTotals)
  if (geometraWarmSemanticTotals) {
    printTotals('Geometra warm semantic-only', geometraWarmSemanticTotals)
  }
  printTotals('Playwright-style semantic-only', playwrightSemanticTotals)

  console.log('')
  printDelta(`End-to-end (${geometra.label})`, geometraTotals, playwrightTotals)
  if (geometraWarmTotals) {
    printDelta('End-to-end (warm)', geometraWarmTotals, playwrightTotals)
  }
  printDelta(`Semantic-only (${geometra.label})`, geometraSemanticTotals, playwrightSemanticTotals)
  if (geometraWarmSemanticTotals) {
    printDelta('Semantic-only (warm)', geometraWarmSemanticTotals, playwrightSemanticTotals)
  }
  if (geometraWarmTotals) {
    const speedup = geometraTotals.elapsedMs / geometraWarmTotals.elapsedMs
    console.log(
      `Warm reuse speedup: ${speedup.toFixed(2)}x faster than cold Geometra (${geometraTotals.elapsedMs.toFixed(1)} ms -> ${geometraWarmTotals.elapsedMs.toFixed(1)} ms).`,
    )
    const deltaMs = playwrightTotals.elapsedMs - geometraWarmTotals.elapsedMs
    if (deltaMs > 0) {
      console.log(
        `Warm Geometra beat Playwright-style tool runtime by ${deltaMs.toFixed(1)} ms.`,
      )
    } else {
      console.log(
        `Warm Geometra remained ${Math.abs(deltaMs).toFixed(1)} ms slower than the Playwright-style tool runtime.`,
      )
    }
  }

  printGeometraTrace(geometra)
  if (geometraWarm) {
    printGeometraTrace(geometraWarm)
  }

  console.log('\nKey payloads')
  console.log(
    `Geometra ${geometra.label} run_actions output: ${geometra.steps[0].outputBytes} B (~${approxTokens(geometra.steps[0].outputBytes)} tokens), autoConnected=${geometra.runPayload.autoConnected === true}, completed=${geometra.runPayload.completed === true}`,
  )
  if (geometra.prepareStep && geometra.preparePayload) {
    console.log(
      `Geometra browser prep output: ${geometra.prepareStep.outputBytes} B (~${approxTokens(geometra.prepareStep.outputBytes)} tokens), reused=${geometra.preparePayload.reused === true}, transport=${geometra.preparePayload.transport}`,
    )
  }
  if (geometraWarm) {
    console.log(
      `Geometra warm run_actions output: ${geometraWarm.steps[0].outputBytes} B (~${approxTokens(geometraWarm.steps[0].outputBytes)} tokens), autoConnected=${geometraWarm.runPayload.autoConnected === true}, completed=${geometraWarm.runPayload.completed === true}`,
    )
  }
  console.log(
    `Playwright login snapshot output: ${playwright.steps[1].outputBytes} B (~${approxTokens(playwright.steps[1].outputBytes)} tokens)`,
  )
  console.log(
    `Playwright inventory snapshot output: ${playwright.steps[3].outputBytes} B (~${approxTokens(playwright.steps[3].outputBytes)} tokens)`,
  )
  console.log(
    `Playwright checkout snapshot output: ${playwright.steps[5].outputBytes} B (~${approxTokens(playwright.steps[5].outputBytes)} tokens)`,
  )
  console.log(
    `Playwright overview code input: ${playwright.steps[6].inputBytes} B (~${approxTokens(playwright.steps[6].inputBytes)} tokens), heading=${JSON.stringify(playwright.overviewRunResult.heading)}, backpackCount=${playwright.overviewRunResult.backpackCount}`,
  )

  if (args.assert) {
    assertBenchmark(geometra, playwright, SCENARIO, `Geometra ${geometra.label}`)
    if (geometraWarm) {
      assertBenchmark(geometraWarm, playwright, SCENARIO, 'Geometra warm')
    }
    console.log('\nAssertions passed.')
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

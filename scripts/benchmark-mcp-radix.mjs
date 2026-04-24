#!/usr/bin/env node
/**
 * End-to-end smoke test for the Geometra MCP against a Radix-Select-backed
 * eligibility form built with REAL @radix-ui/react-select (not a hand-coded
 * mimic).
 *
 * Why this exists: extractor.ts:findCustomComboboxValueText has selector
 * support for `[class*="SelectValue"]` and `[data-radix-select-value]`,
 * but until this fixture existed it was only validated against hand-coded
 * mocks in extractor.test.ts. Real Radix Select renders a button trigger
 * with a `<span data-radix-select-value>` child and a portal'd menu — the
 * exact DOM the proxy's sibling-readback path is supposed to handle. This
 * benchmark proves it actually works against the real library, closing
 * the coverage gap left by the react-select-only mcp-greenhouse benchmark.
 *
 * Run from repo root:
 *   node scripts/benchmark-mcp-radix.mjs
 *   node scripts/benchmark-mcp-radix.mjs --assert
 *   node scripts/benchmark-mcp-radix.mjs --headed --slow-mo 250
 */
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VIEWPORT = { width: 1280, height: 960 }
const FIXTURE_DIR = path.join(ROOT, 'demos', 'mcp-radix-fixture')
const FIXTURE_DIST = path.join(FIXTURE_DIR, 'dist')

const ELIGIBILITY_FIELDS = {
  'Are you legally authorized to work in the country in which you are applying?': 'Yes',
  'Will you now or in the future require sponsorship for employment visa status?': 'No',
  'Have you previously worked for this company?': 'No',
  'Do you require any accommodations for the interview process?': 'Yes',
}

function parseArgs(argv) {
  let headless = true
  let slowMo = 0

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--headed') {
      headless = false
      continue
    }
    if (arg === '--slow-mo') {
      const value = Number(argv[index + 1] ?? '')
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid --slow-mo value "${argv[index + 1] ?? ''}"`)
      }
      slowMo = value
      index++
      continue
    }
    if (arg.startsWith('--slow-mo=')) {
      const value = Number(arg.slice('--slow-mo='.length))
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid --slow-mo value "${arg.slice('--slow-mo='.length)}"`)
      }
      slowMo = value
      continue
    }
  }

  return { assert: argv.includes('--assert'), headless, slowMo }
}

function bytes(value) {
  return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
}

function approxTokens(byteCount) {
  return Math.round(byteCount / 4)
}

function contentText(result) {
  const items = Array.isArray(result?.content) ? result.content : []
  return items
    .map(item => (typeof item?.text === 'string' ? item.text : ''))
    .filter(Boolean)
    .join('\n')
}

function buildResult(step, input, outputText, elapsedMs) {
  const inputBytes = bytes({ tool: step, input })
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

function parseJsonOutput(step) {
  const text = step.outputText.trim()
  if (!text.startsWith('{') && !text.startsWith('[')) {
    throw new Error(`${step.step} did not return JSON: ${step.outputText.slice(0, 400)}`)
  }
  return JSON.parse(text)
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

async function ensureFixtureBuilt() {
  const indexHtml = path.join(FIXTURE_DIST, 'index.html')
  const appSrc = path.join(FIXTURE_DIR, 'src', 'App.tsx')
  let stale = false
  if (!existsSync(indexHtml)) {
    stale = true
  } else {
    try {
      const distMtime = (await stat(indexHtml)).mtimeMs
      const srcMtime = (await stat(appSrc)).mtimeMs
      if (srcMtime > distMtime) stale = true
    } catch {
      stale = true
    }
  }
  if (!stale) return
  console.log('Rebuilding mcp-radix-fixture (vite)...')
  runBuild(
    '@geometra/demo-mcp-radix-fixture',
    'bunx',
    ['vite', 'build'],
    FIXTURE_DIR,
    indexHtml,
  )
}

const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
}

async function startStaticServer(rootDir) {
  const absoluteRoot = path.resolve(rootDir)
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      let pathname = url.pathname
      if (pathname === '/') pathname = '/index.html'
      const target = path.resolve(absoluteRoot, '.' + pathname)
      if (!target.startsWith(absoluteRoot)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }
      const data = await readFile(target)
      const ext = path.extname(target).toLowerCase()
      res.writeHead(200, { 'content-type': STATIC_MIME[ext] ?? 'application/octet-stream' })
      res.end(data)
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Not found')
        return
      }
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(String(err))
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind benchmark HTTP server')
  }
  return { server, url: `http://127.0.0.1:${address.port}/` }
}

function getToolHandler(server, name) {
  return server._registeredTools[name].handler
}

async function invokeTool(handler, name, input) {
  const started = performance.now()
  const result = await handler(input)
  return buildResult(name, input, contentText(result), performance.now() - started)
}

function normalizeLabel(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function collectSchemas(payload) {
  if (!payload || typeof payload !== 'object') return []
  if (Array.isArray(payload.formSchemas)) return payload.formSchemas
  if (Array.isArray(payload.forms)) return payload.forms
  if (payload.formSchema) return [payload.formSchema]
  if (Array.isArray(payload.fields)) return [{ formId: payload.formId, fields: payload.fields }]
  return []
}

function pickTargetForm(schemas, requested) {
  const requestedKeys = new Set(Object.keys(requested).map(normalizeLabel))
  let best = null
  let bestScore = -1
  for (const schema of schemas) {
    const labels = new Set((schema.fields ?? []).map(f => normalizeLabel(f.label ?? '')))
    let score = 0
    for (const k of requestedKeys) if (labels.has(k)) score++
    if (score > bestScore) {
      best = schema
      bestScore = score
    }
  }
  return best
}

async function runScenario(createServer, options) {
  const { server: httpServer, url } = await startStaticServer(FIXTURE_DIST)

  try {
    const warmup = await fetch(url)
    if (!warmup.ok) {
      throw new Error(`Fixture warmup failed: ${warmup.status}`)
    }

    console.log('Scenario: radix-fixture')
    console.log('Geometra MCP vs real @radix-ui/react-select eligibility form')
    console.log(`Browser mode: ${options.headless ? 'headless' : 'headed'}${options.slowMo > 0 ? `, slowMo=${options.slowMo} ms` : ''}`)
    console.log(`Fixture URL: ${url}`)
    console.log(`Fields: ${Object.keys(ELIGIBILITY_FIELDS).length} (all Radix Select Yes/No comboboxes sharing options)`)

    const mcpServer = createServer()
    const formSchema = getToolHandler(mcpServer, 'geometra_form_schema')
    const fillForm = getToolHandler(mcpServer, 'geometra_fill_form')
    const query = getToolHandler(mcpServer, 'geometra_query')
    const disconnect = getToolHandler(mcpServer, 'geometra_disconnect')
    let browserOpen = false

    let schemaStep, schemaPayload, targetForm
    let fillStep, fillPayload
    /** Per-eligibility-field ground-truth check via geometra_query. */
    const groundTruth = []
    try {
      schemaStep = await invokeTool(formSchema, 'geometra_form_schema', {
        pageUrl: url,
        port: 0,
        headless: options.headless,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        slowMo: options.slowMo > 0 ? options.slowMo : undefined,
        detail: 'terse',
      })
      schemaPayload = parseJsonOutput(schemaStep)
      browserOpen = true

      const schemas = collectSchemas(schemaPayload)
      console.log(`\nform_schema returned ${schemas.length} form(s):`)
      for (const s of schemas) {
        console.log(`  - id=${s.formId ?? '(none)'} fields=${s.fields?.length ?? 0}`)
      }
      targetForm = pickTargetForm(schemas, ELIGIBILITY_FIELDS)
      if (!targetForm) {
        throw new Error('No form schema contains the requested fields')
      }
      console.log(`Using formId=${targetForm.formId} (${targetForm.fields.length} fields)`)

      fillStep = await invokeTool(fillForm, 'geometra_fill_form', {
        formId: targetForm.formId,
        valuesByLabel: ELIGIBILITY_FIELDS,
        verifyFills: true,
        includeSteps: true,
        stopOnError: false,
        detail: 'terse',
      })
      fillPayload = parseJsonOutput(fillStep)

      // Ground truth: query each Radix combobox by label and read its
      // displayed picked value. The MCP's own per-step readback for choice
      // fields doesn't always carry the value, so a popup-confusion bug
      // would only surface here. The extractor's findCustomComboboxValueText
      // is supposed to pull the picked option out of the [data-radix-select-value]
      // sibling — that's the contract we're validating.
      for (const [label, expected] of Object.entries(ELIGIBILITY_FIELDS)) {
        const queryStep = await invokeTool(query, 'geometra_query', {
          role: 'combobox',
          name: label,
          maxResults: 4,
          detail: 'terse',
        })
        const queryPayload = parseJsonOutput(queryStep)
        const matches = Array.isArray(queryPayload?.matches) ? queryPayload.matches : []
        const observed = matches[0]
        groundTruth.push({
          label,
          expected,
          matchCount: queryPayload?.matchCount ?? 0,
          observed,
        })
      }
    } finally {
      if (browserOpen) {
        try {
          await disconnect({ closeBrowser: true })
        } catch {
          /* best-effort cleanup */
        }
      }
    }

    console.log('\n| Step | Input B | Output B | Total B | ~Tokens | ms |')
    console.log('|---|--:|--:|--:|--:|--:|')
    for (const step of [schemaStep, fillStep]) {
      console.log(
        `| ${step.step} | ${step.inputBytes} | ${step.outputBytes} | ${step.totalBytes} | ${step.approxTokens} | ${step.elapsedMs.toFixed(1)} |`,
      )
    }

    const totalBytes = schemaStep.totalBytes + fillStep.totalBytes
    console.log(`\nTotals: 2 turns, ${totalBytes} B (~${approxTokens(totalBytes)} tokens), ${(schemaStep.elapsedMs + fillStep.elapsedMs).toFixed(1)} ms`)

    const reportFields = targetForm?.fields ?? []
    console.log(`\nForm schema discovered ${reportFields.length} fields in the chosen form.`)
    console.log(`Fill request reported successCount=${fillPayload?.successCount ?? '?'} errorCount=${fillPayload?.errorCount ?? '?'} (requested=${Object.keys(ELIGIBILITY_FIELDS).length})`)

    console.log('\nGround truth (geometra_query against each eligibility field):')
    for (const gt of groundTruth) {
      const node = gt.observed
      const observedValue =
        node?.value ??
        node?.text ??
        node?.children?.[0]?.text ??
        node?.children?.[0]?.value ??
        '(no value field)'
      console.log(`  - ${gt.label}`)
      console.log(`      expected="${gt.expected}" matchCount=${gt.matchCount} observed=${JSON.stringify(observedValue)}`)
    }

    if (options.assert) {
      const failures = []
      const schemaLabels = new Set(reportFields.map(f => normalizeLabel(f.label ?? '')))
      for (const label of Object.keys(ELIGIBILITY_FIELDS)) {
        if (!schemaLabels.has(normalizeLabel(label))) {
          failures.push(`form_schema missing eligibility field: "${label}"`)
        }
      }
      const successCount = fillPayload?.successCount ?? 0
      const errorCount = fillPayload?.errorCount ?? 0
      const expectedSuccess = Object.keys(ELIGIBILITY_FIELDS).length
      if (successCount < expectedSuccess) {
        failures.push(`fill_form successCount=${successCount} (expected ${expectedSuccess}, errorCount=${errorCount})`)
      }
      // The actual contract: findCustomComboboxValueText must read the
      // picked value out of the [data-radix-select-value] sibling. Without
      // this fixture the assertion was only enforced against hand-coded
      // mocks, so a real-Radix DOM-shape change could silently break it.
      for (const gt of groundTruth) {
        if ((gt.matchCount ?? 0) === 0) {
          failures.push(`geometra_query found no combobox named "${gt.label}" after fill`)
          continue
        }
        const node = gt.observed
        const observedValue =
          node?.value ??
          node?.text ??
          node?.children?.[0]?.text ??
          node?.children?.[0]?.value
        if (typeof observedValue !== 'string') {
          failures.push(
            `combobox "${gt.label}" has no readable value after fill (expected "${gt.expected}"). ` +
            `Real Radix Select renders the picked value as a [data-radix-select-value] sibling — ` +
            `extractor.findCustomComboboxValueText is supposed to read it. If this assertion fires, ` +
            `Radix changed its DOM shape or the selector list in extractor.ts dropped support.`,
          )
          continue
        }
        if (normalizeLabel(observedValue) !== normalizeLabel(gt.expected)) {
          failures.push(
            `combobox "${gt.label}" landed wrong value: expected="${gt.expected}" actual="${observedValue}"`,
          )
        }
      }

      if (failures.length > 0) {
        throw new Error(`Radix fixture assertions failed:\n- ${failures.join('\n- ')}`)
      }
      console.log('\nAssertions passed.')
    }
  } finally {
    await new Promise((resolve, reject) => {
      httpServer.close(err => (err ? reject(err) : resolve()))
    })
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  await ensureFixtureBuilt()

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

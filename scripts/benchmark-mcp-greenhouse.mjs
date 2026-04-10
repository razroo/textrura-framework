#!/usr/bin/env node
/**
 * End-to-end smoke test for the Geometra MCP against a Greenhouse-style
 * application form built with REAL react-select (not a hand-coded mimic).
 *
 * What it exercises:
 *   - geometra_form_schema discovers all 16 fields including 4 react-select
 *     comboboxes that share Yes/No options (work auth, sponsorship, prior
 *     employment, accommodations) — exactly the v1.33.0 popup-scoping case.
 *   - geometra_fill_form (with verifyFills) fills every field via labels and
 *     reads them back. The 4 shared-option Yes/No fields are intentionally
 *     filled with a *mixed* pattern (Yes/No/No/Yes) so a popup-confusion bug
 *     would surface as a verification mismatch on at least one field.
 *
 * What it deliberately does NOT do:
 *   - Click submit. The fixture's onSubmit no-ops, but the test never tries.
 *   - Hit any external network. The fixture is a self-contained vite build
 *     served from dist/ via an inline static HTTP server (no CDN, no live
 *     Greenhouse posting). Local-only.
 *
 * Run from repo root:
 *   node scripts/benchmark-mcp-greenhouse.mjs
 *   node scripts/benchmark-mcp-greenhouse.mjs --assert
 *   node scripts/benchmark-mcp-greenhouse.mjs --headed --slow-mo 250
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
const FIXTURE_DIR = path.join(ROOT, 'demos', 'mcp-greenhouse-fixture')
const FIXTURE_DIST = path.join(FIXTURE_DIR, 'dist')

// The fields the MCP must discover and fill. Order matches the form's visual
// order. The four eligibility questions all share Yes/No options and are
// rendered with react-select's `menuPortalTarget={document.body}`, so each
// trigger has its own popup that lives outside its parent — the v1.33.0 case.
const TEXT_FIELDS = {
  'First name': 'Taylor',
  'Last name': 'Applicant',
  'Email': 'taylor.applicant@example.com',
  'Phone': '+1 415 555 0142',
  'LinkedIn URL': 'https://www.linkedin.com/in/taylor-applicant',
}

const ELIGIBILITY_FIELDS = {
  'Are you legally authorized to work in the country in which you are applying?': 'Yes',
  'Will you now or in the future require sponsorship for employment visa status?': 'No',
  'Have you previously worked for this company?': 'No',
  'Do you require any accommodations for the interview process?': 'Yes',
}

const ABOUT_FIELDS = {
  'Country': 'United States',
  'How did you hear about us?': 'Hacker News',
  'Cover letter':
    'Geometra approaches browser automation as a semantic systems problem, which is exactly the layer I want to push forward. Looking forward to the conversation.',
}

const TERMS_FIELDS = {
  'I have read and agree to the privacy policy and terms of use': true,
}

const ALL_FIELDS = {
  ...TEXT_FIELDS,
  ...ELIGIBILITY_FIELDS,
  ...ABOUT_FIELDS,
  ...TERMS_FIELDS,
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
  // Rebuild if dist/index.html is missing or older than App.tsx. Cheap to
  // re-check, avoids re-running vite on every benchmark invocation.
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
  console.log('Rebuilding mcp-greenhouse-fixture (vite)...')
  runBuild(
    '@geometra/demo-mcp-greenhouse-fixture',
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
  // Minimal static-from-directory server. Resolves URLs against rootDir,
  // refuses any path that escapes the root.
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

async function runScenario(createServer, options) {
  const { server: httpServer, url } = await startStaticServer(FIXTURE_DIST)

  try {
    const warmup = await fetch(url)
    if (!warmup.ok) {
      throw new Error(`Fixture warmup failed: ${warmup.status}`)
    }

    console.log('Scenario: greenhouse-fixture')
    console.log('Geometra MCP vs real react-select Greenhouse-style application form')
    console.log(`Browser mode: ${options.headless ? 'headless' : 'headed'}${options.slowMo > 0 ? `, slowMo=${options.slowMo} ms` : ''}`)
    console.log(`Fixture URL: ${url}`)
    console.log(`Fields: ${Object.keys(ALL_FIELDS).length} (4 of which are react-select Yes/No comboboxes sharing options)`)

    const mcpServer = createServer()
    const formSchema = getToolHandler(mcpServer, 'geometra_form_schema')
    const fillForm = getToolHandler(mcpServer, 'geometra_fill_form')
    const query = getToolHandler(mcpServer, 'geometra_query')
    const snapshot = getToolHandler(mcpServer, 'geometra_snapshot')
    const disconnect = getToolHandler(mcpServer, 'geometra_disconnect')
    let browserOpen = false

    let schemaStep, schemaPayload, targetForm
    let fillStep, fillPayload
    /** Per-eligibility-field ground-truth check via geometra_query. */
    let groundTruth = []
    try {
      // ── 1. Discovery: form_schema (auto-connects via pageUrl) ──────────
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

      // form_schema may return one or several FormSchemaModels (e.g. react-select
      // portal'd menus and the wrapping <form> may both be detected). Pick the
      // form that contains the most of our requested labels, and pass its
      // formId explicitly so fill_form's resolveTargetFormSchema is unambiguous.
      const schemas = collectSchemas(schemaPayload)
      console.log(`\nform_schema returned ${schemas.length} form(s):`)
      for (const s of schemas) {
        console.log(`  - id=${s.formId ?? '(none)'} fields=${s.fields?.length ?? 0}`)
      }
      targetForm = pickTargetForm(schemas, ALL_FIELDS)
      if (!targetForm) {
        throw new Error('No form schema contains the requested fields')
      }
      console.log(`Using formId=${targetForm.formId} (${targetForm.fields.length} fields)`)

      // ── 2. Fill: every field by label, with verification ───────────────
      fillStep = await invokeTool(fillForm, 'geometra_fill_form', {
        formId: targetForm.formId,
        valuesByLabel: ALL_FIELDS,
        verifyFills: true,
        includeSteps: true,
        stopOnError: false,
        detail: 'terse',
      })
      fillPayload = parseJsonOutput(fillStep)

      // ── 2.5. Force a fresh full snapshot AFTER fill_form completes, so
      // any queries below see the post-fill state of every combobox. The
      // proxy debounces snapshot emission and the MCP caches the a11y tree
      // by updateRevision; without an explicit refresh nudge, queries can
      // race the proxy's next snapshot tick.
      if (process.env.GREENHOUSE_DEBUG_PAYLOAD) {
        const fullSnapshot = await invokeTool(snapshot, 'geometra_snapshot', {
          view: 'full',
          detail: 'verbose',
        })
        const { writeFile } = await import('node:fs/promises')
        await writeFile('/tmp/greenhouse-snapshot-after-fill.json', fullSnapshot.outputText)
        console.log(`[debug] full a11y snapshot written to /tmp/greenhouse-snapshot-after-fill.json`)
      }

      // ── 3. Ground truth: query each eligibility combobox by name and
      // read its actual displayed value. fill_form's verifyFills doesn't
      // read back choice values (the readback only carries role/state),
      // so without this step we'd be trusting the MCP's own success report
      // for the v1.33.0 case. geometra_query returns the live a11y node,
      // and a correctly-filled react-select combobox surfaces its picked
      // option as either the node's `value` field or as the text of its
      // first child. We accept either.
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

    // ── 3. Report ──────────────────────────────────────────────────────
    console.log('\n| Step | Input B | Output B | Total B | ~Tokens | ms |')
    console.log('|---|--:|--:|--:|--:|--:|')
    for (const step of [schemaStep, fillStep]) {
      console.log(
        `| ${step.step} | ${step.inputBytes} | ${step.outputBytes} | ${step.totalBytes} | ${step.approxTokens} | ${step.elapsedMs.toFixed(1)} |`,
      )
    }

    const totalBytes = schemaStep.totalBytes + fillStep.totalBytes
    console.log(`\nTotals: 2 turns, ${totalBytes} B (~${approxTokens(totalBytes)} tokens), ${(schemaStep.elapsedMs + fillStep.elapsedMs).toFixed(1)} ms`)

    // Re-derive the chosen target form's fields from the schema for reporting.
    const reportFields = targetForm?.fields ?? []
    console.log(`\nForm schema discovered ${reportFields.length} fields in the chosen form.`)
    console.log(`Fill request reported successCount=${fillPayload?.successCount ?? '?'} errorCount=${fillPayload?.errorCount ?? '?'} (requested=${Object.keys(ALL_FIELDS).length})`)

    // Look for the verification array in any of the locations the MCP places it.
    const verification = findVerification(fillPayload)
    if (process.env.GREENHOUSE_DEBUG_PAYLOAD) {
      const dumpPath = '/tmp/greenhouse-fill-payload.json'
      const { writeFile } = await import('node:fs/promises')
      await writeFile(dumpPath, JSON.stringify(fillPayload, null, 2))
      console.log(`\n[debug] full fill_form payload written to ${dumpPath}`)
    }
    if (Array.isArray(verification)) {
      // Choice fields: the MCP's per-step readback doesn't include the
      // selected text (only role + state), so a "mismatch" here for a
      // choice field means "the readback shape doesn't carry the value",
      // not "the wrong value was picked." Separate the two cases.
      const textMismatches = verification.filter(v => v.kind !== 'choice' && v.match === false)
      const choiceMissingReadback = verification.filter(v => v.kind === 'choice' && v.actual === undefined)
      console.log(`Verification (per-step readback): ${verification.length} steps`)
      console.log(`  text/checkbox: ${verification.length - choiceMissingReadback.length - textMismatches.length} matched, ${textMismatches.length} mismatches`)
      console.log(`  choice fields: ${verification.length - textMismatches.length - choiceMissingReadback.length} matched, ${choiceMissingReadback.length} not value-checked by verifyFills (readback carries no value field)`)
      if (textMismatches.length > 0) {
        console.log('Text/checkbox mismatches:')
        for (const m of textMismatches) {
          console.log(`  - ${m.label}: expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`)
        }
      }
      // Surface step-level "wait: timed_out" or matchMethod issues for choice fields.
      const steps = Array.isArray(fillPayload?.steps) ? fillPayload.steps : []
      const timedOut = steps.filter(s => s?.wait === 'timed_out')
      const fuzzyMatches = steps.filter(s => s?.kind === 'choice' && s?.matchMethod && s.matchMethod !== 'label-exact')
      if (timedOut.length > 0) {
        console.log(`\nYellow flags (fill_form steps with wait=timed_out, MCP still reported ok):`)
        for (const s of timedOut) {
          console.log(`  - ${s.fieldLabel} (${s.kind}, choiceType=${s.choiceType ?? 'n/a'})`)
        }
      }
      if (fuzzyMatches.length > 0) {
        console.log(`\nYellow flags (choice fields matched by something other than label-exact):`)
        for (const s of fuzzyMatches) {
          console.log(`  - ${s.fieldLabel}: matchMethod=${s.matchMethod}`)
        }
      }
    } else {
      console.log('Verification: (no per-step readback found in fill response)')
    }

    // Ground-truth: live geometra_query results for each eligibility combobox.
    // This is the real v1.33.0 test — the MCP's own ok flag could lie if a
    // popup-confusion bug existed, but the live a11y node's value cannot.
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

    // ── 4. Optional asserts ────────────────────────────────────────────
    if (options.assert) {
      const failures = []
      // 4a. Schema must have found enough fields. The form has 16 logical
      // fields; allow some slack for how form_schema groups checkboxes etc.
      if (reportFields.length < 12) {
        failures.push(`form_schema only discovered ${reportFields.length} fields (expected at least 12)`)
      }
      // 4b. Each Yes/No combobox label must be present in the schema.
      const schemaLabels = new Set(reportFields.map(f => normalizeLabel(f.label ?? '')))
      for (const label of Object.keys(ELIGIBILITY_FIELDS)) {
        if (!schemaLabels.has(normalizeLabel(label))) {
          failures.push(`form_schema missing eligibility field: "${label}"`)
        }
      }
      // 4c. fill_form must report success for all requested fields.
      const successCount = fillPayload?.successCount ?? 0
      const errorCount = fillPayload?.errorCount ?? 0
      const expectedSuccess = Object.keys(ALL_FIELDS).length
      if (successCount < expectedSuccess) {
        failures.push(`fill_form successCount=${successCount} (expected ${expectedSuccess}, errorCount=${errorCount})`)
      }
      // 4d. Each eligibility field's fill_form step must report ok=true with
      // matchMethod=label-exact. A popup-confusion bug in the v1.33.0 case
      // would either fail the fill (ok=false) or fall back to a fuzzy match
      // method, both of which we treat as failures.
      const fillSteps = Array.isArray(fillPayload?.steps) ? fillPayload.steps : []
      for (const label of Object.keys(ELIGIBILITY_FIELDS)) {
        const step = fillSteps.find(s => normalizeLabel(s?.fieldLabel ?? '') === normalizeLabel(label))
        if (!step) {
          failures.push(`fill_form missing step for "${label}"`)
          continue
        }
        if (step.ok !== true) {
          failures.push(`fill_form step for "${label}" ok=${step.ok} (expected true)`)
        }
        if (step.matchMethod && step.matchMethod !== 'label-exact') {
          failures.push(`fill_form step for "${label}" matchMethod=${step.matchMethod} (expected label-exact)`)
        }
      }
      // 4e. Ground truth: every eligibility combobox must have its picked
      // value present in the live a11y tree post-fill. matchCount alone is
      // weak (the combobox always exists; the question is what it shows).
      // We require either:
      //   - the node has a `value` field equal to the expected option, OR
      //   - we can read the picked option from the node's child text.
      // The proxy extractor.ts now populates the value via the
      // findCustomComboboxValueText fallback for react-select, so a real
      // fill should always surface the value here.
      //
      // This is the actual v1.33.0 case test: a popup-confusion bug would
      // leave the trigger showing its placeholder, which means no value
      // here, which means a hard failure.
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
            `The MCP reported the fill as ok=true but the live a11y tree shows no picked option — ` +
            `this is the silent-fill bug the v1.33.0 popup-scoping fix is supposed to prevent. ` +
            `Run with GREENHOUSE_DEBUG_PAYLOAD=1 to dump the post-fill snapshot.`,
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
        throw new Error(`Greenhouse fixture assertions failed:\n- ${failures.join('\n- ')}`)
      }
      console.log('\nAssertions passed.')
    }
  } finally {
    await new Promise((resolve, reject) => {
      httpServer.close(err => (err ? reject(err) : resolve()))
    })
  }
}

function normalizeLabel(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function collectSchemas(payload) {
  // form_schema's payload shape varies: sometimes { formSchema: {...} } for a
  // single form, sometimes { formSchemas: [...] } for many. Normalize to a flat
  // array of FormSchemaModel objects.
  if (!payload || typeof payload !== 'object') return []
  if (Array.isArray(payload.formSchemas)) return payload.formSchemas
  if (Array.isArray(payload.forms)) return payload.forms
  if (payload.formSchema) return [payload.formSchema]
  if (Array.isArray(payload.fields)) return [{ formId: payload.formId, fields: payload.fields }]
  return []
}

function findVerification(payload) {
  // The MCP doesn't emit a separate verification array under verifyFills;
  // instead each entry in `steps[]` carries its own `readback` with the
  // post-fill value. Build a normalized array {label, expected, actual, match}
  // from the steps so the rest of the benchmark doesn't have to know.
  if (!payload || typeof payload !== 'object') return null
  const steps = Array.isArray(payload.steps) ? payload.steps : null
  if (!steps) return null
  const out = []
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue
    const label = step.fieldLabel ?? step.label ?? ''
    const expected = step.value
    const actual =
      step.readback?.value ??
      step.readback?.checked ??
      step.readback?.selected ??
      step.readback?.text
    const match = readbackMatches(expected, actual, step.readback)
    out.push({ label, expected, actual, match, kind: step.kind, ok: step.ok })
  }
  return out.length > 0 ? out : null
}

function readbackMatches(expected, actual, readback) {
  // Text fields: stringwise compare. Boolean checkboxes: compare via the
  // step's `checked` field. Choice fields: compare via either the readback
  // text or selected option. Tolerate trivial whitespace differences.
  if (typeof expected === 'boolean') {
    if (typeof actual === 'boolean') return expected === actual
    if (readback?.checked !== undefined) return expected === readback.checked
    return false
  }
  if (typeof expected === 'string' && typeof actual === 'string') {
    return normalizeLabel(expected) === normalizeLabel(actual) ||
      normalizeLabel(actual).includes(normalizeLabel(expected))
  }
  return expected === actual
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

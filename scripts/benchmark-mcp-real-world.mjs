#!/usr/bin/env node
/**
 * Run the real-world benchmark bundle:
 * - Local summary-first triage board benchmark
 * - Public Swag Labs checkout benchmark
 *
 * Run from repo root:
 *   node scripts/benchmark-mcp-real-world.mjs
 *   node scripts/benchmark-mcp-real-world.mjs --scenario triage
 *   node scripts/benchmark-mcp-real-world.mjs --scenario swaglabs --assert
 *   node scripts/benchmark-mcp-real-world.mjs --scenario swaglabs --prewarm
 *   node scripts/benchmark-mcp-real-world.mjs --scenario swaglabs --warm-reuse
 *   node scripts/benchmark-mcp-real-world.mjs --headed --slow-mo 250
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SCENARIOS = {
  triage: {
    id: 'triage',
    title: 'Incident triage board benchmark',
    script: path.join(ROOT, 'scripts', 'benchmark-mcp-triage-flow.mjs'),
  },
  swaglabs: {
    id: 'swaglabs',
    title: 'Public checkout benchmark',
    script: path.join(ROOT, 'scripts', 'benchmark-mcp-public-flow.mjs'),
  },
}

function parseArgs(argv) {
  let scenario = 'all'
  let headless = true
  let slowMo = 0
  let prewarm = false
  let warmReuse = false

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--scenario') {
      scenario = argv[index + 1] ?? ''
      index++
      continue
    }
    if (arg === '--all') {
      scenario = 'all'
      continue
    }
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
    scenario,
    assert: argv.includes('--assert'),
    headless,
    prewarm,
    slowMo,
    warmReuse,
  }
}

function selectedScenarios(scenario) {
  if (scenario === 'all') return Object.values(SCENARIOS)
  const selected = SCENARIOS[scenario]
  if (!selected) {
    throw new Error(`Unknown scenario "${scenario}". Available scenarios: ${Object.keys(SCENARIOS).join(', ')}, all`)
  }
  return [selected]
}

function forwardedArgs(args) {
  const forwarded = []
  if (args.assert) forwarded.push('--assert')
  if (!args.headless) forwarded.push('--headed')
  if (args.slowMo > 0) forwarded.push('--slow-mo', String(args.slowMo))
  if (args.prewarm) forwarded.push('--prewarm')
  if (args.warmReuse) forwarded.push('--warm-reuse')
  return forwarded
}

function runScenario(scenario, args) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`Real-world benchmark: ${scenario.id}`)
  console.log(scenario.title)
  console.log(`${'='.repeat(80)}\n`)

  const result = spawnSync('node', [scenario.script, ...forwardedArgs(args)], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`Scenario "${scenario.id}" failed.`)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const scenarios = selectedScenarios(args.scenario)

  for (const scenario of scenarios) {
    runScenario(scenario, args)
  }
}

main()

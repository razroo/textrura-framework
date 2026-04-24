#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCENARIO_FILE = path.join(ROOT, 'benchmarks', 'agent-native-scenarios.json')
const REQUIRED_MODES = [
  'geometra-native',
  'geometra-mcp',
  'playwright-mcp',
  'vision-computer-use',
]
const REQUIRED_NUMERIC_FIELDS = [
  'contextBytes',
  'toolCalls',
  'medianLatencyMs',
  'successRate',
  'humanApprovals',
  'securityFailures',
  'postconditionChecks',
]

function approxTokens(bytes) {
  return Math.round(bytes / 4)
}

function pct(value) {
  return `${Math.round(value * 100)}%`
}

function ratio(smaller, larger) {
  if (larger === 0) return 'n/a'
  return `${Math.round((1 - smaller / larger) * 100)}%`
}

function assertFiniteMetric(failures, scenario, mode, metric, value) {
  if (!Number.isFinite(value) || value < 0) {
    failures.push(`${scenario.id}/${mode}.${metric} must be a non-negative finite number`)
  }
}

function validateScenarioShape(data) {
  const failures = []
  if (!data || typeof data !== 'object') {
    return ['scenario file must contain an object']
  }
  if (!Array.isArray(data.scenarios) || data.scenarios.length === 0) {
    return ['scenario file must contain a non-empty scenarios array']
  }

  for (const scenario of data.scenarios) {
    if (!scenario || typeof scenario !== 'object') {
      failures.push('each scenario must be an object')
      continue
    }
    if (typeof scenario.id !== 'string' || scenario.id.length === 0) {
      failures.push('each scenario must have a non-empty id')
    }
    if (!scenario.modes || typeof scenario.modes !== 'object') {
      failures.push(`${scenario.id ?? '<unknown>'} must define modes`)
      continue
    }

    for (const mode of REQUIRED_MODES) {
      const metrics = scenario.modes[mode]
      if (!metrics || typeof metrics !== 'object') {
        failures.push(`${scenario.id} missing mode ${mode}`)
        continue
      }
      for (const metric of REQUIRED_NUMERIC_FIELDS) {
        assertFiniteMetric(failures, scenario, mode, metric, metrics[metric])
      }
      if (metrics.successRate < 0 || metrics.successRate > 1) {
        failures.push(`${scenario.id}/${mode}.successRate must be between 0 and 1`)
      }
      if (typeof metrics.replayable !== 'boolean') {
        failures.push(`${scenario.id}/${mode}.replayable must be boolean`)
      }
    }
  }

  return failures
}

function assertNativeAdvantage(data) {
  const failures = []
  for (const scenario of data.scenarios) {
    const native = scenario.modes['geometra-native']
    for (const mode of REQUIRED_MODES.filter(value => value !== 'geometra-native')) {
      const baseline = scenario.modes[mode]
      if (native.contextBytes > baseline.contextBytes) {
        failures.push(`${scenario.id}: native contextBytes exceeds ${mode}`)
      }
      if (native.toolCalls > baseline.toolCalls) {
        failures.push(`${scenario.id}: native toolCalls exceeds ${mode}`)
      }
      if (native.successRate < baseline.successRate) {
        failures.push(`${scenario.id}: native successRate is lower than ${mode}`)
      }
    }
    if (native.securityFailures !== 0) {
      failures.push(`${scenario.id}: native securityFailures must stay at 0`)
    }
    if (native.replayable !== true) {
      failures.push(`${scenario.id}: native mode must be replayable`)
    }
    if (native.postconditionChecks < 1) {
      failures.push(`${scenario.id}: native mode must include postcondition checks`)
    }
  }
  return failures
}

function modeRows(scenario) {
  return REQUIRED_MODES.map(mode => {
    const metrics = scenario.modes[mode]
    return [
      scenario.id,
      mode,
      String(metrics.contextBytes),
      String(approxTokens(metrics.contextBytes)),
      String(metrics.toolCalls),
      String(metrics.medianLatencyMs),
      pct(metrics.successRate),
      String(metrics.humanApprovals),
      String(metrics.securityFailures),
      metrics.replayable ? 'yes' : 'no',
      String(metrics.postconditionChecks),
    ]
  })
}

function printTable(data) {
  const rows = data.scenarios.flatMap(modeRows)
  console.log('| Scenario | Mode | Context bytes | Approx tokens | Tool calls | Median latency ms | Success | Approvals | Security failures | Replay | Postconditions |')
  console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |')
  for (const row of rows) {
    console.log(`| ${row.join(' | ')} |`)
  }
}

function printSummary(data) {
  console.log('\n## Native Advantage')
  for (const scenario of data.scenarios) {
    const native = scenario.modes['geometra-native']
    const baselines = REQUIRED_MODES
      .filter(mode => mode !== 'geometra-native')
      .map(mode => scenario.modes[mode])
    const bestContextBaseline = Math.min(...baselines.map(metrics => metrics.contextBytes))
    const bestToolBaseline = Math.min(...baselines.map(metrics => metrics.toolCalls))
    console.log(
      `- ${scenario.id}: ${ratio(native.contextBytes, bestContextBaseline)} fewer context bytes and ${ratio(native.toolCalls, bestToolBaseline)} fewer tool calls than the best non-native baseline.`,
    )
  }
}

async function main() {
  const assertMode = process.argv.includes('--assert')
  const data = JSON.parse(await readFile(SCENARIO_FILE, 'utf8'))
  const shapeFailures = validateScenarioShape(data)
  if (shapeFailures.length > 0) {
    throw new Error(`Invalid agent-native benchmark scenarios:\n- ${shapeFailures.join('\n- ')}`)
  }

  printTable(data)
  printSummary(data)

  if (assertMode) {
    const advantageFailures = assertNativeAdvantage(data)
    if (advantageFailures.length > 0) {
      throw new Error(`Agent-native advantage assertions failed:\n- ${advantageFailures.join('\n- ')}`)
    }
    console.log('\nAgent-native benchmark assertions passed')
  }
}

main().catch(err => {
  console.error(String(err?.message ?? err))
  process.exit(1)
})

#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultReplay = path.join(ROOT, 'examples', 'replays', 'claims-review.json')
const replayPath = path.resolve(process.cwd(), process.argv[2] ?? defaultReplay)

function summarizeAction(action) {
  return {
    actionId: action.actionId,
    status: action.status,
    requestedAt: action.requestedAt,
    completedAt: action.completedAt,
    beforeFrame: action.frameBefore?.id ?? null,
    afterFrame: action.frameAfter?.id ?? null,
    target: action.frameBefore?.geometry.actions.find(item => item.id === action.actionId)?.bounds ?? null,
    approval: action.approval ?? null,
    output: action.output ?? null,
  }
}

function printReplay(replay) {
  console.log(`# Replay ${replay.sessionId}`)
  console.log(`Started: ${replay.startedAt}`)
  console.log(`Frames: ${replay.frames.length}`)
  console.log(`Actions: ${replay.actions.length}`)
  console.log(`Trace events: ${replay.trace.events.length}`)
  console.log('')
  for (const action of replay.actions) {
    const summary = summarizeAction(action)
    console.log(`## ${summary.actionId} (${summary.status})`)
    console.log(`- before: ${summary.beforeFrame}`)
    console.log(`- after: ${summary.afterFrame}`)
    if (summary.target) {
      console.log(`- target bounds: ${summary.target.x},${summary.target.y},${summary.target.width}x${summary.target.height}`)
    }
    if (summary.approval) {
      console.log(`- approval: ${summary.approval.approved ? 'approved' : 'denied'} by ${summary.approval.actor ?? 'unknown'}`)
    }
    if (summary.output) {
      console.log(`- output: ${JSON.stringify(summary.output)}`)
    }
    console.log('')
  }
}

async function main() {
  const replay = JSON.parse(await readFile(replayPath, 'utf8'))
  printReplay(replay)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

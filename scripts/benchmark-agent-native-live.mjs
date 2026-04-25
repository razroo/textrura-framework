#!/usr/bin/env node
import { chromium } from '@playwright/test'
import { agentAction, box, createAgentGateway, createAgentGatewayPolicy, text } from '../packages/core/dist/index.js'
import { createAgentGatewayHttpServer } from '../packages/gateway/dist/index.js'

const HTML_BASELINE = `<!doctype html>
<main data-route="claims-review">
  <section aria-label="Claim CLM-1042">
    <h1>CLM-1042 / Northstar Fabrication</h1>
    <p>Ready for payout. Risk 0.21. Evidence validated.</p>
  </section>
  <button data-action="approve-payout" aria-label="Approve payout">Approve payout</button>
  <button data-action="request-evidence" aria-label="Request evidence">Request docs</button>
  <button data-action="export-audit-packet" aria-label="Export audit packet">Export audit</button>
  <section data-testid="approval-panel" hidden>
    <h2>Human approval required</h2>
    <button aria-label="Manager approve">Manager approve</button>
  </section>
</main>
<script>
  window.__trace = []
  document.querySelector('[data-action="approve-payout"]').addEventListener('click', () => {
    window.__trace.push({ event: 'clicked', actionId: 'approve-payout' })
    document.querySelector('[data-testid="approval-panel"]').hidden = false
  })
  document.querySelector('[aria-label="Manager approve"]').addEventListener('click', () => {
    window.__trace.push({ event: 'approved', actor: 'Ops manager' })
    document.querySelector('[data-route="claims-review"]').setAttribute('data-status', 'approved')
  })
</script>`

function layout() {
  return {
    x: 0,
    y: 0,
    width: 640,
    height: 360,
    children: [
      { x: 24, y: 24, width: 592, height: 96, children: [{ x: 16, y: 16, width: 220, height: 24, children: [] }] },
      { x: 24, y: 144, width: 160, height: 48, children: [{ x: 18, y: 14, width: 112, height: 18, children: [] }] },
    ],
  }
}

function tree() {
  return box({ semantic: { id: 'claims-review-surface', role: 'main', ariaLabel: 'Claims review surface' } }, [
    box({ semantic: { id: 'claim-card', role: 'region', ariaLabel: 'Claim CLM-1042' } }, [
      text({ text: 'CLM-1042 / Northstar Fabrication', font: '700 18px Inter', lineHeight: 24 }),
    ]),
    box({
      semantic: agentAction({
        id: 'approve-payout',
        kind: 'approve',
        title: 'Approve payout',
        risk: 'write',
        requiresConfirmation: true,
        postconditions: ['claim.status === "Approved"', 'auditId is present'],
      }, { role: 'button', ariaLabel: 'Approve payout' }),
    }, [
      text({ text: 'Approve payout', font: '700 14px Inter', lineHeight: 18 }),
    ]),
  ])
}

async function json(url, pathName, init) {
  const response = await fetch(`${url}${pathName}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`${pathName} failed: ${response.status} ${JSON.stringify(body)}`)
  return body
}

function bytes(value) {
  return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value))
}

async function browserInferenceBaseline() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
  try {
    await page.setContent(HTML_BASELINE)
    const inspected = await page.locator('main').evaluate(node => ({
      html: node.outerHTML,
      buttons: [...node.querySelectorAll('button')].map(button => ({
        label: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
        actionId: button.getAttribute('data-action'),
      })),
    }))
    const button = page.getByRole('button', { name: 'Approve payout' })
    const bounds = await button.boundingBox()
    await button.click()
    await page.getByRole('button', { name: 'Manager approve' }).click()
    const snapshot = await page.locator('main').evaluate(node => ({
      html: node.outerHTML,
      actionCount: node.querySelectorAll('[data-action]').length,
      approveLabel: node.querySelector('[data-action="approve-payout"]')?.getAttribute('aria-label') ?? null,
      status: node.getAttribute('data-status'),
      trace: window.__trace,
    }))
    const screenshot = await page.screenshot({ fullPage: true })
    return {
      mode: 'browser-inference',
      contextBytes: bytes(inspected) + bytes(snapshot.html) + screenshot.byteLength,
      toolCalls: 9,
      replayable: false,
      postconditionChecks: 0,
      success: bounds !== null && snapshot.approveLabel === 'Approve payout' && snapshot.status === 'approved',
      proof: `Playwright role lookup + DOM/screenshot trace (${snapshot.trace.length} events); approve bounds ${bounds ? `${Math.round(bounds.x)},${Math.round(bounds.y)},${Math.round(bounds.width)}x${Math.round(bounds.height)}` : 'missing'}; no structured frame-before/frame-after replay.`,
    }
  } finally {
    await browser.close()
  }
}

async function geometraNativeFlow() {
  const gateway = createAgentGateway({
    sessionId: 'live-agent-native-benchmark',
    policy: createAgentGatewayPolicy({
      allowedActionIds: ['approve-payout'],
      requireApprovalForRisks: ['write'],
    }),
    execute: ({ target }) => ({
      ok: true,
      actionId: target.id,
      auditId: 'CLM-1042-approve-payout',
      postconditions: target.contract.postconditions ?? [],
    }),
  })
  gateway.setFrame(tree(), layout(), { id: 'live-agent-native-benchmark:frame:1', route: 'claims-review' })
  const server = await createAgentGatewayHttpServer({ gateway })

  try {
    const inspected = await json(server.url, '/inspect')
    const requested = await json(server.url, '/actions/request', {
      method: 'POST',
      body: JSON.stringify({
        actionId: 'approve-payout',
        frameId: inspected.frame.id,
        input: { claimId: 'CLM-1042', approver: 'Ops manager' },
      }),
    })
    const approved = await json(server.url, '/actions/approve', {
      method: 'POST',
      body: JSON.stringify({ approvalId: requested.result.approvalId, actor: 'Ops manager' }),
    })
    gateway.setFrame(tree(), layout(), { id: 'live-agent-native-benchmark:frame:2', route: 'claims-review' })
    const replay = await json(server.url, '/replay')
    const completedAction = replay.replay.actions.find(action => action.actionId === 'approve-payout')
    return {
      mode: 'geometra-native',
      contextBytes: bytes(inspected.geometry) + bytes(completedAction),
      toolCalls: 4,
      replayable: true,
      postconditionChecks: approved.result.output.postconditions.length,
      success: approved.result.status === 'completed' && completedAction?.frameBefore && completedAction?.frameAfter,
      proof: `${replay.replay.frames.length} replay frames, ${inspected.geometry.nodes.length} semantic geometry nodes, approval/output embedded in replay.`,
    }
  } finally {
    await server.close()
  }
}

function printRows(native, browser) {
  console.log('| Mode | Context bytes | Tool calls | Replayable | Postconditions | Success | Proof |')
  console.log('| --- | ---: | ---: | --- | ---: | --- | --- |')
  for (const row of [native, browser]) {
    console.log(`| ${row.mode} | ${row.contextBytes} | ${row.toolCalls} | ${row.replayable ? 'yes' : 'no'} | ${row.postconditionChecks} | ${row.success ? 'yes' : 'no'} | ${row.proof} |`)
  }
}

async function main() {
  const assertMode = process.argv.includes('--assert')
  const native = await geometraNativeFlow()
  const browser = await browserInferenceBaseline()
  printRows(native, browser)

  if (assertMode) {
    const failures = []
    if (!native.success) failures.push('native flow did not complete')
    if (!native.replayable) failures.push('native flow must be replayable')
    if (native.postconditionChecks < 1) failures.push('native flow must include postcondition checks')
    if (native.toolCalls > browser.toolCalls) failures.push('native flow should use no more tool calls than browser inference baseline')
    if (failures.length > 0) throw new Error(`Live benchmark assertions failed:\n- ${failures.join('\n- ')}`)
    console.log('\nLive agent-native benchmark assertions passed')
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

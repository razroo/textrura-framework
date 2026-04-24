#!/usr/bin/env node
/**
 * Minimal test of the blur-revert hypothesis.
 *
 * Hypothesis: dismissAndReVerifySelection's blur of the active element
 * causes Greenhouse react-select to revert the commit. Test by clicking an
 * option, verifying the commit landed, then blurring and re-verifying.
 */
import { chromium } from 'playwright'

const TARGET_URL = 'https://job-boards.greenhouse.io/anthropic/jobs/5062712008'
const FIELD_LABEL = 'AI Policy for Application'

function ts() { return new Date().toISOString().split('T')[1].replace('Z', '') }
function log(label, payload) {
  if (payload === undefined) console.log(`[${ts()}] ${label}`)
  else console.log(`[${ts()}] ${label}: ${JSON.stringify(payload, null, 2)}`)
}

async function readField(page, label) {
  return page.evaluate((label) => {
    let target = null
    const labels = document.querySelectorAll('label')
    for (const lbl of labels) {
      if (lbl.textContent?.includes(label)) {
        const forId = lbl.getAttribute('for')
        if (forId) target = document.getElementById(forId)
        break
      }
    }
    if (!target) return { error: 'no field' }

    let field = target
    for (let i = 0; i < 8 && field.parentElement; i++) field = field.parentElement
    const sv = field.querySelector('[class*="single-value" i], [class*="singleValue" i]')
    const ph = field.querySelector('[class*="placeholder" i]')
    return {
      singleValueText: sv?.textContent?.trim() ?? null,
      singleValueVisible: sv ? (() => { const r = sv.getBoundingClientRect(); return r.width > 0 && r.height > 0 })() : null,
      placeholderText: ph?.textContent?.trim() ?? null,
      placeholderVisible: ph ? (() => { const r = ph.getBoundingClientRect(); return r.width > 0 && r.height > 0 })() : null,
      ariaInvalid: target.getAttribute('aria-invalid'),
      ariaExpanded: target.getAttribute('aria-expanded'),
      activeElementId: document.activeElement?.id ?? null,
      activeElementTag: document.activeElement?.tagName ?? null,
    }
  }, label)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000) // Let the SPA hydrate
    // Debug: dump combobox count and any AI Policy text
    const debug = await page.evaluate(() => {
      const combos = document.querySelectorAll('[role="combobox"]')
      const labels = document.querySelectorAll('label')
      const aiPolicyLabels = []
      for (const lbl of labels) {
        if (lbl.textContent?.includes('AI Policy')) {
          aiPolicyLabels.push({
            id: lbl.id,
            forAttr: lbl.getAttribute('for'),
            text: lbl.textContent.trim().slice(0, 80),
          })
        }
      }
      return { comboCount: combos.length, labelCount: labels.length, aiPolicyLabels }
    })
    log('page debug', debug)

    // Find the trigger id
    const triggerId = await page.evaluate((label) => {
      const labels = document.querySelectorAll('label')
      for (const lbl of labels) {
        if (lbl.textContent?.includes(label)) {
          return lbl.getAttribute('for')
        }
      }
      return null
    }, FIELD_LABEL)
    log('trigger id', triggerId)

    log('initial state', await readField(page, FIELD_LABEL))

    // Open dropdown
    log('opening dropdown')
    const trigger = page.locator(`#${triggerId}`)
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
    await page.waitForTimeout(300)

    log('after open', await readField(page, FIELD_LABEL))

    // Click "Yes" option — must be inside the AI Policy listbox, not the
    // always-rendered country picker. Greenhouse's react-select listbox
    // is rendered into the document but only the AI Policy one is open.
    // Match an option whose text is exactly "Yes" and that's currently
    // visible (width/height > 0).
    log('clicking Yes option')
    const yesOption = page.locator('div[role="option"]', { hasText: /^Yes$/ }).first()
    await yesOption.click()

    // CRUCIAL: capture state IMMEDIATELY after click, before any blur.
    log('IMMEDIATELY after click (no delay)', await readField(page, FIELD_LABEL))

    await page.waitForTimeout(50)
    log('after click + 50ms', await readField(page, FIELD_LABEL))

    // Now reproduce the proxy's blur step
    log('--- BLURRING ACTIVE ELEMENT (proxy step) ---')
    await page.evaluate(() => {
      const active = document.activeElement
      const tag = active?.tagName
      const id = active?.id
      console.log('blurring', tag, id)
      if (active && active instanceof HTMLElement && typeof active.blur === 'function') {
        active.blur()
      }
    })

    log('immediately after blur', await readField(page, FIELD_LABEL))
    await page.waitForTimeout(50)
    log('after blur + 50ms', await readField(page, FIELD_LABEL))
    await page.waitForTimeout(450)
    log('after blur + 500ms', await readField(page, FIELD_LABEL))

    // ===== CRITICAL: TYPE-THEN-CLICK (proxy editable-combobox flow) =====
    log('--- TYPE QUERY INTO INPUT THEN CLICK (proxy editable flow) ---')
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const triggerIdT = await page.evaluate((label) => {
      const labels = document.querySelectorAll('label')
      for (const lbl of labels) if (lbl.textContent?.includes(label)) return lbl.getAttribute('for')
      return null
    }, FIELD_LABEL)
    log('trigger id (type test)', triggerIdT)
    const triggerT = page.locator(`#${triggerIdT}`)
    await triggerT.scrollIntoViewIfNeeded()

    // Open dropdown by clicking
    await triggerT.click()
    await page.waitForTimeout(200)
    log('after open (type test)', await readField(page, FIELD_LABEL))

    // Type the query "Yes" into the input — this is what
    // typeIntoEditableLocator does when the trigger is detected as editable
    log('typing "Yes" into input')
    await triggerT.fill('Yes')
    await page.waitForTimeout(200)
    log('after typing Yes', await readField(page, FIELD_LABEL))

    // Now click the option
    log('clicking Yes option')
    const yesOptionT = page.locator('div[role="option"]', { hasText: /^Yes$/ }).first()
    await yesOptionT.click()
    await page.waitForTimeout(50)
    log('after option click', await readField(page, FIELD_LABEL))

    // Now blur
    log('blurring')
    await page.evaluate(() => {
      const active = document.activeElement
      if (active instanceof HTMLElement) active.blur()
    })
    await page.waitForTimeout(50)
    log('after blur (type test)', await readField(page, FIELD_LABEL))
    await page.waitForTimeout(500)
    log('after blur + 500ms (type test)', await readField(page, FIELD_LABEL))

  } finally {
    await browser.close()
  }
}

main().catch(err => { console.error('FATAL', err); process.exit(1) })

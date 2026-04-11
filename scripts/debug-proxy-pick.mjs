#!/usr/bin/env node
/**
 * Test the actual proxy pickListboxOption code path against the Anthropic
 * AI Policy listbox. Bypasses MCP entirely — imports the compiled proxy
 * dom-actions module directly and runs it.
 *
 * This isolates whether the bug is in pickListboxOption itself, or in some
 * MCP-layer interaction (caching, batched fills, etc.).
 */
import { chromium } from 'playwright'
import { pickListboxOption, fillFields, setFieldText, createFillLookupCache } from '../packages/proxy/dist/dom-actions.js'

const TARGET_URL = 'https://job-boards.greenhouse.io/anthropic/jobs/5062712008'
const FIELD_LABEL = 'AI Policy for Application'
const TARGET_OPTION = 'Yes'

function ts() { return new Date().toISOString().split('T')[1].replace('Z', '') }
function log(...a) { console.log(`[${ts()}]`, ...a) }

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
    const sv = field.querySelector('[class*="single-value" i]')
    const ph = field.querySelector('[class*="placeholder" i]')
    return {
      singleValueText: sv?.textContent?.trim() ?? null,
      placeholderText: ph?.textContent?.trim() ?? null,
      ariaInvalid: target.getAttribute('aria-invalid'),
      inputValue: target.value,
    }
  }, label)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500) // SPA hydrate

    log('initial state:', await readField(page, FIELD_LABEL))

    log('calling pickListboxOption() from proxy...')
    let pickError = null
    try {
      await pickListboxOption(page, TARGET_OPTION, {
        fieldLabel: FIELD_LABEL,
        exact: false,
      })
    } catch (e) {
      pickError = e
    }

    log('pickListboxOption returned. error:', pickError?.message?.slice(0, 500) ?? null)
    log('field state after pickListboxOption:', await readField(page, FIELD_LABEL))

    // Wait a bit and re-check
    await page.waitForTimeout(500)
    log('field state after +500ms:', await readField(page, FIELD_LABEL))

    // ===== MULTI-FIELD TEST: reproduce fill_form behavior =====
    log('=== MULTI-FIELD: reload + fillFields ===')
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)

    // Mimic the exact 17-field fill_form payload that fails in the MCP run.
    const fields = [
      { kind: 'text', fieldLabel: 'First Name', value: 'Charlie' },
      { kind: 'text', fieldLabel: 'Last Name', value: 'Greenman' },
      { kind: 'text', fieldLabel: 'Email', value: 'charlie.greenman1@gmail.com' },
      { kind: 'text', fieldLabel: 'Phone', value: '+1 929-608-1737' },
      { kind: 'choice', fieldLabel: 'Country', value: 'United States' },
      { kind: 'text', fieldLabel: 'Website', value: 'https://blog.razroo.com' },
      { kind: 'choice', fieldLabel: 'Are you open to working in-person in one of our offices 25% of the time?', value: 'Yes' },
      { kind: 'text', fieldLabel: 'When is the earliest you would want to start working with us?', value: 'Within 4 weeks' },
      { kind: 'text', fieldLabel: 'Why Anthropic?', value: 'I have spent the past years building production AI systems on Claude and want to bring that pattern to Beneficial Deployments.' },
      { kind: 'choice', fieldLabel: 'Do you require visa sponsorship?', value: 'No' },
      { kind: 'choice', fieldLabel: 'Will you now or will you in the future require employment visa sponsorship', value: 'No' },
      { kind: 'text', fieldLabel: 'Additional Information', value: 'Strong fit, founder/builder with enterprise delivery and production AI experience.' },
      { kind: 'text', fieldLabel: 'LinkedIn Profile', value: 'https://linkedin.com/in/charliegreenman' },
      { kind: 'choice', fieldLabel: 'Are you open to relocation for this role?', value: 'Yes' },
      { kind: 'text', fieldLabel: 'What is the address from which you plan on working', value: 'Austin, Texas' },
      { kind: 'choice', fieldLabel: 'Have you ever interviewed at Anthropic before?', value: 'No' },
      { kind: 'choice', fieldLabel: 'AI Policy for Application', value: 'Yes' },
    ]

    log('calling fillFields with 17 fields...')
    let multiError = null
    try {
      await fillFields(page, fields)
    } catch (e) {
      multiError = e
    }
    log('fillFields done. error:', multiError?.message?.slice(0, 500) ?? null)

    // Read all the listbox states after fillFields
    const labelsToCheck = [
      'AI Policy for Application',
      'Will you now or will you in the future require employment visa sponsorship',
      'Do you require visa sponsorship?',
      'Are you open to working in-person in one of our offices 25% of the time?',
      'Are you open to relocation for this role?',
      'Have you ever interviewed at Anthropic before?',
      'Country',
    ]
    log('=== POST-fillFields LISTBOX STATES ===')
    for (const lbl of labelsToCheck) {
      const state = await readField(page, lbl)
      log(`  ${lbl}:`, state)
    }

    // ===== TEST 3: TRUNCATED LABELS (mimics MCP plan output) =====
    log('=== TEST: TRUNCATED LABELS WITH ELLIPSIS ===')
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)

    // These are the EXACT labels MCP's geometra_form_schema returns —
    // truncated to ~80 chars with the unicode ellipsis "\u2026"
    const truncatedFields = [
      { kind: 'choice', fieldLabel: 'AI Policy for Application', value: 'Yes' },
      { kind: 'choice', fieldLabel: 'Will you now or will you in the future require employment visa sponsorship to w\u2026', value: 'No' },
      { kind: 'text', fieldLabel: 'What is the address from which you plan on working? If you would need to reloca\u2026', value: 'Austin, Texas' },
    ]
    log('calling fillFields with truncated labels...')
    let truncError = null
    try {
      await fillFields(page, truncatedFields)
    } catch (e) {
      truncError = e
    }
    log('truncated fillFields done. error:', truncError?.message?.slice(0, 500) ?? null)

    log('=== POST-truncated FIELD STATES ===')
    for (const lbl of [
      'AI Policy for Application',
      'Will you now or will you in the future require employment visa sponsorship',
      'What is the address from which you plan on working',
    ]) {
      const state = await readField(page, lbl)
      log(`  ${lbl}:`, state)
    }
  } finally {
    await browser.close()
  }
}

main().catch(err => { console.error('FATAL', err); process.exit(1) })

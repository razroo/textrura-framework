#!/usr/bin/env node
/**
 * Standalone Greenhouse listbox commit debugger.
 *
 * Why this exists: pickListboxOption silently "succeeds" on certain Greenhouse
 * react-select listboxes (Anthropic's AI Policy field, the second visa
 * sponsorship question, etc.) — fill_form returns successCount=N with
 * invalidCount=0, but the trigger stays at the "Select..." placeholder and
 * Submit eventually bounces with "This field is required". v1.38.0 added an
 * aria-invalid veto and v1.39.0 added a placeholder-stays veto, but Greenhouse
 * passes both checks because:
 *   - aria-invalid is never set until the form library finally validates on
 *     Submit click
 *   - the placeholder element is gone briefly between option click and the
 *     library re-rendering it
 *
 * This script bypasses MCP entirely. It uses Playwright directly, navigates
 * to a real Anthropic posting, installs a window-level event recorder before
 * any clicks, then reproduces the AI Policy fill end-to-end and dumps:
 *
 *   1. The listbox trigger's outerHTML before the click
 *   2. The popup HTML after opening the dropdown
 *   3. Every DOM event that fired during the option click (mousedown,
 *      mouseup, click, change, input, focus, blur, keydown, keyup)
 *   4. The trigger's displayed value at +0 / +50 / +200 / +500 / +1500 ms
 *      after the click — with both .placeholder and .single-value text
 *   5. The trigger's aria-invalid + aria-expanded + aria-activedescendant at
 *      each timestamp
 *   6. Whether the option element still exists in the DOM after the click
 *      (some libraries unmount the menu before React processes the click)
 *
 * Run: node scripts/debug-greenhouse-listbox.mjs
 *
 * Output goes to stdout in a structured way the agent can read back.
 */
import { chromium } from 'playwright'

const TARGET_URL = 'https://job-boards.greenhouse.io/anthropic/jobs/5062712008'

const FIELD_LABEL = 'AI Policy for Application'
const TARGET_OPTION = 'Yes'

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function ts() {
  return new Date().toISOString().split('T')[1]?.replace('Z', '') ?? ''
}

function log(label, payload) {
  if (payload === undefined) {
    console.log(`[${ts()}] ${label}`)
  } else {
    console.log(`[${ts()}] ${label}: ${JSON.stringify(payload, null, 2)}`)
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()

    log('navigating', TARGET_URL)
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    // Greenhouse renders the form via a small SPA shell. Wait for the
    // "Apply for this job" form region to be present before doing anything.
    await page.waitForSelector('form', { timeout: 15_000 })
    log('form present')

    // ---------------------------------------------------------------------
    // 1. Find the AI Policy combobox trigger and dump its outerHTML.
    // ---------------------------------------------------------------------
    const trigger = await page.evaluateHandle((label) => {
      // Greenhouse pairs labels with comboboxes via aria-labelledby or via a
      // wrapping <label> + sibling input. Walk a few common patterns.
      const allComboboxes = document.querySelectorAll('[role="combobox"]')
      for (const cb of allComboboxes) {
        // Read aria-labelledby reference
        const labelledBy = cb.getAttribute('aria-labelledby')
        if (labelledBy) {
          for (const id of labelledBy.split(/\s+/)) {
            const labelEl = document.getElementById(id)
            if (labelEl?.textContent?.includes(label)) return cb
          }
        }
        // Walk up to the closest field container and look for matching label text
        let cursor = cb
        for (let depth = 0; depth < 6 && cursor; depth++) {
          const labelEl = cursor.querySelector?.('label')
          if (labelEl?.textContent?.includes(label)) return cb
          cursor = cursor.parentElement
        }
      }
      return null
    }, FIELD_LABEL)

    const triggerEl = trigger.asElement()
    if (!triggerEl) {
      log('ERROR', `could not find combobox for label "${FIELD_LABEL}"`)
      return
    }

    // Capture the trigger's stable id so we can re-resolve it after detaches.
    const triggerId = await triggerEl.evaluate(el => el.id || null)
    log('TRIGGER_ID', triggerId)

    // A re-resolver: react-select replaces the input element on each interaction
    // so element handles go stale. Re-find the input by id every time we need
    // to inspect or click it.
    const findFreshTrigger = async () => {
      if (!triggerId) return null
      // Avoid using browser CSS.escape — we're in Node here. The trigger id
      // for Greenhouse questions is always a clean alphanumeric string.
      const handle = await page.$(`#${triggerId.replace(/(["\\])/g, '\\$1')}`)
      return handle
    }

    const triggerHtmlBefore = await triggerEl.evaluate(el => {
      // Walk up two levels to capture the field container
      let n = el
      for (let i = 0; i < 2 && n.parentElement; i++) n = n.parentElement
      return n.outerHTML.slice(0, 2000)
    })
    log('TRIGGER_HTML_BEFORE', triggerHtmlBefore)

    // ---------------------------------------------------------------------
    // 2. Install a window-level event recorder.
    // ---------------------------------------------------------------------
    await page.evaluate(() => {
      window.__events = []
      const types = [
        'mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup',
        'change', 'input', 'focus', 'focusin', 'focusout', 'blur',
        'keydown', 'keyup', 'keypress',
      ]
      for (const type of types) {
        document.addEventListener(type, (event) => {
          const target = event.target
          if (!(target instanceof Element)) return
          const tag = target.tagName.toLowerCase()
          const role = target.getAttribute('role')
          const cls = (target.className || '').toString().slice(0, 80)
          const text = target.textContent?.trim().slice(0, 40) ?? ''
          window.__events.push({
            t: performance.now(),
            type,
            phase: event.eventPhase,
            tag,
            role,
            cls,
            text,
          })
        }, { capture: true })
      }
    })
    log('event recorder installed')

    // ---------------------------------------------------------------------
    // 3. Click the trigger to open the dropdown. Capture popup HTML.
    //    Use page.locator() instead of elementHandle so Playwright auto-
    //    retries on stale elements (react-select replaces the input on every
    //    interaction).
    // ---------------------------------------------------------------------
    const triggerLocator = page.locator(`#${triggerId}`)
    await triggerLocator.scrollIntoViewIfNeeded()
    await triggerLocator.click()
    await sleep(300) // give the dropdown time to render

    const popupHtml = await page.evaluate(() => {
      const popup = document.querySelector(
        '[role="listbox"], [class*="menu"][class*="select"], [class*="MenuList"]',
      )
      return popup?.outerHTML.slice(0, 2000) ?? null
    })
    log('POPUP_HTML', popupHtml)

    // List the actual visible options
    const visibleOptions = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('[role="option"]'))
        .map(el => ({
          text: el.textContent?.trim() ?? '',
          rect: el.getBoundingClientRect(),
          ariaSelected: el.getAttribute('aria-selected'),
          dataState: el.getAttribute('data-state'),
        }))
        .filter(o => o.rect.width > 0 && o.rect.height > 0)
      return opts.map(o => ({
        text: o.text,
        x: Math.round(o.rect.left + o.rect.width / 2),
        y: Math.round(o.rect.top + o.rect.height / 2),
        ariaSelected: o.ariaSelected,
        dataState: o.dataState,
      }))
    })
    log('VISIBLE_OPTIONS', visibleOptions)

    // ---------------------------------------------------------------------
    // 4. Find and click the target option. Wait briefly, then dump events.
    // ---------------------------------------------------------------------
    const optionHandle = await page.evaluateHandle((target) => {
      const opts = document.querySelectorAll('[role="option"]')
      for (const opt of opts) {
        if (opt.textContent?.trim() === target) return opt
      }
      return null
    }, TARGET_OPTION)

    const optionEl = optionHandle.asElement()
    if (!optionEl) {
      log('ERROR', `could not find option "${TARGET_OPTION}"`)
      return
    }

    const optionHtmlBefore = await optionEl.evaluate(el => el.outerHTML.slice(0, 500))
    log('OPTION_HTML_BEFORE_CLICK', optionHtmlBefore)

    // Reset the event recorder so we only capture the click flow
    await page.evaluate(() => { window.__events = [] })

    // Take displayed-text/aria snapshots at the trigger across time
    const snapshotsByTime = []
    const snapshotTrigger = async () => {
      const fresh = await findFreshTrigger()
      if (!fresh) return { error: 'trigger handle gone' }
      return await fresh.evaluate((el, label) => {
        function findField(start, label) {
          // Walk up looking for the trigger's field wrapper
          let n = start
          for (let i = 0; i < 6 && n; i++) {
            const lbl = n.querySelector?.('label')
            if (lbl?.textContent?.includes(label)) return n
            n = n.parentElement
          }
          return null
        }
        const field = findField(el, label) ?? el.parentElement
        if (!field) return { error: 'no field' }

        const placeholder = field.querySelector('[class*="placeholder" i]')
        const singleValue = field.querySelector('[class*="single-value" i], [class*="singleValue" i]')
        const cb = field.querySelector('[role="combobox"]')

        return {
          placeholderText: placeholder?.textContent?.trim() ?? null,
          placeholderVisible: placeholder ? (() => {
            const r = placeholder.getBoundingClientRect()
            return r.width > 0 && r.height > 0
          })() : null,
          singleValueText: singleValue?.textContent?.trim() ?? null,
          singleValueVisible: singleValue ? (() => {
            const r = singleValue.getBoundingClientRect()
            return r.width > 0 && r.height > 0
          })() : null,
          ariaInvalid: cb?.getAttribute('aria-invalid'),
          ariaExpanded: cb?.getAttribute('aria-expanded'),
          ariaActivedescendant: cb?.getAttribute('aria-activedescendant'),
          inputValue: field.querySelector('input')?.value,
          fieldHTMLLength: field.outerHTML.length,
        }
      }, FIELD_LABEL)
    }

    const t0Snapshot = await snapshotTrigger()
    log('TRIGGER_STATE @ t-0 (just before click)', t0Snapshot)

    // Now click the option
    await optionEl.click()

    const checkpoints = [0, 50, 200, 500, 1500]
    for (const ms of checkpoints) {
      await sleep(ms === 0 ? 0 : (ms - (checkpoints[checkpoints.indexOf(ms) - 1] ?? 0)))
      const snapshot = await snapshotTrigger()
      const optionStillExists = await page.evaluate((target) => {
        const opts = document.querySelectorAll('[role="option"]')
        for (const opt of opts) if (opt.textContent?.trim() === target) return true
        return false
      }, TARGET_OPTION)
      snapshotsByTime.push({ ms, snapshot, optionStillExists })
    }

    for (const entry of snapshotsByTime) {
      log(`TRIGGER_STATE @ t+${entry.ms}ms`, entry)
    }

    const eventLog = await page.evaluate(() => window.__events.slice(0, 80))
    log('EVENT_LOG (during click flow)', eventLog)

    // ---------------------------------------------------------------------
    // 5. After all the snapshots, dump the trigger's outerHTML again to see
    //    what changed.
    // ---------------------------------------------------------------------
    {
      const fresh = await findFreshTrigger()
      if (fresh) {
        const triggerHtmlAfter = await fresh.evaluate(el => {
          let n = el
          for (let i = 0; i < 2 && n.parentElement; i++) n = n.parentElement
          return n.outerHTML.slice(0, 2000)
        })
        log('TRIGGER_HTML_AFTER', triggerHtmlAfter)
      } else {
        log('TRIGGER_HTML_AFTER', 'fresh handle lost')
      }

      // CRITICAL TEST: simulate exactly what postCommitVerify does on a
      // STALE handle. Use the original triggerEl (which may now be detached)
      // and run the v1.39.0 placeholder check directly to see what it
      // returns. If the original handle is detached, the check returns false
      // (no veto) and the silent-fill bug fires.
      log('--- POST-COMMIT VERIFY SIMULATION ---')
      const staleResult = await triggerEl.evaluate((el) => {
        try {
          if (!(el instanceof HTMLElement)) return { ok: false, error: 'not html element' }
          const isConnected = el.isConnected
          let textRead = null
          if (isConnected) {
            // Reproduce readTriggerShowsPlaceholder logic
            let cur = el
            let depth = 0
            while (cur && depth < 4) {
              const candidates = cur.querySelectorAll('[class*="placeholder"], [class*="single-value"], [class*="singleValue"]')
              for (const c of candidates) {
                if (c.querySelector('input, select, textarea, button')) continue
                const t = c.textContent?.trim()
                if (t) { textRead = t; break }
              }
              if (textRead) break
              cur = cur.parentElement
              depth++
            }
          }
          return {
            ok: true,
            isConnected,
            placeholderTextFromStaleHandle: textRead,
            ariaInvalid: el.getAttribute?.('aria-invalid') ?? null,
            tagName: el.tagName,
          }
        } catch (e) {
          return { ok: false, error: String(e) }
        }
      }).catch(e => ({ ok: false, error: String(e) }))
      log('STALE_HANDLE_PLACEHOLDER_CHECK', staleResult)

      const fresh2 = await findFreshTrigger()
      if (fresh2) {
        const freshResult = await fresh2.evaluate((el) => {
          if (!(el instanceof HTMLElement)) return { ok: false, error: 'not html element' }
          let cur = el
          let depth = 0
          let textRead = null
          const walkLog = []
          while (cur && depth < 4) {
            const candidates = cur.querySelectorAll('[class*="placeholder"], [class*="single-value"], [class*="singleValue"]')
            walkLog.push({ depth, currentClass: cur.className?.toString().slice(0, 60) ?? '', candidateCount: candidates.length })
            for (const c of candidates) {
              if (c.querySelector('input, select, textarea, button')) continue
              const t = c.textContent?.trim()
              if (t) { textRead = t; break }
            }
            if (textRead) break
            cur = cur.parentElement
            depth++
          }
          return {
            ok: true,
            isConnected: el.isConnected,
            placeholderTextFromFreshHandle: textRead,
            ariaInvalid: el.getAttribute('aria-invalid'),
            walkLog,
          }
        })
        log('FRESH_HANDLE_PLACEHOLDER_CHECK', freshResult)
      }
    }

    // ---------------------------------------------------------------------
    // 6. Try the same thing using mouse.click(x,y) at the option's center —
    //    same approach Playwright uses internally for elementHandle.click().
    //    This is purely a sanity check that elementHandle.click vs
    //    page.mouse.click behave the same way for this listbox.
    // ---------------------------------------------------------------------
    // ---------------------------------------------------------------------
    // 6. CRITICAL: reproduce the proxy flow EXACTLY:
    //    open → option.click → blur active element → check value
    //
    // The standalone click in step 4 worked. The proxy flow doesn't. The
    // only meaningful difference is dismissAndReVerifySelection's blur of
    // the active element. Test whether the blur is what causes the revert.
    // ---------------------------------------------------------------------
    log('--- PROXY FLOW REPRODUCTION ---')
    // Re-load to reset state since the previous click already committed.
    // Greenhouse generates random IDs per page load so re-find the trigger
    // by label instead of by id.
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForSelector('form', { timeout: 15_000 })
    log('reloaded for proxy flow test')

    const triggerId2 = await page.evaluate((label) => {
      const allComboboxes = document.querySelectorAll('[role="combobox"]')
      for (const cb of allComboboxes) {
        let cursor = cb
        for (let depth = 0; depth < 6 && cursor; depth++) {
          const labelEl = cursor.querySelector?.('label')
          if (labelEl?.textContent?.includes(label)) return cb.id
          cursor = cursor.parentElement
        }
      }
      return null
    }, FIELD_LABEL)
    log('NEW_TRIGGER_ID', triggerId2)
    if (!triggerId2) { log('ERROR', 'lost trigger after reload'); return }

    const triggerLocator2 = page.locator(`#${triggerId2}`)
    await triggerLocator2.scrollIntoViewIfNeeded()

    // Reset event recorder
    await page.evaluate(() => { window.__events = [] })

    log('opening dropdown')
    await triggerLocator2.click()
    await sleep(200)

    log('clicking Yes option')
    const optionLocator = page.locator('[role="option"]', { hasText: /^Yes$/ }).first()
    await optionLocator.click()

    // Snapshot 1: immediately after click, BEFORE any blur
    const beforeBlur = await page.evaluate((triggerId2) => {
      const input = document.getElementById(triggerId2)
      if (!input) return { error: 'no input' }
      let field = input
      for (let i = 0; i < 6 && field.parentElement; i++) field = field.parentElement
      const sv = field.querySelector('[class*="single-value"]')
      const ph = field.querySelector('[class*="placeholder"]')
      return {
        singleValueText: sv?.textContent?.trim() ?? null,
        placeholderText: ph?.textContent?.trim() ?? null,
        activeElementId: document.activeElement?.id ?? null,
        activeElementTag: document.activeElement?.tagName ?? null,
        inputValue: input.value,
        inputAriaInvalid: input.getAttribute('aria-invalid'),
      }
    }, triggerId2)
    log('AFTER OPTION CLICK (no blur yet)', beforeBlur)

    // Now reproduce the proxy's blur step
    log('blurring active element (proxy step)')
    await page.evaluate(() => {
      const active = document.activeElement
      if (active && active instanceof HTMLElement && typeof active.blur === 'function') {
        active.blur()
      }
    })
    await sleep(50)

    const afterBlur = await page.evaluate((triggerId2) => {
      const input = document.getElementById(triggerId2)
      if (!input) return { error: 'no input' }
      let field = input
      for (let i = 0; i < 6 && field.parentElement; i++) field = field.parentElement
      const sv = field.querySelector('[class*="single-value"]')
      const ph = field.querySelector('[class*="placeholder"]')
      return {
        singleValueText: sv?.textContent?.trim() ?? null,
        placeholderText: ph?.textContent?.trim() ?? null,
        activeElementId: document.activeElement?.id ?? null,
        inputValue: input.value,
        inputAriaInvalid: input.getAttribute('aria-invalid'),
      }
    }, triggerId2)
    log('AFTER BLUR', afterBlur)

    await sleep(500)
    const after500ms = await page.evaluate((triggerId2) => {
      const input = document.getElementById(triggerId2)
      if (!input) return { error: 'no input' }
      let field = input
      for (let i = 0; i < 6 && field.parentElement; i++) field = field.parentElement
      const sv = field.querySelector('[class*="single-value"]')
      const ph = field.querySelector('[class*="placeholder"]')
      return {
        singleValueText: sv?.textContent?.trim() ?? null,
        placeholderText: ph?.textContent?.trim() ?? null,
        inputValue: input.value,
      }
    }, triggerId2)
    log('AFTER BLUR + 500ms', after500ms)

    // Dump events
    const events3 = await page.evaluate(() => window.__events.slice(0, 80))
    log('FULL EVENT LOG (open + click + blur)', events3)
  } finally {
    await browser.close()
  }
}

main().catch(err => {
  console.error('FATAL', err)
  process.exit(1)
})

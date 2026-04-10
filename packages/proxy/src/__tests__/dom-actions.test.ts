import { writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { attachFiles, fillFields, pickListboxOption, setFieldChoice, setFieldText, wheelAt } from '../dom-actions.ts'

describe('pickListboxOption', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  it('opens a labeled custom dropdown and clicks a visible button option fallback', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
        .field { width: 360px; position: relative; }
        #trigger { width: 100%; min-height: 44px; text-align: left; }
        #menu[hidden] { display: none; }
        #menu { border: 1px solid #ccc; margin-top: 6px; padding: 8px; display: grid; gap: 6px; }
      </style>
      <div class="field">
        <label>Location</label>
        <button id="trigger" type="button" aria-haspopup="listbox">Start typing...</button>
        <div id="menu" hidden>
          <button type="button">Austin, TX</button>
          <button type="button">New York, NY</button>
        </div>
      </div>
      <script>
        const trigger = document.getElementById('trigger')
        const menu = document.getElementById('menu')
        trigger.addEventListener('click', () => {
          menu.hidden = false
        })
        for (const option of menu.querySelectorAll('button')) {
          option.addEventListener('click', () => {
            trigger.textContent = option.textContent
            menu.hidden = true
          })
        }
      </script>
    `)

    await pickListboxOption(page, 'New York, NY', {
      fieldLabel: 'Location',
      exact: true,
    })

    expect(await page.locator('#trigger').textContent()).toBe('New York, NY')
    await page.close()
  })

  it('prefers the visible dropdown trigger over a tiny labeled input', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
        .field { width: 360px; position: relative; }
        #trigger { width: 100%; min-height: 44px; text-align: left; }
        #combo-input { width: 6px; height: 6px; border: 0; padding: 0; margin: 0; }
        #menu[hidden] { display: none; }
        #menu { border: 1px solid #ccc; margin-top: 6px; padding: 8px; display: grid; gap: 6px; }
      </style>
      <div class="field">
        <label for="combo-input">Country</label>
        <div>
          <input id="combo-input" placeholder="Start typing..." />
          <button id="trigger" type="button" aria-haspopup="listbox">Select country</button>
        </div>
        <div id="menu" hidden>
          <button type="button">Canada</button>
          <button type="button">United States</button>
        </div>
      </div>
      <script>
        const trigger = document.getElementById('trigger')
        const menu = document.getElementById('menu')
        trigger.addEventListener('click', () => {
          menu.hidden = false
        })
        for (const option of menu.querySelectorAll('button')) {
          option.addEventListener('click', () => {
            trigger.textContent = option.textContent
            menu.hidden = true
          })
        }
      </script>
    `)

    await pickListboxOption(page, 'United States', {
      fieldLabel: 'Country',
      exact: false,
    })

    expect(await page.locator('#trigger').textContent()).toBe('United States')
    await page.close()
  })

  it('keeps explicitly labeled tiny comboboxes anchored to their own wrapper instead of a nearby phone field', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
        .stack { display: grid; gap: 12px; width: 420px; }
        .select__control { width: 160px; min-height: 34px; border: 1px solid #ccc; padding: 4px 12px; display: flex; align-items: center; }
        #country { width: 4px; border: 0; padding: 0; margin: 0; }
        #menu[hidden] { display: none; }
        #menu { border: 1px solid #ccc; margin-top: 6px; padding: 8px; display: grid; gap: 6px; width: 220px; }
        #phone { width: 320px; min-height: 34px; }
      </style>
      <div class="stack">
        <div class="field">
          <label for="country">Country</label>
          <div id="country-control" class="select__control">
            <input id="country" role="combobox" aria-labelledby="country-label" aria-expanded="false" />
            <span id="country-selected">Select country</span>
          </div>
          <div id="menu" hidden>
            <button type="button">Canada</button>
            <button type="button">United States +1</button>
          </div>
        </div>
        <div class="field">
          <label for="phone">Phone</label>
          <input id="phone" aria-label="Phone" />
        </div>
      </div>
      <script>
        const label = document.querySelector('label[for="country"]')
        label.id = 'country-label'
        const input = document.getElementById('country')
        const control = document.getElementById('country-control')
        const selected = document.getElementById('country-selected')
        const menu = document.getElementById('menu')
        const options = Array.from(menu.querySelectorAll('button'))
        control.addEventListener('click', () => {
          menu.hidden = false
          input.setAttribute('aria-expanded', 'true')
          input.focus()
        })
        input.addEventListener('input', () => {
          const query = input.value.toLowerCase()
          menu.hidden = false
          input.setAttribute('aria-expanded', 'true')
          for (const option of options) {
            option.hidden = !option.textContent.toLowerCase().includes(query)
          }
        })
        for (const option of options) {
          option.addEventListener('click', () => {
            selected.textContent = option.textContent.includes('+1') ? '+1' : option.textContent
            input.value = ''
            menu.hidden = true
            input.setAttribute('aria-expanded', 'false')
          })
        }
      </script>
    `)

    await pickListboxOption(page, 'United States', {
      fieldLabel: 'Country',
      exact: false,
    })

    expect(await page.locator('#country-selected').textContent()).toBe('+1')
    expect(await page.locator('#phone').inputValue()).toBe('')
    await page.close()
  })

  it('matches short affirmative labels to longer consent-style option copy', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
        .field { width: 420px; position: relative; }
        #trigger { width: 100%; min-height: 44px; text-align: left; }
        #menu[hidden] { display: none; }
        #menu { border: 1px solid #ccc; margin-top: 6px; padding: 8px; display: grid; gap: 6px; }
      </style>
      <div class="field">
        <label>GDPR consent</label>
        <button id="trigger" type="button" aria-haspopup="listbox">Choose an answer</button>
        <div id="menu" hidden>
          <button type="button">I have read and acknowledge the privacy policy</button>
          <button type="button">I do not agree</button>
        </div>
      </div>
      <script>
        const trigger = document.getElementById('trigger')
        const menu = document.getElementById('menu')
        trigger.addEventListener('click', () => {
          menu.hidden = false
        })
        for (const option of menu.querySelectorAll('button')) {
          option.addEventListener('click', () => {
            trigger.textContent = option.textContent
            menu.hidden = true
          })
        }
      </script>
    `)

    await pickListboxOption(page, 'Yes', {
      fieldLabel: 'GDPR consent',
      exact: false,
    })

    expect(await page.locator('#trigger').textContent()).toBe('I have read and acknowledge the privacy policy')
    await page.close()
  })

  it('confirms against the anchored field when matching labels repeat after DOM reordering', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
        #stack { display: grid; gap: 16px; width: 420px; }
        button.trigger { width: 100%; min-height: 44px; text-align: left; }
        .menu[hidden] { display: none; }
        .menu { border: 1px solid #ccc; padding: 8px; display: grid; gap: 6px; }
      </style>
      <div id="stack">
        <div class="field" id="field-a">
          <label>Country</label>
          <button class="trigger" id="trigger-a" type="button" aria-haspopup="listbox">Choose country</button>
          <div class="menu" id="menu-a" hidden>
            <button type="button">Canada</button>
            <button type="button">United States</button>
          </div>
        </div>
        <div class="field" id="field-b">
          <label>Country</label>
          <button class="trigger" id="trigger-b" type="button" aria-haspopup="listbox">Choose country</button>
          <div class="menu" id="menu-b" hidden>
            <button type="button">Mexico</button>
            <button type="button">Brazil</button>
          </div>
        </div>
      </div>
      <script>
        const stack = document.getElementById('stack')
        const fieldA = document.getElementById('field-a')
        const fieldB = document.getElementById('field-b')
        const triggerA = document.getElementById('trigger-a')
        const menuA = document.getElementById('menu-a')
        const triggerB = document.getElementById('trigger-b')
        const menuB = document.getElementById('menu-b')
        triggerA.addEventListener('click', () => {
          menuA.hidden = false
        })
        triggerB.addEventListener('click', () => {
          menuB.hidden = false
        })
        for (const option of menuA.querySelectorAll('button')) {
          option.addEventListener('click', () => {
            triggerA.textContent = option.textContent
            menuA.hidden = true
            stack.insertBefore(fieldB, fieldA)
          })
        }
      </script>
    `)

    await pickListboxOption(page, 'Canada', {
      fieldLabel: 'Country',
      exact: false,
    })

    expect(await page.locator('#trigger-a').textContent()).toBe('Canada')
    expect(await page.locator('#trigger-b').textContent()).toBe('Choose country')
    await page.close()
  })

  it('targets the right popup when multiple comboboxes share Yes/No options (Greenhouse-style)', async () => {
    // Regression for the failure mode that breaks Greenhouse application forms:
    // three distinct comboboxes (work auth, sponsorship, prior employment) all expose a
    // Yes/No popup. Without popup-scoped option resolution the picker would click the
    // first matching option in document order, leaving the requested field untouched and
    // letting the form's required-field validation fire on submit.
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
        .field { width: 480px; margin-bottom: 24px; position: relative; }
        .control { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border: 1px solid #ccc; min-height: 36px; }
        .control[data-state="invalid"] { border-color: #c00; }
        .menu[hidden] { display: none; }
        .menu { border: 1px solid #ccc; margin-top: 6px; padding: 4px; display: grid; gap: 4px; background: #fff; }
        [role="option"][data-highlighted="true"] { background: #def; }
        [role="option"] { padding: 6px 8px; cursor: pointer; }
      </style>
      <form id="application">
        <div class="field" id="field-auth">
          <label id="auth-label">Are you legally authorized to work in the country in which you are applying?</label>
          <div class="control" id="auth-control" data-state="invalid">
            <input id="auth-input" role="combobox" aria-labelledby="auth-label" aria-controls="auth-menu" aria-expanded="false" aria-haspopup="listbox" />
            <span id="auth-display" data-placeholder="true">Select...</span>
          </div>
          <div class="menu" id="auth-menu" role="listbox" aria-labelledby="auth-label" hidden>
            <div role="option">Yes</div>
            <div role="option">No</div>
          </div>
        </div>
        <div class="field" id="field-sponsor">
          <label id="sponsor-label">Do you now or will you in the future need sponsorship for employment visa status?</label>
          <div class="control" id="sponsor-control" data-state="invalid">
            <input id="sponsor-input" role="combobox" aria-labelledby="sponsor-label" aria-controls="sponsor-menu" aria-expanded="false" aria-haspopup="listbox" />
            <span id="sponsor-display" data-placeholder="true">Select...</span>
          </div>
          <div class="menu" id="sponsor-menu" role="listbox" aria-labelledby="sponsor-label" hidden>
            <div role="option">Yes</div>
            <div role="option">No</div>
          </div>
        </div>
        <div class="field" id="field-prior">
          <label id="prior-label">Have you previously worked for the company?</label>
          <div class="control" id="prior-control" data-state="invalid">
            <input id="prior-input" role="combobox" aria-labelledby="prior-label" aria-controls="prior-menu" aria-expanded="false" aria-haspopup="listbox" />
            <span id="prior-display" data-placeholder="true">Select...</span>
          </div>
          <div class="menu" id="prior-menu" role="listbox" aria-labelledby="prior-label" hidden>
            <div role="option">Yes</div>
            <div role="option">No</div>
          </div>
        </div>
      </form>
      <script>
        function wireField(controlId, inputId, displayId, menuId) {
          const control = document.getElementById(controlId)
          const input = document.getElementById(inputId)
          const display = document.getElementById(displayId)
          const menu = document.getElementById(menuId)
          const options = Array.from(menu.querySelectorAll('[role="option"]'))

          function open() {
            menu.hidden = false
            input.setAttribute('aria-expanded', 'true')
          }
          function close() {
            menu.hidden = true
            input.setAttribute('aria-expanded', 'false')
          }
          function commit(value) {
            display.textContent = value
            display.removeAttribute('data-placeholder')
            control.removeAttribute('data-state')
            close()
          }

          control.addEventListener('click', open)
          input.addEventListener('focus', open)
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              const highlighted = options.find(o => o.getAttribute('data-highlighted') === 'true')
              if (highlighted) {
                event.preventDefault()
                commit(highlighted.textContent)
              }
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const currentIndex = options.findIndex(o => o.getAttribute('data-highlighted') === 'true')
              const nextIndex =
                event.key === 'ArrowDown'
                  ? (currentIndex + 1 + options.length) % options.length
                  : (currentIndex - 1 + options.length) % options.length
              for (const o of options) o.removeAttribute('data-highlighted')
              options[nextIndex].setAttribute('data-highlighted', 'true')
            }
          })
          for (const option of options) {
            option.addEventListener('mousedown', (event) => {
              event.preventDefault()
              commit(option.textContent)
            })
          }
        }

        wireField('auth-control', 'auth-input', 'auth-display', 'auth-menu')
        wireField('sponsor-control', 'sponsor-input', 'sponsor-display', 'sponsor-menu')
        wireField('prior-control', 'prior-input', 'prior-display', 'prior-menu')
      </script>
    `)

    // Pick the middle field's "No" option. The first and third fields must remain untouched.
    await pickListboxOption(page, 'No', {
      fieldLabel: 'Do you now or will you in the future need sponsorship for employment visa status?',
      exact: false,
    })

    expect(await page.locator('#sponsor-display').textContent()).toBe('No')
    expect(await page.locator('#auth-display').textContent()).toBe('Select...')
    expect(await page.locator('#prior-display').textContent()).toBe('Select...')

    // And the first field still works after the second one closed.
    await pickListboxOption(page, 'Yes', {
      fieldLabel: 'Are you legally authorized to work in the country in which you are applying?',
      exact: false,
    })

    expect(await page.locator('#auth-display').textContent()).toBe('Yes')
    expect(await page.locator('#sponsor-display').textContent()).toBe('No')
    expect(await page.locator('#prior-display').textContent()).toBe('Select...')

    await page.close()
  })

  it('falls back to keyboard navigation for searchable comboboxes when click selection does not update the field', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
        .field { width: 420px; position: relative; display: grid; gap: 8px; }
        #combo { width: 100%; min-height: 40px; }
        #menu[hidden] { display: none; }
        #menu { border: 1px solid #ccc; padding: 8px; display: grid; gap: 6px; }
        [role="option"][data-highlighted="true"] { background: #def; }
      </style>
      <div class="field">
        <label for="combo">Country</label>
        <input
          id="combo"
          role="combobox"
          aria-controls="menu"
          aria-expanded="false"
          aria-autocomplete="list"
        />
        <div id="selection">Choose country</div>
        <div id="menu" role="listbox" hidden>
          <div id="option-ca" role="option">Canada</div>
          <div id="option-us" role="option">United States</div>
        </div>
      </div>
      <script>
        const input = document.getElementById('combo')
        const menu = document.getElementById('menu')
        const selection = document.getElementById('selection')
        const options = Array.from(menu.querySelectorAll('[role="option"]'))
        let filtered = options
        let activeIndex = -1

        function refresh() {
          const query = input.value.toLowerCase()
          filtered = options.filter(option => option.textContent.toLowerCase().includes(query))
          menu.hidden = false
          input.setAttribute('aria-expanded', 'true')
          for (const option of options) {
            option.hidden = !filtered.includes(option)
            option.removeAttribute('data-highlighted')
          }
          if (filtered.length === 0) {
            activeIndex = -1
            input.removeAttribute('aria-activedescendant')
            return
          }
          if (activeIndex < 0 || activeIndex >= filtered.length) activeIndex = 0
          const active = filtered[activeIndex]
          active.setAttribute('data-highlighted', 'true')
          input.setAttribute('aria-activedescendant', active.id)
        }

        input.addEventListener('focus', refresh)
        input.addEventListener('click', refresh)
        input.addEventListener('input', () => {
          activeIndex = -1
          refresh()
        })
        input.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (filtered.length > 0) {
              activeIndex = (activeIndex + 1) % filtered.length
              refresh()
            }
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (filtered.length > 0) {
              activeIndex = (activeIndex - 1 + filtered.length) % filtered.length
              refresh()
            }
          }
          if (event.key === 'Enter') {
            const active = filtered[activeIndex]
            if (active) {
              event.preventDefault()
              selection.textContent = active.textContent
              menu.hidden = true
              input.setAttribute('aria-expanded', 'false')
            }
          }
        })
        for (const option of options) {
          option.addEventListener('click', (event) => {
            event.preventDefault()
          })
        }
      </script>
    `)

    await pickListboxOption(page, 'United States', {
      fieldLabel: 'Country',
      exact: false,
    })

    expect(await page.locator('#selection').textContent()).toBe('United States')
    await page.close()
  })

  it('surfaces selection_not_confirmed when a react-select-style listbox keeps aria-invalid=true after click', async () => {
    // Regression: on some forms (Greenhouse's forked react-select instance on
    // Anthropic-style ATS pages, and various Workday PTX flows) the library
    // briefly renders the selected option in `.select__single-value` on click,
    // but its internal form state never commits, so the trigger keeps
    // advertising `aria-invalid="true"`. Before the aria-invalid veto,
    // confirmListboxSelection happily returned true on the brief
    // `.select__single-value` match and dismissAndReVerifySelection then
    // optimistically returned true because the sawAnyValue fallback treated
    // "no displayed values" as success. pickListboxOption would return
    // cleanly, and fill_form would report a 100% success that was a lie.
    //
    // The fix is to consult the trigger's aria-invalid attribute as the
    // authoritative commit signal and treat a still-invalid field as a
    // definitive failure, regardless of what other heuristics say.
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
        .field { width: 360px; display: grid; gap: 8px; }
        .rs-control { border: 1px solid #ccc; min-height: 40px; display: flex; align-items: center; padding: 0 12px; cursor: pointer; }
        .rs-single-value { color: #111; }
        .rs-placeholder { color: #888; }
        .rs-menu[hidden] { display: none; }
        .rs-menu { border: 1px solid #ccc; margin-top: 4px; padding: 4px 0; }
        .rs-option { padding: 6px 12px; cursor: pointer; }
      </style>
      <div class="field">
        <label for="visa-control">Will you now or will you in the future require employment visa sponsorship?</label>
        <div
          id="visa-control"
          class="rs-control"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-invalid="true"
          aria-required="true"
          tabindex="0"
        >
          <span id="visa-value" class="rs-placeholder">Select...</span>
        </div>
        <div id="visa-menu" class="rs-menu" role="listbox" hidden>
          <div id="visa-option-yes" class="rs-option" role="option">Yes</div>
          <div id="visa-option-no" class="rs-option" role="option">No</div>
        </div>
      </div>
      <script>
        const control = document.getElementById('visa-control')
        const valueEl = document.getElementById('visa-value')
        const menu = document.getElementById('visa-menu')
        const options = Array.from(menu.querySelectorAll('.rs-option'))

        function open() {
          if (!menu.hidden) return
          menu.hidden = false
          control.setAttribute('aria-expanded', 'true')
        }
        function close() {
          if (menu.hidden) return
          menu.hidden = true
          control.setAttribute('aria-expanded', 'false')
        }

        control.addEventListener('click', (event) => {
          // Only the control itself opens the menu. Option clicks inside the
          // menu do not bubble up to this handler because the menu lives in a
          // sibling container, but we still early-return if the event came
          // from a selector path (defensive).
          if (event.target.closest('.rs-option')) return
          if (menu.hidden) open(); else close()
        })

        for (const option of options) {
          option.addEventListener('click', (event) => {
            event.stopPropagation()
            // Simulate the buggy library flow: flash the selection into
            // .select__single-value so displayed-value heuristics pick it up,
            // but NEVER clear aria-invalid. In production this is the state
            // after react-select commits its visual side but its internal
            // form state reverts (or never flips in the first place).
            valueEl.textContent = option.textContent
            valueEl.classList.remove('rs-placeholder')
            valueEl.classList.add('rs-single-value')
            close()
            // Explicitly re-assert invalid to defeat any library that reads
            // the attribute late.
            control.setAttribute('aria-invalid', 'true')
          })
        }
      </script>
    `)

    let thrown: Error | null = null
    try {
      await pickListboxOption(page, 'No', {
        fieldLabel: 'Will you now or will you in the future require employment visa sponsorship?',
        exact: false,
      })
    } catch (error) {
      thrown = error as Error
    }

    // The library never clears aria-invalid, so pickListboxOption MUST
    // surface the failure instead of silently reporting success.
    expect(thrown).not.toBeNull()
    expect(thrown?.message).toContain('selection_not_confirmed')
    await page.close()
  }, 60_000)

  it('returns visible options in the failure payload when no custom dropdown option matches', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
        .field { width: 360px; position: relative; }
        #trigger { width: 100%; min-height: 44px; text-align: left; }
        #menu[hidden] { display: none; }
        #menu { border: 1px solid #ccc; margin-top: 6px; padding: 8px; display: grid; gap: 6px; }
      </style>
      <div class="field">
        <label>Location</label>
        <button id="trigger" type="button" aria-haspopup="listbox">Select location</button>
        <div id="menu" role="listbox" hidden>
          <div role="option">Austin, TX</div>
          <div role="option">Boston, MA</div>
        </div>
      </div>
      <script>
        const trigger = document.getElementById('trigger')
        const menu = document.getElementById('menu')
        trigger.addEventListener('click', () => {
          menu.hidden = false
        })
      </script>
    `)

    let thrown: Error | null = null
    try {
      await pickListboxOption(page, 'Berlin, Germany', {
        fieldLabel: 'Location',
        exact: false,
      })
    } catch (error) {
      thrown = error as Error
    }

    expect(thrown).toBeTruthy()
    const payload = JSON.parse(thrown!.message) as Record<string, unknown>
    expect(payload).toMatchObject({
      error: 'listboxPick',
      reason: 'no_visible_option_match',
      fieldLabel: 'Location',
      requestedLabel: 'Berlin, Germany',
      visibleOptionCount: 2,
      visibleOptions: ['Austin, TX', 'Boston, MA'],
    })
    await page.close()
  })
})

describe('attachFiles', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  it('targets a labeled file input instead of the first matching control', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    const tempFile = join(tmpdir(), `geometra-upload-${Date.now()}.txt`)
    await writeFile(tempFile, 'resume')

    await page.setContent(`
      <div style="display:grid;gap:16px;width:420px;margin:24px;font-family:sans-serif;">
        <div>
          <label for="resume-input">Resume</label>
          <input id="resume-input" type="file" />
        </div>
        <div>
          <label for="cover-input">Cover Letter</label>
          <input id="cover-input" type="file" />
        </div>
      </div>
    `)

    try {
      await attachFiles(page, [tempFile], {
        fieldLabel: 'Resume',
      })

      const result = await page.evaluate(() => ({
        resume: (document.getElementById('resume-input') as HTMLInputElement).files?.length ?? 0,
        cover: (document.getElementById('cover-input') as HTMLInputElement).files?.length ?? 0,
      }))

      expect(result).toEqual({ resume: 1, cover: 0 })
    } finally {
      await rm(tempFile, { force: true })
      await page.close()
    }
  })

  it('prefers an exact label match over a substring collision when caller passed exact=false', async () => {
    // Regression: a file input labeled exactly "Resume" must not be hijacked
    // by another file input whose label *contains* the substring "resume"
    // (e.g. "Please attach your resume below as well"). The original
    // findLabeledControl bug had the same shape — getByLabel(..., {exact:false})
    // returned the wrong control. attachFiles' helper now tries exact first.
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    const tempFile = join(tmpdir(), `geometra-upload-collision-${Date.now()}.txt`)
    await writeFile(tempFile, 'resume')

    await page.setContent(`
      <div style="display:grid;gap:16px;width:520px;margin:24px;font-family:sans-serif;">
        <div>
          <label for="extra-input">Please attach your resume below as well</label>
          <input id="extra-input" type="file" />
        </div>
        <div>
          <label for="resume-input">Resume</label>
          <input id="resume-input" type="file" />
        </div>
      </div>
    `)

    try {
      await attachFiles(page, [tempFile], { fieldLabel: 'Resume' })

      const result = await page.evaluate(() => ({
        resume: (document.getElementById('resume-input') as HTMLInputElement).files?.length ?? 0,
        extra: (document.getElementById('extra-input') as HTMLInputElement).files?.length ?? 0,
      }))

      expect(result).toEqual({ resume: 1, extra: 0 })
    } finally {
      await rm(tempFile, { force: true })
      await page.close()
    }
  })
})

describe('setFieldText', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  it('fills a labeled text field semantically', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <div style="display:grid;gap:12px;width:320px;margin:24px;font-family:sans-serif;">
        <label for="full-name">Full name</label>
        <input id="full-name" />
      </div>
    `)

    await setFieldText(page, 'Full name', 'Taylor Applicant')

    expect(await page.locator('#full-name').inputValue()).toBe('Taylor Applicant')
    await page.close()
  })

  it('prefers an exact label match over a substring collision when caller passed exact=false', async () => {
    // Regression: a text input labeled exactly "Country" must not be
    // hijacked by another input whose label *contains* the substring
    // "country" (e.g. the original Greenhouse case where work-auth's
    // "Are you legally authorized to work in the country in which you
    // are applying?" stole fills targeted at the Country field).
    // findLabeledEditableField now tries exact-match candidates first
    // even when the caller passed exact=false.
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <div style="display:grid;gap:16px;width:520px;margin:24px;font-family:sans-serif;">
        <label>
          Are you legally authorized to work in the country in which you are applying?
          <input id="work-auth" />
        </label>
        <label>
          Country
          <input id="country" />
        </label>
      </div>
    `)

    await setFieldText(page, 'Country', 'United States')

    expect(await page.locator('#country').inputValue()).toBe('United States')
    expect(await page.locator('#work-auth').inputValue()).toBe('')
    await page.close()
  })

  it('fills a placeholder-only text field semantically', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <div style="display:grid;gap:12px;width:320px;margin:24px;font-family:sans-serif;">
        <input id="username" placeholder="Username" />
      </div>
    `)

    await setFieldText(page, 'Username', 'standard_user')

    expect(await page.locator('#username').inputValue()).toBe('standard_user')
    await page.close()
  })
})

describe('setFieldChoice', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  it('selects a native select by field label', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <div style="display:grid;gap:12px;width:320px;margin:24px;font-family:sans-serif;">
        <label for="country">Country</label>
        <select id="country">
          <option value="">Choose</option>
          <option value="de">Germany</option>
          <option value="us">United States</option>
        </select>
      </div>
    `)

    await setFieldChoice(page, 'Country', 'Germany')

    expect(await page.locator('#country').inputValue()).toBe('de')
    await page.close()
  })

  it('chooses repeated yes/no answers by question label', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
        fieldset { margin-bottom: 18px; }
      </style>
      <fieldset id="question-a">
        <legend>Are you legally authorized to work here?</legend>
        <label><input type="radio" name="auth" value="yes" /> Yes</label>
        <label><input type="radio" name="auth" value="no" /> No</label>
      </fieldset>
      <fieldset id="question-b">
        <legend>Will you require sponsorship?</legend>
        <label><input type="radio" name="sponsor" value="yes" /> Yes</label>
        <label><input type="radio" name="sponsor" value="no" /> No</label>
      </fieldset>
    `)

    await setFieldChoice(page, 'Will you require sponsorship?', 'No', { choiceType: 'group' })

    expect(await page.locator('#question-a input[value="yes"]').isChecked()).toBe(false)
    expect(await page.locator('#question-a input[value="no"]').isChecked()).toBe(false)
    expect(await page.locator('#question-b input[value="yes"]').isChecked()).toBe(false)
    expect(await page.locator('#question-b input[value="no"]').isChecked()).toBe(true)
    await page.close()
  })

  it('fails grouped choices without taking the listbox path when a group hint is provided', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
      </style>
      <fieldset id="question-a">
        <legend>Will you require sponsorship?</legend>
        <label><input type="radio" name="sponsor" value="yes" /> Yes</label>
        <label><input type="radio" name="sponsor" value="no" /> No</label>
      </fieldset>
    `)

    await expect(
      setFieldChoice(page, 'Will you require sponsorship?', 'Maybe', { choiceType: 'group' }),
    ).rejects.toThrow('no grouped choice matching "Maybe"')

    await page.close()
  })
})

describe('wheelAt', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  it('scrolls the page root when no target coordinates are provided', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 0; }
        #spacer { height: 2200px; background: linear-gradient(#fff, #ddd); }
        #inner { width: 260px; height: 120px; overflow: auto; margin: 24px; border: 1px solid #ccc; }
        #inner-content { height: 600px; }
      </style>
      <div id="inner"><div id="inner-content"></div></div>
      <div id="spacer"></div>
    `)

    await wheelAt(page, 0, 480)

    const result = await page.evaluate(() => ({
      pageY: window.scrollY,
      innerY: (document.getElementById('inner') as HTMLElement).scrollTop,
    }))

    expect(result.pageY).toBeGreaterThan(0)
    expect(result.innerY).toBe(0)
    await page.close()
  })

  it('targets the nearest scroll container when coordinates are provided', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 0; }
        #spacer { height: 1800px; background: linear-gradient(#fff, #ddd); }
        #inner { width: 320px; height: 140px; overflow: auto; margin: 24px; border: 1px solid #ccc; }
        #inner-content { height: 800px; }
      </style>
      <div id="inner"><div id="inner-content"></div></div>
      <div id="spacer"></div>
    `)

    const box = await page.locator('#inner').boundingBox()
    if (!box) throw new Error('expected #inner bounding box')

    await wheelAt(page, 0, 260, Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))

    const result = await page.evaluate(() => ({
      pageY: window.scrollY,
      innerY: (document.getElementById('inner') as HTMLElement).scrollTop,
    }))

    expect(result.innerY).toBeGreaterThan(0)
    expect(result.pageY).toBe(0)
    await page.close()
  })
})

describe('fillFields auto', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  it('fills native text, select, checkbox, and grouped radio fields from labels without prior schema hints', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; display: grid; gap: 16px; width: 420px; }
        label, fieldset { display: grid; gap: 8px; }
      </style>
      <label>
        Full name
        <input id="full-name" />
      </label>
      <label>
        Preferred location
        <select id="location">
          <option value="">Choose one</option>
          <option>Berlin, Germany</option>
          <option>London, United Kingdom</option>
        </select>
      </label>
      <label>
        Share my profile for future roles
        <input id="share-profile" type="checkbox" />
      </label>
      <fieldset>
        <legend>Will you now or in the future require sponsorship?</legend>
        <label><input type="radio" name="sponsor" value="yes" /> Yes</label>
        <label><input type="radio" name="sponsor" value="no" /> No</label>
      </fieldset>
      <fieldset>
        <legend>Can you work a hybrid schedule in Berlin three days a week?</legend>
        <label><input type="radio" name="hybrid" value="yes" /> Yes</label>
        <label><input type="radio" name="hybrid" value="no" /> No</label>
      </fieldset>
    `)

    await fillFields(page, [
      { kind: 'auto', fieldLabel: 'Full name', value: 'Taylor Applicant' },
      { kind: 'auto', fieldLabel: 'Preferred location', value: 'Berlin, Germany' },
      { kind: 'auto', fieldLabel: 'Share my profile for future roles', value: true },
      { kind: 'auto', fieldLabel: 'Will you now or in the future require sponsorship?', value: false },
      { kind: 'auto', fieldLabel: 'Can you work a hybrid schedule in Berlin three days a week?', value: 'No' },
    ])

    const result = await page.evaluate(() => ({
      fullName: (document.getElementById('full-name') as HTMLInputElement).value,
      location: (document.getElementById('location') as HTMLSelectElement).value,
      shareProfile: (document.getElementById('share-profile') as HTMLInputElement).checked,
      sponsorshipNo: (document.querySelector('input[name="sponsor"][value="no"]') as HTMLInputElement).checked,
      hybridNo: (document.querySelector('input[name="hybrid"][value="no"]') as HTMLInputElement).checked,
    }))

    expect(result).toEqual({
      fullName: 'Taylor Applicant',
      location: 'Berlin, Germany',
      shareProfile: true,
      sponsorshipNo: true,
      hybridNo: true,
    })
    await page.close()
  })

  it('fills placeholder-labeled text inputs in one batch', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; display: grid; gap: 16px; width: 320px; }
      </style>
      <input id="username" placeholder="Username" />
      <input id="password" placeholder="Password" type="password" />
      <input id="first-name" placeholder="First Name" />
      <input id="postal-code" placeholder="Zip/Postal Code" />
    `)

    await fillFields(page, [
      { kind: 'text', fieldLabel: 'Username', value: 'standard_user' },
      { kind: 'text', fieldLabel: 'Password', value: 'secret_sauce' },
      { kind: 'text', fieldLabel: 'First Name', value: 'Taylor' },
      { kind: 'text', fieldLabel: 'Zip/Postal Code', value: '10001' },
    ])

    const result = await page.evaluate(() => ({
      username: (document.getElementById('username') as HTMLInputElement).value,
      password: (document.getElementById('password') as HTMLInputElement).value,
      firstName: (document.getElementById('first-name') as HTMLInputElement).value,
      postalCode: (document.getElementById('postal-code') as HTMLInputElement).value,
    }))

    expect(result).toEqual({
      username: 'standard_user',
      password: 'secret_sauce',
      firstName: 'Taylor',
      postalCode: '10001',
    })
    await page.close()
  })
})

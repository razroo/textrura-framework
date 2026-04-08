import { writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { attachFiles, pickListboxOption, setFieldChoice, setFieldText, wheelAt } from '../dom-actions.ts'

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

    await setFieldChoice(page, 'Will you require sponsorship?', 'No')

    expect(await page.locator('#question-a input[value="yes"]').isChecked()).toBe(false)
    expect(await page.locator('#question-a input[value="no"]').isChecked()).toBe(false)
    expect(await page.locator('#question-b input[value="yes"]').isChecked()).toBe(false)
    expect(await page.locator('#question-b input[value="no"]').isChecked()).toBe(true)
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

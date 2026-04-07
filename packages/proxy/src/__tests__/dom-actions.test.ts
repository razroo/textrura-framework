import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { pickListboxOption } from '../dom-actions.js'

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
})

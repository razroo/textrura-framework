import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { extractGeometry } from '../extractor.ts'
import type { LayoutSnapshot, TreeSnapshot } from '../types.js'

interface SnapshotNode {
  tree: TreeSnapshot
  layout: LayoutSnapshot
}

function flattenSnapshot(tree: TreeSnapshot, layout: LayoutSnapshot): SnapshotNode[] {
  const out: SnapshotNode[] = [{ tree, layout }]
  const treeChildren = tree.children ?? []
  for (let i = 0; i < treeChildren.length; i++) {
    out.push(...flattenSnapshot(treeChildren[i]!, layout.children[i]!))
  }
  return out
}

describe('extractGeometry', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  it('keeps opacity-zero checkbox inputs when they are still interactive', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(`
      <style>
        body { margin: 0; font-family: sans-serif; }
        .option { display: flex; align-items: center; gap: 8px; margin: 24px; }
        .ghost-checkbox { width: 24px; height: 24px; opacity: 0; margin: 0; }
      </style>
      <fieldset>
        <div class="option">
          <input id="office-ny" class="ghost-checkbox" type="checkbox" checked />
          <label for="office-ny">New York, NY</label>
        </div>
      </fieldset>
    `)

    const snapshot = await extractGeometry(page)
    const nodes = flattenSnapshot(snapshot.tree, snapshot.layout)
    const checkbox = nodes.find(node =>
      node.tree.semantic?.role === 'checkbox' &&
      node.tree.semantic?.ariaLabel === 'New York, NY',
    )

    expect(checkbox).toBeDefined()
    expect(checkbox?.tree.semantic?.ariaChecked).toBe(true)
    expect(checkbox?.layout.width).toBeGreaterThan(0)
    expect(checkbox?.layout.height).toBeGreaterThan(0)

    await page.close()
  })

  it('preserves semantics for text-only buttons instead of downgrading them to plain text', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
        .chips { display: flex; gap: 12px; }
      </style>
      <div class="chips">
        <button>Yes</button>
        <button>No</button>
      </div>
    `)

    const snapshot = await extractGeometry(page)
    const nodes = flattenSnapshot(snapshot.tree, snapshot.layout)
    const yesButton = nodes.find(node =>
      node.tree.kind === 'text' &&
      node.tree.semantic?.role === 'button' &&
      node.tree.props.text === 'Yes',
    )
    const noButton = nodes.find(node =>
      node.tree.kind === 'text' &&
      node.tree.semantic?.role === 'button' &&
      node.tree.props.text === 'No',
    )

    expect(yesButton).toBeDefined()
    expect(yesButton?.tree.handlers?.onClick).toBe(true)
    expect(noButton).toBeDefined()
    expect(noButton?.tree.handlers?.onClick).toBe(true)

    await page.close()
  })

  it('prefers explicit field labels over placeholder text for form controls', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(`
      <label for="location-input">Location</label>
      <input id="location-input" placeholder="Start typing..." />
    `)

    const snapshot = await extractGeometry(page)
    const nodes = flattenSnapshot(snapshot.tree, snapshot.layout)
    const input = nodes.find(node =>
      node.tree.semantic?.role === 'textbox' &&
      node.tree.semantic?.ariaLabel === 'Location',
    )

    expect(input).toBeDefined()
    expect(input?.tree.semantic?.ariaLabel).toBe('Location')

    await page.close()
  })

  it('uses button-like input values as accessible button labels', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(`
      <form>
        <input type="submit" value="Login" />
      </form>
    `)

    const snapshot = await extractGeometry(page)
    const nodes = flattenSnapshot(snapshot.tree, snapshot.layout)
    const button = nodes.find(node =>
      node.tree.semantic?.role === 'button' &&
      node.tree.semantic?.ariaLabel === 'Login',
    )

    expect(button).toBeDefined()
    expect(button?.tree.handlers?.onClick).toBe(true)

    await page.close()
  })

  it('uses descendant image alt text for image-only links', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(`
      <a href="#item">
        <img
          alt="Sauce Labs Backpack"
          width="120"
          height="120"
          src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
        />
      </a>
    `)

    const snapshot = await extractGeometry(page)
    const nodes = flattenSnapshot(snapshot.tree, snapshot.layout)
    const link = nodes.find(node =>
      node.tree.semantic?.role === 'link' &&
      node.tree.semantic?.ariaLabel === 'Sauce Labs Backpack',
    )

    expect(link).toBeDefined()

    await page.close()
  })

  it('reads picked value from a sibling for react-select-style custom comboboxes', async () => {
    // Reproduces the exact DOM react-select v5 emits for a single-select
    // with a committed value: an <input role="combobox"> trigger whose own
    // .value is empty (no search query), with the picked option living in
    // a *sibling* <div class="select__single-value">. Without the
    // findCustomComboboxValueText fallback, geometra_query returns this
    // node with no value field — which is exactly the gap the
    // benchmark-mcp-greenhouse run surfaced. This test locks the fallback
    // in so it can't silently regress.
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(`
      <style>
        .select__control { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #ccc; min-width: 280px; }
        .select__value-container { display: flex; flex: 1; align-items: center; gap: 4px; }
        .select__single-value { color: #1a1f2e; font-size: 14px; }
        .select__input-container { display: flex; flex: 1; }
        .select__input-container input { border: 0; outline: 0; flex: 1; min-width: 60px; font-size: 14px; }
        .select__indicators { display: flex; }
      </style>
      <label for="work-auth">Are you legally authorized to work here?</label>
      <div class="select__control">
        <div class="select__value-container">
          <div class="select__single-value">Yes</div>
          <div class="select__input-container">
            <input
              id="work-auth"
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-autocomplete="list"
              aria-controls="work-auth-listbox"
              value=""
            />
          </div>
        </div>
        <div class="select__indicators" aria-hidden="true">
          <span>▾</span>
        </div>
      </div>
    `)

    const snapshot = await extractGeometry(page)
    const nodes = flattenSnapshot(snapshot.tree, snapshot.layout)
    const combobox = nodes.find(node => node.tree.semantic?.role === 'combobox')

    expect(combobox).toBeDefined()
    expect(combobox?.tree.semantic?.valueText).toBe('Yes')

    await page.close()
  })

  it('falls back to a Radix-style SelectValue sibling for picked combobox values', async () => {
    // Same gap, different combobox library. Radix Select renders
    // <SelectValue> as a span with a class containing "SelectValue".
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(`
      <label for="country">Country</label>
      <button id="country" role="combobox" aria-expanded="false" aria-haspopup="listbox">
        <span class="SelectValue">Germany</span>
        <span aria-hidden="true">▾</span>
      </button>
    `)

    const snapshot = await extractGeometry(page)
    const nodes = flattenSnapshot(snapshot.tree, snapshot.layout)
    const combobox = nodes.find(node => node.tree.semantic?.role === 'combobox')

    expect(combobox).toBeDefined()
    expect(combobox?.tree.semantic?.valueText).toBe('Germany')

    await page.close()
  })

  it('does not surface placeholder text as a combobox value', async () => {
    // The fallback must not return text from a placeholder element — that
    // would be silently misleading. This locks in the className filter.
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(`
      <label for="empty">Country</label>
      <div class="select__control">
        <div class="select__value-container">
          <div class="select__placeholder">Select...</div>
          <div class="select__input-container">
            <input id="empty" role="combobox" aria-expanded="false" value="" />
          </div>
        </div>
      </div>
    `)

    const snapshot = await extractGeometry(page)
    const nodes = flattenSnapshot(snapshot.tree, snapshot.layout)
    const combobox = nodes.find(node => node.tree.semantic?.role === 'combobox')

    expect(combobox).toBeDefined()
    expect(combobox?.tree.semantic?.valueText).toBeUndefined()

    await page.close()
  })

  it('strips nested option text from wrapped select labels', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(`
      <label>
        Preferred location
        <select>
          <option>Choose a location</option>
          <option>Berlin, Germany</option>
          <option>Austin, Texas</option>
        </select>
      </label>
    `)

    const snapshot = await extractGeometry(page)
    const nodes = flattenSnapshot(snapshot.tree, snapshot.layout)
    const select = nodes.find(node =>
      node.tree.semantic?.role === 'combobox' &&
      node.tree.semantic?.ariaLabel === 'Preferred location',
    )

    expect(select).toBeDefined()
    expect(select?.tree.semantic?.ariaLabel).toBe('Preferred location')

    await page.close()
  })

  it('expands tiny text-control bounds to the visible control wrapper', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 24px; font-family: sans-serif; }
        label { display: block; margin-bottom: 8px; }
        .combo-shell {
          width: 320px;
          min-height: 44px;
          padding: 10px 12px;
          border: 1px solid #ccc;
          border-radius: 8px;
          display: flex;
          align-items: center;
        }
        .combo-shell input {
          width: 6px;
          height: 6px;
          border: 0;
          padding: 0;
          margin: 0;
          outline: none;
        }
      </style>
      <label for="country-input">Country</label>
      <div class="combo-shell">
        <input id="country-input" placeholder="Start typing..." />
      </div>
    `)

    const snapshot = await extractGeometry(page)
    const nodes = flattenSnapshot(snapshot.tree, snapshot.layout)
    const input = nodes.find(node =>
      node.tree.semantic?.role === 'textbox' &&
      node.tree.semantic?.ariaLabel === 'Country',
    )

    expect(input).toBeDefined()
    expect(input?.layout.width).toBeGreaterThan(280)
    expect(input?.layout.height).toBeGreaterThan(30)

    await page.close()
  })

  it('falls back to accessibility-tree nodes when DOM extraction is effectively empty', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await page.setContent(`
      <style>
        #host { position: relative; width: 0; height: 0; }
      </style>
      <div id="host"></div>
      <script>
        const host = document.getElementById('host')
        const root = host.attachShadow({ mode: 'closed' })
        root.innerHTML = '<style>button { position: absolute; left: 48px; top: 40px; width: 160px; height: 44px; }</style><button aria-label="Apply now">Apply now</button>'
      </script>
    `)

    const snapshot = await extractGeometry(page)
    const nodes = flattenSnapshot(snapshot.tree, snapshot.layout)
    const button = nodes.find(node =>
      node.tree.semantic?.role === 'button' &&
      node.tree.semantic?.ariaLabel === 'Apply now',
    )

    expect(snapshot.tree.semantic?.a11yFallbackUsed).toBe(true)
    expect(button).toBeDefined()
    expect(button?.tree.semantic?.a11yFallback).toBe(true)
    expect(button?.tree.handlers?.onClick).toBe(true)

    await page.close()
  })
})

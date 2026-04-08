import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { extractGeometry } from '../extractor.js'
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

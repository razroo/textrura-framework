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
})

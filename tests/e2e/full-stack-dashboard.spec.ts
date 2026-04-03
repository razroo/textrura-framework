import { expect, test, type Page } from '@playwright/test'

const COPY_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control'

async function hasMirroredLabel(page: Page, label: string): Promise<boolean> {
  return page.evaluate(
    (expectedLabel) => {
      return Array.from(document.querySelectorAll('[aria-label]')).some(
        (node) => node.getAttribute('aria-label') === expectedLabel,
      )
    },
    label,
  )
}

async function hasMirroredLabelContaining(page: Page, snippet: string): Promise<boolean> {
  return page.evaluate(
    (expectedSnippet) => {
      return Array.from(document.querySelectorAll('[aria-label]')).some((node) => {
        const label = node.getAttribute('aria-label')
        return typeof label === 'string' && label.includes(expectedSnippet)
      })
    },
    snippet,
  )
}

async function expectMirroredLabel(page: Page, label: string): Promise<void> {
  await expect
    .poll(() => hasMirroredLabel(page, label), {
      message: `Expected accessibility mirror label "${label}"`,
    })
    .toBe(true)
}

async function expectMirroredLabelContaining(page: Page, snippet: string): Promise<void> {
  await expect
    .poll(() => hasMirroredLabelContaining(page, snippet), {
      message: `Expected accessibility mirror text containing "${snippet}"`,
    })
    .toBe(true)
}

async function clickCanvas(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.locator('canvas')
  await canvas.click({ position: { x, y } })
}

async function dragSelect(page: Page, startX: number, startY: number, endX: number, endY: number): Promise<void> {
  const box = await page.locator('canvas').boundingBox()
  if (!box) {
    throw new Error('Canvas bounding box unavailable')
  }
  await page.mouse.move(box.x + startX, box.y + startY)
  await page.mouse.down()
  await page.mouse.move(box.x + endX, box.y + endY, { steps: 12 })
  await page.mouse.up()
}

test('full-stack demo supports routed actions, dialog flows, and text selection/copy', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173',
  })

  await page.goto('/')
  await expectMirroredLabel(page, 'Live deploy health')

  await clickCanvas(page, 145, 184)
  await expectMirroredLabel(page, 'Command deck')

  await clickCanvas(page, 430, 245)
  await expectMirroredLabelContaining(page, 'Approved Payments. Queue data revalidated on the server.')

  await clickCanvas(page, 430, 365)
  await expectMirroredLabelContaining(page, 'Promoted a hotfix and refreshed overview release health.')

  // Skip the non-interactive table header row; first data row is one row below.
  await clickCanvas(page, 760, 338)
  await expectMirroredLabelContaining(page, 'Selected Edge cache (P2) routed to Platform.')

  await clickCanvas(page, 430, 384)
  // In GEOMETRA_E2E the server skips the settings toast so banner height matches stable layout for canvas hits.
  await expectMirroredLabelContaining(page, '/settings')

  await clickCanvas(page, 145, 233)
  await expectMirroredLabel(page, 'Appearance')

  // E2E server seeds draft + auto-submits settings action after navigation (see full-stack-dashboard loader).
  await expectMirroredLabelContaining(page, 'Saved Warm Ember with compact mode on.')

  await dragSelect(page, 56, 330, 210, 330)
  await page.keyboard.press(`${COPY_MODIFIER}+c`)
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('The same route tree drives')
})

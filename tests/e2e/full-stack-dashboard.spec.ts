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

// Generous CI-friendly poll budget. The full cycle behind each assertion is
// click → server route → state mutation → WS broadcast → client render → a11y
// mirror DOM patch, and on a cold/loaded CI runner the third or fourth
// interaction in a sequence has been observed to push past Playwright's 5s
// default. Locally the same assertions resolve in well under 100ms, so the
// bump is purely flake tolerance — a real regression will still surface.
const MIRROR_POLL_TIMEOUT_MS = process.env.CI ? 30_000 : 15_000

async function expectMirroredLabel(page: Page, label: string): Promise<void> {
  await expect
    .poll(() => hasMirroredLabel(page, label), {
      message: `Expected accessibility mirror label "${label}"`,
      timeout: MIRROR_POLL_TIMEOUT_MS,
    })
    .toBe(true)
}

async function expectMirroredLabelContaining(page: Page, snippet: string): Promise<void> {
  await expect
    .poll(() => hasMirroredLabelContaining(page, snippet), {
      message: `Expected accessibility mirror text containing "${snippet}"`,
      timeout: MIRROR_POLL_TIMEOUT_MS,
    })
    .toBe(true)
}

async function clickCanvas(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.locator('canvas')
  await canvas.click({ position: { x, y } })
}

async function getMirroredLabelBounds(
  page: Page,
  label: string,
  options: { exact?: boolean } = {},
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate(
    ({ expectedLabel, exact }) => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('[aria-label]'))
      const target = nodes.find((node) => {
        const current = node.getAttribute('aria-label')
        if (typeof current !== 'string') return false
        return exact ? current === expectedLabel : current.includes(expectedLabel)
      })
      if (!target) return null
      const left = Number.parseFloat(target.style.left || '0')
      const top = Number.parseFloat(target.style.top || '0')
      const width = Number.parseFloat(target.style.width || '1')
      const height = Number.parseFloat(target.style.height || '1')
      return { x: left, y: top, width, height }
    },
    { expectedLabel: label, exact: options.exact === true },
  )
}

async function clickMirroredLabel(
  page: Page,
  label: string,
  options: { exact?: boolean } = {},
): Promise<void> {
  const bounds = await getMirroredLabelBounds(page, label, options)

  if (!bounds) {
    throw new Error(`Accessibility mirror target not found: ${label}`)
  }

  await clickCanvas(
    page,
    bounds.x + Math.max(1, bounds.width) / 2,
    bounds.y + Math.max(1, bounds.height) / 2,
  )
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
  await page.keyboard.press(`${COPY_MODIFIER}+a`)
  await page.keyboard.press(`${COPY_MODIFIER}+c`)
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('The same route tree drives')

  await clickMirroredLabel(page, 'Queue', { exact: true })
  await expectMirroredLabel(page, 'Command deck')

  await clickMirroredLabel(page, 'Approve next green rollout', { exact: true })
  await expectMirroredLabelContaining(page, 'Approved Payments. Queue data revalidated on the server.')

  await clickMirroredLabel(page, 'Promote checkout hotfix', { exact: true })
  await expectMirroredLabelContaining(page, 'Promoted a hotfix and refreshed overview release health.')

  await clickMirroredLabel(page, 'Approval lane Edge cache', { exact: true })
  await expectMirroredLabelContaining(page, 'Selected Edge cache (P2) routed to Platform.')

  await clickMirroredLabel(page, 'Open settings route', { exact: true })
  await expectMirroredLabelContaining(page, '/settings')

  await expectMirroredLabel(page, 'Appearance')

  // E2E server seeds draft + auto-submits settings action after navigation (see full-stack-dashboard loader).
  await expectMirroredLabelContaining(page, 'Saved Warm Ember with compact mode on.')
})

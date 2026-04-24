import { expect, test, type Page } from '@playwright/test'

async function canvasHasVisualVariance(page: Page): Promise<boolean> {
  return page.locator('canvas').evaluate(async (canvas) => {
    if (canvas.width <= 0 || canvas.height <= 0) return false

    const dataUrl = canvas.toDataURL('image/png')
    const img = new Image()
    img.src = dataUrl
    await img.decode()

    const probe = document.createElement('canvas')
    probe.width = Math.min(220, canvas.width)
    probe.height = Math.min(160, canvas.height)
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false

    ctx.drawImage(img, 0, 0, probe.width, probe.height)
    const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data
    let minLuma = 255
    let maxLuma = 0
    let coloredSamples = 0

    for (let y = 0; y < probe.height; y += 8) {
      for (let x = 0; x < probe.width; x += 8) {
        const i = (y * probe.width + x) * 4
        const r = pixels[i] ?? 0
        const g = pixels[i + 1] ?? 0
        const b = pixels[i + 2] ?? 0
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        minLuma = Math.min(minLuma, luma)
        maxLuma = Math.max(maxLuma, luma)
        if (Math.max(r, g, b) - Math.min(r, g, b) > 24) coloredSamples++
      }
    }

    return maxLuma - minLuma > 30 || coloredSamples > 4
  })
}

async function browserCanCreateWebGPUAdapter(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const gpu = (navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> }
    }).gpu
    if (!gpu) return false
    const adapter = await gpu.requestAdapter().catch(() => null)
    return adapter !== null
  })
}

test('main demo boots into Geometra-owned canvas UI', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.locator('[aria-label="THE GEOMETRY PROTOCOL FOR UI"]')).toBeAttached()
})

test('WebGPU diagnostic page paints through the fallback renderer by default', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await page.goto('/webgpu.html')
  await expect(page.locator('canvas')).toBeVisible()
  await expect.poll(() => canvasHasVisualVariance(page)).toBe(true)
  expect(consoleErrors).toEqual([])
})

test('forced WebGPU path initializes and paints when the browser supports it', async ({ page }) => {
  await page.goto('/webgpu.html')
  test.skip(!await browserCanCreateWebGPUAdapter(page), 'Browser did not expose a WebGPU adapter in this environment')

  const runtimeErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') runtimeErrors.push(msg.text())
  })
  page.on('pageerror', err => runtimeErrors.push(err.message))

  await page.goto('/webgpu.html?forceWebGPU=1')
  await expect(page.locator('canvas')).toBeVisible()
  await expect.poll(() => canvasHasVisualVariance(page)).toBe(true)
  expect(runtimeErrors).toEqual([])
})

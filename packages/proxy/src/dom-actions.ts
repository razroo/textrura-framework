import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from 'playwright'

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * Resolve and validate paths on the machine running the proxy (not the agent host).
 */
export function resolveExistingFiles(rawPaths: unknown[]): string[] {
  if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
    throw new Error('file: paths must be a non-empty array of strings')
  }
  const paths: string[] = []
  for (const p of rawPaths) {
    if (typeof p !== 'string' || p.trim() === '') continue
    paths.push(resolve(p))
  }
  if (paths.length === 0) throw new Error('file: paths must contain at least one non-empty string')
  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`file: path does not exist: ${p}`)
  }
  return paths
}

/**
 * Attach files via Playwright: either click (x,y) to open a file chooser, or set on the first
 * `input[type=file]` in any frame.
 */
export async function attachFiles(
  page: Page,
  paths: string[],
  clickX?: number,
  clickY?: number,
): Promise<void> {
  if (clickX !== undefined && clickY !== undefined && Number.isFinite(clickX) && Number.isFinite(clickY)) {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 12_000 }),
      page.mouse.click(clickX, clickY),
    ])
    await chooser.setFiles(paths)
    return
  }
  for (const frame of page.frames()) {
    const loc = frame.locator('input[type="file"]')
    const n = await loc.count()
    if (n > 0) {
      await loc.first().setInputFiles(paths)
      return
    }
  }
  throw new Error(
    'file: no input[type=file] in any frame; pass x,y (center of upload control) to trigger a file chooser',
  )
}

export interface SelectOptionPayload {
  value?: string
  label?: string
  index?: number
}

/**
 * Click (x,y) then set value on the focused `<select>` in whichever frame owns focus.
 */
export async function selectNativeOption(page: Page, x: number, y: number, opt: SelectOptionPayload): Promise<void> {
  if (opt.value === undefined && opt.label === undefined && opt.index === undefined) {
    throw new Error('selectOption: provide at least one of value, label, or index')
  }
  await page.mouse.click(x, y)
  await delay(40)
  for (const frame of page.frames()) {
    const applied = await frame.evaluate(
      (payload: { value: string | null; label: string | null; index: number | undefined }) => {
        const a = document.activeElement
        if (!a || a.tagName !== 'SELECT') return false
        const sel = a as HTMLSelectElement
        if (typeof payload.index === 'number' && Number.isFinite(payload.index)) {
          const i = Math.trunc(payload.index)
          if (i < 0 || i >= sel.options.length) return false
          sel.selectedIndex = i
        } else if (payload.value !== null && payload.value !== undefined) {
          sel.value = payload.value
        } else if (payload.label !== null && payload.label !== undefined) {
          const optEl = Array.from(sel.options).find(
            o => o.text.trim() === payload.label || o.text.includes(payload.label!),
          )
          if (!optEl) return false
          sel.value = optEl.value
        } else {
          return false
        }
        sel.dispatchEvent(new Event('input', { bubbles: true }))
        sel.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      },
      {
        value: opt.value ?? null,
        label: opt.label ?? null,
        index: typeof opt.index === 'number' && Number.isFinite(opt.index) ? opt.index : undefined,
      },
    )
    if (applied) return
  }
  throw new Error(
    'selectOption: no focused <select> after click — try clicking the select center, or use geometra_click on custom dropdowns',
  )
}

export async function wheelAt(page: Page, deltaX: number, deltaY: number, x?: number, y?: number): Promise<void> {
  if (x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y)) {
    await page.mouse.move(x, y)
  }
  await page.mouse.wheel(deltaX, deltaY)
}

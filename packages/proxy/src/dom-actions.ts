import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from 'playwright'

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export type FileAttachStrategy = 'auto' | 'chooser' | 'hidden' | 'drop'

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

async function attachHiddenInAllFrames(page: Page, paths: string[]): Promise<boolean> {
  for (const frame of page.frames()) {
    const loc = frame.locator('input[type="file"]')
    const n = await loc.count()
    for (let i = 0; i < n; i++) {
      try {
        await loc.nth(i).setInputFiles(paths)
        return true
      } catch {
        /* try next */
      }
    }
  }
  return false
}

async function attachViaChooser(page: Page, paths: string[], clickX: number, clickY: number): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 12_000 }),
    page.mouse.click(clickX, clickY),
  ])
  await chooser.setFiles(paths)
}

/** Synthetic drop at (x,y) using file bytes from the proxy host (targets elementFromPoint). */
async function attachViaDropPlaywright(page: Page, paths: string[], dropX: number, dropY: number): Promise<void> {
  const fs = await import('node:fs/promises')
  const buffers = await Promise.all(paths.map(p => fs.readFile(p)))
  const names = paths.map(p => p.split(/[/\\\\]/).pop() ?? 'file')
  await page.mouse.move(dropX, dropY)
  await page.mainFrame().evaluate(
    ({ bufs, ns, x, y }: { bufs: number[][]; ns: string[]; x: number; y: number }) => {
      const dt = new DataTransfer()
      for (let i = 0; i < bufs.length; i++) {
        const u8 = new Uint8Array(bufs[i]!)
        const blob = new Blob([u8])
        dt.items.add(new File([blob], ns[i]!, { type: 'application/octet-stream' }))
      }
      const target = document.elementFromPoint(x, y) ?? document.body
      target.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }),
      )
    },
    { bufs: buffers.map(b => Array.from(b)), ns: names, x: dropX, y: dropY },
  )
}

/**
 * `strategy`:
 * - `chooser` — requires x,y; opens native file chooser.
 * - `hidden` — `setInputFiles({ force: true })` on every `input[type=file]` until one succeeds.
 * - `drop` — requires dropX, dropY; synthetic drop with file payloads at coordinates.
 * - `auto` — chooser if x,y; else hidden; if hidden fails, first visible file input without force.
 */
export async function attachFiles(
  page: Page,
  paths: string[],
  opts?: {
    clickX?: number
    clickY?: number
    strategy?: FileAttachStrategy
    dropX?: number
    dropY?: number
  },
): Promise<void> {
  const strategy = opts?.strategy ?? 'auto'
  const clickX = opts?.clickX
  const clickY = opts?.clickY
  const dropX = opts?.dropX
  const dropY = opts?.dropY

  if (strategy === 'chooser' || (strategy === 'auto' && clickX !== undefined && clickY !== undefined)) {
    if (clickX === undefined || clickY === undefined) {
      throw new Error('file: chooser strategy requires x,y click coordinates')
    }
    await attachViaChooser(page, paths, clickX, clickY)
    return
  }

  if (strategy === 'hidden' || strategy === 'auto') {
    if (await attachHiddenInAllFrames(page, paths)) return
    if (strategy === 'hidden') {
      throw new Error('file: hidden strategy could not set any input[type=file]')
    }
  }

  if (strategy === 'drop' || (strategy === 'auto' && dropX !== undefined && dropY !== undefined)) {
    if (dropX === undefined || dropY === undefined) {
      throw new Error('file: drop strategy requires dropX, dropY')
    }
    await attachViaDropPlaywright(page, paths, dropX, dropY)
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
    'file: no input[type=file] in any frame; pass x,y (chooser), dropX/dropY (drop), or strategy hidden',
  )
}

export interface SelectOptionPayload {
  value?: string
  label?: string
  index?: number
}

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
    'selectOption: no focused <select> after click — use geometra_pick_listbox_option for custom dropdowns',
  )
}

/**
 * Custom listbox / combobox (ARIA): optional click to open, then `getByRole('option')`.
 */
export async function pickListboxOption(
  page: Page,
  label: string,
  opts?: { exact?: boolean; openX?: number; openY?: number },
): Promise<void> {
  if (opts?.openX !== undefined && opts?.openY !== undefined) {
    await page.mouse.click(opts.openX, opts.openY)
    await delay(120)
  }
  const opt = page.getByRole('option', { name: label, exact: opts?.exact ?? false }).first()
  await opt.waitFor({ state: 'visible', timeout: 8000 })
  await opt.click()
}

export interface SetCheckedPayload {
  checked?: boolean
  exact?: boolean
  controlType?: 'checkbox' | 'radio'
}

/**
 * Set a checkbox/radio by accessible label instead of brittle coordinate clicks.
 * Helps custom form UIs that keep the real control opacity-hidden but still interactive.
 */
export async function setCheckedControl(page: Page, label: string, opts?: SetCheckedPayload): Promise<void> {
  const exact = opts?.exact ?? false
  const desiredChecked = opts?.checked ?? true
  const controlType = opts?.controlType

  for (const frame of page.frames()) {
    const result = await frame.evaluate(
      (payload: { label: string; exact: boolean; checked: boolean; controlType: 'checkbox' | 'radio' | null }) => {
        function normalize(value: string): string {
          return value.replace(/\s+/g, ' ').trim().toLowerCase()
        }

        function matchesLabel(candidate: string | undefined): boolean {
          if (!candidate) return false
          const normalizedCandidate = normalize(candidate)
          const normalizedNeedle = normalize(payload.label)
          return payload.exact ? normalizedCandidate === normalizedNeedle : normalizedCandidate.includes(normalizedNeedle)
        }

        function visible(el: HTMLElement): boolean {
          const rect = el.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return false
          const style = getComputedStyle(el)
          return style.display !== 'none' && style.visibility !== 'hidden'
        }

        function referencedText(ids: string | null): string | undefined {
          if (!ids) return undefined
          const text = ids
            .split(/\s+/)
            .map(id => document.getElementById(id)?.textContent?.trim() ?? '')
            .filter(Boolean)
            .join(' ')
            .trim()
          return text || undefined
        }

        function controlKind(el: Element): 'checkbox' | 'radio' | undefined {
          if (el instanceof HTMLInputElement) {
            if (el.type === 'checkbox') return 'checkbox'
            if (el.type === 'radio') return 'radio'
            return undefined
          }
          const role = el.getAttribute('role')
          if (role === 'switch' || role === 'checkbox') return 'checkbox'
          if (role === 'radio') return 'radio'
          return undefined
        }

        function controlName(el: Element): string | undefined {
          const aria = el.getAttribute('aria-label')?.trim()
          if (aria) return aria
          const labelledBy = referencedText(el.getAttribute('aria-labelledby'))
          if (labelledBy) return labelledBy
          if (el instanceof HTMLInputElement) {
            const labels = el.labels ? Array.from(el.labels) : []
            for (const labelEl of labels) {
              const text = labelEl.textContent?.trim()
              if (text) return text
            }
            const nameAttr = el.getAttribute('name')?.trim()
            if (nameAttr && /[A-Za-z]/.test(nameAttr) && /[\s,./()_-]/.test(nameAttr)) return nameAttr
          }
          const text = el.textContent?.trim()
          return text || undefined
        }

        function readChecked(el: Element): boolean {
          if (el instanceof HTMLInputElement) return !!el.checked
          return el.getAttribute('aria-checked') === 'true'
        }

        function clickTarget(el: Element): HTMLElement | null {
          if (el instanceof HTMLInputElement) {
            const labelEl = el.labels?.[0]
            if (labelEl instanceof HTMLElement) return labelEl
          }
          return el instanceof HTMLElement ? el : null
        }

        const selector = 'input[type=\"checkbox\"], input[type=\"radio\"], [role=\"checkbox\"], [role=\"radio\"], [role=\"switch\"]'
        const candidates = Array.from(document.querySelectorAll(selector)).filter(
          (el): el is HTMLElement => el instanceof HTMLElement && visible(el),
        )
        const target = candidates.find((el) => {
          const kind = controlKind(el)
          if (!kind) return false
          if (payload.controlType && kind !== payload.controlType) return false
          return matchesLabel(controlName(el))
        })

        if (!target) {
          return { matched: false as const }
        }

        const kind = controlKind(target)!
        const name = controlName(target) ?? payload.label
        const before = readChecked(target)
        if (kind === 'radio' && payload.checked === false) {
          return { matched: true as const, success: before === false, reason: 'radio-uncheck' as const, kind, name }
        }

        if (before !== payload.checked) {
          clickTarget(target)?.click()
        }

        let after = readChecked(target)
        if (after !== payload.checked && target instanceof HTMLInputElement) {
          target.checked = payload.checked
          target.dispatchEvent(new Event('input', { bubbles: true }))
          target.dispatchEvent(new Event('change', { bubbles: true }))
          after = target.checked
        }

        return {
          matched: true as const,
          success: after === payload.checked,
          kind,
          name,
          before,
          after,
        }
      },
      { label, exact, checked: desiredChecked, controlType: controlType ?? null },
    )

    if (!result.matched) continue
    if (result.success) return
    if (result.reason === 'radio-uncheck') {
      throw new Error(`setChecked: radio "${result.name}" cannot be unchecked directly; choose a different option instead`)
    }
    throw new Error(`setChecked: matched ${result.kind} "${result.name}" but could not set it to ${String(desiredChecked)}`)
  }

  const kindLabel = controlType ?? 'checkbox/radio'
  throw new Error(`setChecked: no visible ${kindLabel} matching "${label}"`)
}

export async function wheelAt(page: Page, deltaX: number, deltaY: number, x?: number, y?: number): Promise<void> {
  if (x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y)) {
    await page.mouse.move(x, y)
  }
  await page.mouse.wheel(deltaX, deltaY)
}

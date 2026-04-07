import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Frame, Locator, Page } from 'playwright'

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export type FileAttachStrategy = 'auto' | 'chooser' | 'hidden' | 'drop'

const LABELED_CONTROL_SELECTOR =
  'input, select, textarea, button, [role="combobox"], [role="textbox"], [aria-haspopup="listbox"], [contenteditable="true"]'

const OPTION_PICKER_SELECTOR =
  '[role="option"], [role="menuitem"], [role="treeitem"], button, li, [data-value], [aria-selected], [aria-checked]'

async function firstVisible(
  locator: Locator,
  opts?: { minWidth?: number; minHeight?: number; maxCandidates?: number; fallbackToAnyVisible?: boolean },
): Promise<Locator | null> {
  try {
    const count = Math.min(await locator.count(), opts?.maxCandidates ?? 8)
    let firstAnyVisible: Locator | null = null
    for (let i = 0; i < count; i++) {
      const candidate = locator.nth(i)
      if (!(await candidate.isVisible())) continue
      if (!firstAnyVisible) firstAnyVisible = candidate
      const box = await candidate.boundingBox()
      if (!box) continue
      if ((opts?.minWidth ?? 0) <= box.width && (opts?.minHeight ?? 0) <= box.height) {
        return candidate
      }
    }
    return opts?.fallbackToAnyVisible === false ? null : firstAnyVisible
  } catch {
    /* ignore */
  }
  return null
}

async function locatorIsEditable(locator: Locator): Promise<boolean> {
  try {
    return await locator.evaluate((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true
      return el instanceof HTMLElement && el.isContentEditable
    })
  } catch {
    return false
  }
}

async function locatorAnchorY(locator: Locator): Promise<number | undefined> {
  const bounds = await locator.boundingBox()
  return bounds ? bounds.y + bounds.height / 2 : undefined
}

async function findLabeledControl(frame: Frame, fieldLabel: string, exact: boolean): Promise<Locator | null> {
  const directCandidates = [
    frame.getByLabel(fieldLabel, { exact }),
    frame.getByRole('combobox', { name: fieldLabel, exact }),
    frame.getByRole('textbox', { name: fieldLabel, exact }),
    frame.getByRole('button', { name: fieldLabel, exact }),
  ]

  for (const candidate of directCandidates) {
    const visible = await firstVisible(candidate, { minWidth: 48, minHeight: 18, fallbackToAnyVisible: false })
    if (visible) return visible
  }

  const fallbackCandidates = frame.locator(LABELED_CONTROL_SELECTOR)
  const count = await fallbackCandidates.count()
  if (count === 0) return null

  const bestIndex = await fallbackCandidates.evaluateAll((elements, payload) => {
    function normalize(value: string): string {
      return value.replace(/\s+/g, ' ').trim().toLowerCase()
    }

    function matches(candidate: string | undefined): boolean {
      if (!candidate) return false
      const normalizedCandidate = normalize(candidate)
      const normalizedExpected = normalize(payload.fieldLabel)
      if (!normalizedCandidate || !normalizedExpected) return false
      return payload.exact ? normalizedCandidate === normalizedExpected : normalizedCandidate.includes(normalizedExpected)
    }

    function visible(el: Element): el is HTMLElement {
      if (!(el instanceof HTMLElement)) return false
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      const style = getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
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

    function explicitLabelText(el: Element): string | undefined {
      const aria = el.getAttribute('aria-label')?.trim()
      if (aria) return aria
      const labelledBy = referencedText(el.getAttribute('aria-labelledby'))
      if (labelledBy) return labelledBy
      if (
        (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) &&
        el.labels &&
        el.labels.length > 0
      ) {
        return el.labels[0]?.textContent?.trim() || undefined
      }
      if (el instanceof HTMLElement && el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
        const text = label?.textContent?.trim()
        if (text) return text
      }
      return undefined
    }

    function controlPriority(el: Element): number {
      const rect = el.getBoundingClientRect()
      const sizePenalty = rect.width < 48 || rect.height < 18 ? 180 : 0
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        return sizePenalty
      }
      const role = el.getAttribute('role')
      if (role === 'combobox' || role === 'textbox') return 4 + sizePenalty
      if (el.getAttribute('aria-haspopup') === 'listbox') return 8 + sizePenalty
      if (el.tagName.toLowerCase() === 'button') return 12 + sizePenalty
      return 24 + sizePenalty
    }

    const labelNodes = Array.from(document.querySelectorAll('label, legend')).filter((el): el is HTMLElement => visible(el))

    let best: { index: number; score: number } | null = null
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      if (!(el instanceof Element)) continue
      if (!visible(el)) continue

      const explicit = explicitLabelText(el)
      if (matches(explicit)) {
        const score = controlPriority(el)
        if (!best || score < best.score) best = { index: i, score }
        continue
      }

      const rect = el.getBoundingClientRect()
      for (const labelNode of labelNodes) {
        const labelText = labelNode.textContent?.trim()
        if (!matches(labelText)) continue

        const labelRect = labelNode.getBoundingClientRect()
        const horizontalOverlap = Math.min(rect.right, labelRect.right) - Math.max(rect.left, labelRect.left)
        const horizontalDistance =
          horizontalOverlap >= 0
            ? 0
            : Math.min(Math.abs(rect.left - labelRect.right), Math.abs(labelRect.left - rect.right))
        const verticalDistance =
          rect.top >= labelRect.bottom - 12
            ? rect.top - labelRect.bottom
            : 200 + Math.abs(rect.top - labelRect.top)
        const score = 100 + verticalDistance * 3 + horizontalDistance + controlPriority(el)
        if (!best || score < best.score) best = { index: i, score }
      }
    }

    return best?.index ?? -1
  }, { fieldLabel, exact })

  return bestIndex >= 0 ? fallbackCandidates.nth(bestIndex) : null
}

function textMatches(candidate: string | undefined, expected: string, exact: boolean): boolean {
  if (!candidate) return false
  const normalizedCandidate = candidate.replace(/\s+/g, ' ').trim().toLowerCase()
  const normalizedExpected = expected.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!normalizedCandidate || !normalizedExpected) return false
  return exact ? normalizedCandidate === normalizedExpected : normalizedCandidate.includes(normalizedExpected)
}

async function openDropdownControl(
  page: Page,
  fieldLabel: string,
  exact: boolean,
): Promise<{ locator: Locator; editable: boolean; anchorY?: number }> {
  for (const frame of page.frames()) {
    const locator = await findLabeledControl(frame, fieldLabel, exact)
    if (!locator) continue
    await locator.scrollIntoViewIfNeeded()
    const anchorY = await locatorAnchorY(locator)
    const editable = await locatorIsEditable(locator)
    await locator.click()
    return { locator, editable, anchorY }
  }

  throw new Error(`listboxPick: no visible combobox/dropdown matching field "${fieldLabel}"`)
}

async function typeIntoEditableLocator(page: Page, locator: Locator, text: string): Promise<void> {
  try {
    await locator.fill(text)
    return
  } catch {
    /* fall through */
  }

  await locator.click()
  await page.keyboard.type(text)
}

async function typeIntoActiveEditableElement(page: Page, text: string): Promise<boolean> {
  for (const frame of page.frames()) {
    const editableFocused = await frame.evaluate(() => {
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        active.value = ''
        active.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      }
      if (active instanceof HTMLElement && active.isContentEditable) {
        active.textContent = ''
        return true
      }
      return false
    })

    if (editableFocused) {
      await page.keyboard.type(text)
      return true
    }
  }

  return false
}

async function clickVisibleOptionCandidate(
  page: Page,
  label: string,
  exact: boolean,
  anchorY?: number,
): Promise<boolean> {
  const roleOption = await firstVisible(page.getByRole('option', { name: label, exact }))
  if (roleOption) {
    await roleOption.click()
    return true
  }

  for (const frame of page.frames()) {
    const candidates = frame.locator(OPTION_PICKER_SELECTOR)
    const count = await candidates.count()
    if (count === 0) continue

    const bestIndex = await candidates.evaluateAll((elements, payload) => {
      function normalize(value: string): string {
        return value.replace(/\s+/g, ' ').trim().toLowerCase()
      }

      function matches(candidate: string | undefined): boolean {
        if (!candidate) return false
        const normalizedCandidate = normalize(candidate)
        const normalizedExpected = normalize(payload.label)
        if (!normalizedCandidate || !normalizedExpected) return false
        return payload.exact ? normalizedCandidate === normalizedExpected : normalizedCandidate.includes(normalizedExpected)
      }

      function visible(el: Element): el is HTMLElement {
        if (!(el instanceof HTMLElement)) return false
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return false
        const style = getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }

      function popupWeight(el: HTMLElement): number {
        return el.closest(
          '[role="listbox"], [role="menu"], [role="dialog"], [aria-modal="true"], [data-radix-popper-content-wrapper], [class*="menu"], [class*="option"], [class*="select"], [class*="dropdown"]',
        )
          ? 0
          : 220
      }

      let best: { index: number; score: number } | null = null
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        if (!(el instanceof Element)) continue
        if (!visible(el)) continue

        const candidateText = el.getAttribute('aria-label')?.trim() || el.textContent?.trim() || ''
        if (!matches(candidateText)) continue

        const rect = el.getBoundingClientRect()
        const centerY = rect.top + rect.height / 2
        const upwardPenalty =
          payload.anchorY === null || centerY >= payload.anchorY - 16
            ? 0
            : 140
        const proximity = payload.anchorY === null ? rect.top : Math.abs(centerY - payload.anchorY)
        const score = popupWeight(el) + upwardPenalty + proximity
        if (!best || score < best.score) best = { index: i, score }
      }

      return best?.index ?? -1
    }, { label, exact, anchorY: anchorY ?? null })

    if (bestIndex >= 0) {
      await candidates.nth(bestIndex).click()
      return true
    }
  }

  return false
}

async function locatorDisplayedValue(locator: Locator): Promise<string | undefined> {
  try {
    return await locator.evaluate((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return el.value?.trim() || el.getAttribute('aria-valuetext')?.trim() || el.getAttribute('aria-label')?.trim() || undefined
      }
      if (el instanceof HTMLSelectElement) {
        return el.selectedOptions[0]?.textContent?.trim() || el.value?.trim() || undefined
      }
      const ariaValueText = el.getAttribute('aria-valuetext')?.trim()
      if (ariaValueText) return ariaValueText
      const ariaLabel = el.getAttribute('aria-label')?.trim()
      if (ariaLabel) return ariaLabel
      const text = el.textContent?.trim()
      return text || undefined
    })
  } catch {
    return undefined
  }
}

async function confirmListboxSelection(
  page: Page,
  fieldLabel: string,
  label: string,
  exact: boolean,
): Promise<boolean> {
  const deadline = Date.now() + 1500
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const locator = await findLabeledControl(frame, fieldLabel, exact)
      if (!locator) continue
      const value = await locatorDisplayedValue(locator)
      if (textMatches(value, label, exact)) return true
    }
    await delay(100)
  }
  return false
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
  opts?: { exact?: boolean; openX?: number; openY?: number; fieldLabel?: string; query?: string },
): Promise<void> {
  let anchorY: number | undefined
  const exact = opts?.exact ?? false
  let attemptedSelection = false

  if (opts?.fieldLabel) {
    const opened = await openDropdownControl(page, opts.fieldLabel, exact)
    anchorY = opened.anchorY
    const query = opts.query ?? label
    if (query && opened.editable) {
      await typeIntoEditableLocator(page, opened.locator, query)
      await delay(80)
    } else if (query && await typeIntoActiveEditableElement(page, query)) {
      await delay(80)
    }
  } else if (opts?.openX !== undefined && opts?.openY !== undefined) {
    await page.mouse.click(opts.openX, opts.openY)
    anchorY = opts.openY
    await delay(120)
  }

  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    if (await clickVisibleOptionCandidate(page, label, exact, anchorY)) {
      attemptedSelection = true
      if (!opts?.fieldLabel || await confirmListboxSelection(page, opts.fieldLabel, label, exact)) return
    }
    await delay(120)
  }

  if (opts?.fieldLabel && attemptedSelection) {
    throw new Error(`listboxPick: selected "${label}" but could not confirm it on field "${opts.fieldLabel}"`)
  }
  throw new Error(`listboxPick: no visible option matching "${label}"`)
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

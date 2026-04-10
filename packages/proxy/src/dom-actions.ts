import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ElementHandle, Frame, Locator, Page } from 'playwright'
import type { ClientChoiceType, ClientFillField } from './types.js'

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export type FileAttachStrategy = 'auto' | 'chooser' | 'hidden' | 'drop'

const LABELED_CONTROL_SELECTOR =
  'input, select, textarea, button, [role="combobox"], [role="textbox"], [aria-haspopup="listbox"], [contenteditable="true"]'

const POPUP_CONTAINER_SELECTOR =
  '[role="listbox"], [role="menu"], [role="dialog"], [aria-modal="true"], [data-radix-popper-content-wrapper], [class*="menu"], [class*="option"], [class*="select"], [class*="dropdown"]'

const POPUP_ROOT_SELECTOR =
  '[role="listbox"], [role="menu"], [role="dialog"], [aria-modal="true"], [data-radix-popper-content-wrapper], [class*="menu"], [class*="dropdown"], [class*="popover"], [class*="listbox"], [class*="options"]'

const OPTION_PICKER_SELECTOR =
  [
    '[role="option"]',
    '[role="menuitem"]',
    '[role="treeitem"]',
    'button',
    'li',
    '[data-value]',
    '[aria-selected]',
    '[aria-checked]',
    '[role="listbox"] > *',
    '[role="menu"] > *',
    '[class*="option"]',
    '[class*="menu-item"]',
    '[class*="dropdown-item"]',
    '[class*="listbox-option"]',
  ].join(', ')

const MAX_VISIBLE_OPTION_HINTS = 12
const LISTBOX_KEYBOARD_FALLBACK_STEPS = 40

interface AnchorPoint {
  x?: number
  y?: number
}

export interface FillLookupCache {
  control: Map<string, Locator | null>
  editable: Map<string, Locator | null>
  fileInput: Map<string, Locator | null>
}

export function createFillLookupCache(): FillLookupCache {
  return {
    control: new Map(),
    editable: new Map(),
    fileInput: new Map(),
  }
}

export function clearFillLookupCache(cache: FillLookupCache): void {
  cache.control.clear()
  cache.editable.clear()
  cache.fileInput.clear()
}

function lookupCacheKey(kind: 'control' | 'editable' | 'file', label: string, exact: boolean): string {
  return `${kind}:${exact ? 'exact' : 'fuzzy'}:${normalizedOptionLabel(label)}`
}

function lookupCacheKeys(kind: 'control' | 'editable' | 'file', label: string, exact: boolean, fieldId?: string): string[] {
  const keys = [lookupCacheKey(kind, label, exact)]
  if (fieldId) keys.unshift(`${kind}:id:${fieldId}`)
  return keys
}

function cacheMapForKind(cache: FillLookupCache, kind: 'control' | 'editable' | 'file'): Map<string, Locator | null> {
  if (kind === 'control') return cache.control
  if (kind === 'editable') return cache.editable
  return cache.fileInput
}

function readCachedLocator(
  cache: FillLookupCache | undefined,
  kind: 'control' | 'editable' | 'file',
  label: string,
  exact: boolean,
  fieldId?: string,
): Locator | null | undefined {
  if (!cache) return undefined
  const map = cacheMapForKind(cache, kind)
  for (const key of lookupCacheKeys(kind, label, exact, fieldId)) {
    if (map.has(key)) return map.get(key) ?? null
  }
  return undefined
}

function writeCachedLocator(
  cache: FillLookupCache | undefined,
  kind: 'control' | 'editable' | 'file',
  label: string,
  exact: boolean,
  fieldId: string | undefined,
  locator: Locator | null,
): void {
  if (!cache) return
  const map = cacheMapForKind(cache, kind)
  for (const key of lookupCacheKeys(kind, label, exact, fieldId)) {
    map.set(key, locator)
  }
}

function normalizedOptionLabel(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[＋﹢∔]/g, '+')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/&/g, ' and ')
    .replace(/\bplus\b/g, '+')
    .replace(/[,/()]+/g, ' ')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function prefersGroupedChoiceValue(value: string): boolean {
  const normalized = normalizedOptionLabel(value)
  return normalized === 'yes' ||
    normalized === 'no' ||
    normalized === 'true' ||
    normalized === 'false' ||
    normalized === 'decline' ||
    normalized === 'prefer not' ||
    normalized === 'opt out'
}

function semanticSelectionAliases(value: string): string[] {
  const normalized = normalizedOptionLabel(value)
  const aliases = new Set<string>([normalized])
  if (normalized === 'yes' || normalized === 'true') {
    for (const alias of ['agree', 'agreed', 'accept', 'accepted', 'consent', 'acknowledge', 'read', 'opt in']) {
      aliases.add(alias)
    }
  }
  if (normalized === 'no' || normalized === 'false') {
    for (const alias of ['decline', 'declined', 'disagree', 'deny', 'opt out', 'prefer not']) {
      aliases.add(alias)
    }
  }
  if (normalized === 'decline') {
    for (const alias of ['prefer not', 'opt out', 'do not']) {
      aliases.add(alias)
    }
  }
  if (normalized === 'atx' || normalized.includes('austin')) {
    for (const alias of ['atx', 'austin', 'austin tx', 'austin texas']) aliases.add(alias)
  }
  if (normalized === 'nyc' || normalized.includes('new york')) {
    for (const alias of ['nyc', 'new york', 'new york ny']) aliases.add(alias)
  }
  if (normalized === 'sf' || normalized.includes('san francisco')) {
    for (const alias of ['sf', 'san francisco', 'san francisco ca']) aliases.add(alias)
  }
  if (normalized === 'la' || normalized.includes('los angeles')) {
    for (const alias of ['la', 'los angeles', 'los angeles ca']) aliases.add(alias)
  }
  if (normalized === 'dc' || normalized.includes('washington dc')) {
    for (const alias of ['dc', 'washington dc', 'washington d c']) aliases.add(alias)
  }
  if (normalized === 'us' || normalized === 'usa' || normalized.includes('united states')) {
    for (const alias of ['us', 'usa', 'united states']) aliases.add(alias)
  }
  return [...aliases]
}

function hasNegativeSelectionCue(value: string): boolean {
  return /\b(no|not|do not|don't|decline|disagree|deny|opt out|prefer not)\b/.test(value)
}

function hasPositiveSelectionCue(value: string): boolean {
  return /\b(yes|agree|accept|consent|acknowledge|opt in|allow|read)\b/.test(value)
}

function selectionMatchScore(candidate: string | undefined, expected: string, exact: boolean): number | null {
  if (!candidate) return null
  const normalizedCandidate = normalizedOptionLabel(candidate)
  const normalizedExpected = normalizedOptionLabel(expected)
  if (!normalizedCandidate || !normalizedExpected) return null
  const expectsPositive = normalizedExpected === 'yes' || normalizedExpected === 'true'
  const expectsNegative = normalizedExpected === 'no' || normalizedExpected === 'false' || normalizedExpected === 'decline'
  if (exact) return normalizedCandidate === normalizedExpected ? 0 : null
  if (normalizedCandidate === normalizedExpected) return 0
  if (normalizedCandidate.includes(normalizedExpected)) return normalizedCandidate.length - normalizedExpected.length
  if (expectsPositive && hasNegativeSelectionCue(normalizedCandidate)) return null
  if (expectsNegative && hasPositiveSelectionCue(normalizedCandidate)) return null

  const aliases = semanticSelectionAliases(normalizedExpected)
  for (const alias of aliases) {
    if (alias !== normalizedExpected && normalizedCandidate.includes(alias)) {
      return 40 + normalizedCandidate.length - alias.length
    }
  }

  const tokens = normalizedExpected.split(' ').filter(token => token.length >= 3)
  if (tokens.length >= 2) {
    const matchedTokens = tokens.filter(token => normalizedCandidate.includes(token))
    if (matchedTokens.length >= Math.min(2, tokens.length)) {
      return 80 + (tokens.length - matchedTokens.length) * 10
    }
  }

  return null
}

function distanceFromPreferredAnchor(
  box: { x: number; y: number; width: number; height: number },
  anchor?: AnchorPoint,
): number {
  if (anchor?.x === undefined && anchor?.y === undefined) return 0
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  return Math.abs(centerX - (anchor?.x ?? centerX)) + Math.abs(centerY - (anchor?.y ?? centerY))
}

function browserDisplayedValues(el: Element): string[] {
  const values = new Set<string>()
  const push = (value: string | undefined) => {
    const trimmed = value?.trim()
    if (trimmed && trimmed.length <= 240) values.add(trimmed)
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    push(el.value)
    push(el.getAttribute('aria-valuetext') ?? undefined)
    push(el.getAttribute('aria-label') ?? undefined)
  }
  if (el instanceof HTMLSelectElement) {
    push(el.selectedOptions[0]?.textContent ?? undefined)
    push(el.value)
  }
  push(el.getAttribute('aria-valuetext') ?? undefined)
  push(el.getAttribute('aria-label') ?? undefined)
  push(el.textContent ?? undefined)

  let current = el.parentElement
  for (let depth = 0; current && depth < 4; depth++) {
    const role = current.getAttribute('role')
    if (role === 'listbox' || role === 'menu') {
      current = current.parentElement
      continue
    }
    const className = typeof current.className === 'string' ? current.className.toLowerCase() : ''
    const looksLikeFieldContainer =
      role === 'combobox' ||
      current.getAttribute('aria-haspopup') === 'listbox' ||
      current.tagName.toLowerCase() === 'button' ||
      className.includes('select') ||
      className.includes('combo') ||
      className.includes('chip')
    if (looksLikeFieldContainer) push(current.textContent ?? undefined)
    current = current.parentElement
  }

  return [...values]
}

async function firstVisible(
  locator: Locator,
  opts?: {
    minWidth?: number
    minHeight?: number
    maxCandidates?: number
    fallbackToAnyVisible?: boolean
    preferredAnchor?: AnchorPoint
  },
): Promise<Locator | null> {
  try {
    const count = Math.min(await locator.count(), opts?.maxCandidates ?? 8)
    let bestVisible: { locator: Locator; score: number } | null = null
    let bestQualified: { locator: Locator; score: number } | null = null
    for (let i = 0; i < count; i++) {
      const candidate = locator.nth(i)
      if (!(await candidate.isVisible())) continue
      const box = await candidate.boundingBox()
      if (!box) continue
      const score = distanceFromPreferredAnchor(box, opts?.preferredAnchor)
      if (!bestVisible || score < bestVisible.score) {
        bestVisible = { locator: candidate, score }
      }
      if ((opts?.minWidth ?? 0) <= box.width && (opts?.minHeight ?? 0) <= box.height) {
        if (!bestQualified || score < bestQualified.score) {
          bestQualified = { locator: candidate, score }
        }
      }
    }
    if (bestQualified) return bestQualified.locator
    return opts?.fallbackToAnyVisible === false ? null : bestVisible?.locator ?? null
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

async function resolveMeaningfulClickTarget(
  locator: Locator,
): Promise<{ handle: ElementHandle<Element> | null; anchorX?: number; anchorY?: number }> {
  const baseHandle = await locator.elementHandle()
  if (!baseHandle) return { handle: null }

  const targetHandle = (await baseHandle.evaluateHandle((el) => {
    function isTextLikeControl(node: Element): boolean {
      if (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) return true
      if (node instanceof HTMLInputElement) {
        return !['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'hidden', 'range', 'color'].includes(node.type)
      }
      const role = node.getAttribute('role')
      return role === 'textbox' || role === 'combobox'
    }

    function visible(node: Element): node is HTMLElement {
      if (!(node instanceof HTMLElement)) return false
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      const style = getComputedStyle(node)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    }

    if (!(el instanceof HTMLElement)) return el
    const rect = el.getBoundingClientRect()
    if (!isTextLikeControl(el) || (rect.width >= 48 && rect.height >= 18)) return el

    let best: HTMLElement = el
    let bestScore = Number.POSITIVE_INFINITY
    let current = el.parentElement
    let depth = 0

    while (current && depth < 6) {
      if (visible(current)) {
        const candidate = current.getBoundingClientRect()
        const className = typeof current.className === 'string' ? current.className.toLowerCase() : ''
        const role = current.getAttribute('role')
        const looksLikeControl =
          role === 'combobox' ||
          role === 'button' ||
          current.getAttribute('aria-haspopup') === 'listbox' ||
          className.includes('control') ||
          className.includes('select') ||
          className.includes('combo') ||
          className.includes('input')

        if (
          candidate.width >= rect.width &&
          candidate.height >= rect.height &&
          candidate.width > 0 &&
          candidate.height > 0 &&
          candidate.width <= window.innerWidth * 0.98 &&
          candidate.height <= Math.max(window.innerHeight * 0.9, 320) &&
          (candidate.width >= 48 || candidate.height >= 18)
        ) {
          const score = candidate.width * candidate.height + depth * 1000 - (looksLikeControl ? 20000 : 0)
          if (score < bestScore) {
            best = current
            bestScore = score
          }
        }
      }
      current = current.parentElement
      depth++
    }

    return best
  })) as ElementHandle<Element>

  const bounds = await targetHandle.boundingBox()
  return {
    handle: targetHandle,
    anchorX: bounds ? bounds.x + bounds.width / 2 : undefined,
    anchorY: bounds ? bounds.y + bounds.height / 2 : undefined,
  }
}

async function findLabeledControl(
  frame: Frame,
  fieldLabel: string,
  exact: boolean,
  opts?: { preferredAnchor?: AnchorPoint },
): Promise<Locator | null> {
  const directCandidates = [
    frame.getByLabel(fieldLabel, { exact }),
    frame.getByPlaceholder(fieldLabel, { exact }),
    frame.getByRole('combobox', { name: fieldLabel, exact }),
    frame.getByRole('textbox', { name: fieldLabel, exact }),
    frame.getByRole('button', { name: fieldLabel, exact }),
  ]

  for (const candidate of directCandidates) {
    const visible = await firstVisible(candidate, { preferredAnchor: opts?.preferredAnchor })
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

    function referencedText(ids: string | null, visited?: Set<string>): string | undefined {
      if (!ids) return undefined
      const seen = visited ?? new Set<string>()
      const text = ids
        .split(/\s+/)
        .map(id => {
          if (seen.has(id)) return ''
          seen.add(id)
          const target = document.getElementById(id)
          if (!target) return ''
          const chained = target.getAttribute('aria-labelledby')
          if (chained) return referencedText(chained, seen) ?? ''
          return target.textContent?.trim() ?? ''
        })
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
      if (el.parentElement?.tagName.toLowerCase() === 'label') {
        const text = el.parentElement.textContent?.trim()
        if (text) return text
      }
      if (
        (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
        !['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'hidden'].includes(el instanceof HTMLInputElement ? el.type : '')
      ) {
        const placeholder = el.getAttribute('aria-placeholder')?.trim() || el.getAttribute('placeholder')?.trim()
        if (placeholder) return placeholder
      }
      if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type)) {
        const value = el.value?.trim()
        if (value) return value
      }
      const title = el.getAttribute('title')?.trim()
      if (title) return title
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
      const rect = el.getBoundingClientRect()

      const explicit = explicitLabelText(el)
      if (matches(explicit)) {
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const anchorDistance =
          payload.anchorX === null && payload.anchorY === null
            ? 0
            : Math.abs(centerX - (payload.anchorX ?? centerX)) + Math.abs(centerY - (payload.anchorY ?? centerY))
        const score = controlPriority(el) + anchorDistance / 8
        if (!best || score < best.score) best = { index: i, score }
        continue
      }

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
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const anchorDistance =
          payload.anchorX === null && payload.anchorY === null
            ? 0
            : Math.abs(centerX - (payload.anchorX ?? centerX)) + Math.abs(centerY - (payload.anchorY ?? centerY))
        const score = 100 + verticalDistance * 3 + horizontalDistance + anchorDistance / 8 + controlPriority(el)
        if (!best || score < best.score) best = { index: i, score }
      }
    }

    return best?.index ?? -1
  }, {
    fieldLabel,
    exact,
    anchorX: opts?.preferredAnchor?.x ?? null,
    anchorY: opts?.preferredAnchor?.y ?? null,
  })

  return bestIndex >= 0 ? fallbackCandidates.nth(bestIndex) : null
}

async function findLabeledControlInPage(
  page: Page,
  fieldLabel: string,
  exact: boolean,
  opts?: { preferredAnchor?: AnchorPoint; cache?: FillLookupCache; fieldId?: string },
): Promise<Locator | null> {
  const cacheable = !opts?.preferredAnchor
  const cached = cacheable ? readCachedLocator(opts?.cache, 'control', fieldLabel, exact, opts?.fieldId) : undefined
  if (cached !== undefined) {
    return cached
  }

  for (const frame of page.frames()) {
    const locator = await findLabeledControl(frame, fieldLabel, exact, { preferredAnchor: opts?.preferredAnchor })
    if (!locator) continue
    if (cacheable) writeCachedLocator(opts?.cache, 'control', fieldLabel, exact, opts?.fieldId, locator)
    return locator
  }

  if (cacheable) writeCachedLocator(opts?.cache, 'control', fieldLabel, exact, opts?.fieldId, null)
  return null
}

function textMatches(candidate: string | undefined, expected: string, exact: boolean): boolean {
  return selectionMatchScore(candidate, expected, exact) !== null
}

function displayedValueMatchesSelection(
  candidate: string | undefined,
  expected: string,
  exact: boolean,
  selectedOptionText?: string,
): boolean {
  if (textMatches(candidate, expected, exact)) return true
  if (!candidate || !selectedOptionText || exact) return false

  const normalizedCandidate = normalizedOptionLabel(candidate)
  const normalizedSelectedOption = normalizedOptionLabel(selectedOptionText)
  if (!normalizedCandidate || normalizedCandidate.length < 2 || !normalizedSelectedOption) return false

  return (
    normalizedSelectedOption.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedSelectedOption)
  )
}

async function openDropdownControl(
  page: Page,
  fieldLabel: string,
  exact: boolean,
  cache?: FillLookupCache,
  fieldId?: string,
): Promise<{ locator: Locator; handle: ElementHandle<Element> | null; editable: boolean; anchorX?: number; anchorY?: number }> {
  const locator = await findLabeledControlInPage(page, fieldLabel, exact, { cache, fieldId })
  if (locator) {
    await locator.scrollIntoViewIfNeeded()
    const handle = await locator.elementHandle()
    const clickTarget = await resolveMeaningfulClickTarget(locator)
    const editable = await locatorIsEditable(locator)
    if (clickTarget.handle) {
      await clickTarget.handle.scrollIntoViewIfNeeded()
      await clickTarget.handle.click()
    } else {
      await locator.click()
    }

    // Wait for options to render (React comboboxes may load async).
    // Only poll if no popup content is visible yet — avoids adding latency when
    // the dropdown already expanded synchronously.
    const initialOptionCount = await page.locator('[role="option"]').count()
    if (initialOptionCount === 0) {
      const optionDeadline = Date.now() + 1000
      while (Date.now() < optionDeadline) {
        const count = await page.locator('[role="option"]').count()
        if (count > 0) break
        const listboxCount = await page.locator('[role="listbox"] > *').count()
        if (listboxCount > 0) break
        await delay(50)
      }
    }

    return {
      locator,
      handle,
      editable,
      anchorX: clickTarget.anchorX,
      anchorY: clickTarget.anchorY ?? await locatorAnchorY(locator),
    }
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

async function clearEditableLocator(locator: Locator): Promise<boolean> {
  try {
    await locator.fill('')
    return true
  } catch {
    /* fall through */
  }

  try {
    await locator.click()
    await locator.press('ControlOrMeta+A')
    await locator.press('Backspace')
    return true
  } catch {
    return false
  }
}

async function clearActiveEditableElement(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    const cleared = await frame.evaluate(() => {
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        active.value = ''
        active.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      }
      if (active instanceof HTMLElement && active.isContentEditable) {
        active.textContent = ''
        active.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      }
      return false
    })
    if (cleared) return true
  }
  return false
}

async function resetTypedListboxQuery(page: Page, locator?: Locator): Promise<boolean> {
  if (locator && await clearEditableLocator(locator)) return true
  return clearActiveEditableElement(page)
}

async function resolveMeaningfulOptionClickTarget(locator: Locator): Promise<ElementHandle<Element> | null> {
  const baseHandle = await locator.elementHandle()
  if (!baseHandle) return null

  const targetHandle = (await baseHandle.evaluateHandle((el, payload) => {
    function visible(node: Element): node is HTMLElement {
      if (!(node instanceof HTMLElement)) return false
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      const style = getComputedStyle(node)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    }

    function textFor(node: Element): string {
      return node.getAttribute('aria-label')?.trim() || node.textContent?.trim() || ''
    }

    if (!(el instanceof HTMLElement)) return el
    const baseText = textFor(el)
    const popup = el.closest(payload.popupSelector)

    let best: HTMLElement = el
    let bestScore = Number.POSITIVE_INFINITY
    let current: HTMLElement | null = el
    let depth = 0

    while (current && depth < 6) {
      if (visible(current)) {
        const rect = current.getBoundingClientRect()
        const className = typeof current.className === 'string' ? current.className.toLowerCase() : ''
        const role = current.getAttribute('role')
        const tag = current.tagName.toLowerCase()
        const currentText = textFor(current)
        const rowLike =
          role === 'option' ||
          role === 'menuitem' ||
          role === 'treeitem' ||
          tag === 'button' ||
          tag === 'li' ||
          tag === 'label' ||
          current.hasAttribute('data-value') ||
          current.hasAttribute('aria-selected') ||
          current.hasAttribute('aria-checked') ||
          className.includes('option') ||
          className.includes('item') ||
          className.includes('row') ||
          className.includes('menu')
        const textAligned = !!baseText && !!currentText && (currentText === baseText || currentText.includes(baseText))
        const insidePopup = popup ? popup.contains(current) : !!current.closest(payload.popupSelector)
        if ((rowLike || textAligned) && insidePopup) {
          const score =
            rect.width * rect.height +
            depth * 600 -
            (rowLike ? 20_000 : 0) -
            (textAligned ? 8_000 : 0)
          if (score < bestScore) {
            best = current
            bestScore = score
          }
        }
      }
      current = current.parentElement
      depth++
    }

    return best
  }, { popupSelector: POPUP_CONTAINER_SELECTOR })) as ElementHandle<Element>

  return targetHandle
}

async function collectVisibleOptionHints(
  page: Page,
  anchor?: AnchorPoint,
): Promise<{ hasPopup: boolean; options: Array<{ label: string; selected: boolean; highlighted: boolean }> }> {
  const merged = new Map<string, { label: string; selected: boolean; highlighted: boolean; rank: number }>()
  let hasPopup = false

  for (const frame of page.frames()) {
    const snapshot = await frame.evaluate((payload) => {
      function normalize(value: string): string {
        return value
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[＋﹢∔]/g, '+')
          .replace(/[‐‑‒–—―]/g, '-')
          .replace(/&/g, ' and ')
          .replace(/\bplus\b/g, '+')
          .replace(/[,/()]+/g, ' ')
          .replace(/\s*\+\s*/g, '+')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase()
      }

      function visible(el: Element): el is HTMLElement {
        if (!(el instanceof HTMLElement)) return false
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return false
        const style = getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }

      function labelFor(el: Element): string {
        return el.getAttribute('aria-label')?.trim() || el.textContent?.trim() || ''
      }

      function selected(el: Element): boolean {
        return (
          el.getAttribute('aria-selected') === 'true' ||
          el.getAttribute('aria-checked') === 'true' ||
          el.getAttribute('data-selected') === 'true' ||
          el.getAttribute('data-state') === 'checked' ||
          el.getAttribute('data-state') === 'on'
        )
      }

      function highlighted(el: Element): boolean {
        return (
          el === document.activeElement ||
          el.getAttribute('data-highlighted') === 'true' ||
          el.getAttribute('data-focus') === 'true' ||
          el.getAttribute('data-focused') === 'true' ||
          el.getAttribute('data-hovered') === 'true' ||
          el.getAttribute('data-state') === 'active' ||
          el.getAttribute('aria-current') === 'true'
        )
      }

      const popupRoots = Array.from(document.querySelectorAll(payload.popupSelector)).filter((el): el is HTMLElement => visible(el))
      const rows: Array<{ label: string; selected: boolean; highlighted: boolean; rank: number }> = []
      const seen = new Set<string>()

      for (const popup of popupRoots) {
        const candidates = [popup, ...Array.from(popup.querySelectorAll(payload.optionSelector))]
        for (const el of candidates) {
          if (!(el instanceof Element) || !visible(el)) continue
          const className = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className.toLowerCase() : ''
          const role = el.getAttribute('role')
          const tag = el.tagName.toLowerCase()
          const optionLike =
            role === 'option' ||
            role === 'menuitem' ||
            role === 'treeitem' ||
            tag === 'button' ||
            tag === 'li' ||
            tag === 'label' ||
            el.hasAttribute('data-value') ||
            el.hasAttribute('aria-selected') ||
            el.hasAttribute('aria-checked') ||
            className.includes('option') ||
            className.includes('item') ||
            className.includes('row') ||
            className.includes('menu')
          const label = labelFor(el)
          if (!label || label.length > 180) continue
          if (!optionLike && !popup.contains(el.parentElement)) continue
          const key = normalize(label)
          if (!key || seen.has(key)) continue
          const rect = (el as HTMLElement).getBoundingClientRect()
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          const distance =
            payload.anchorX === null && payload.anchorY === null
              ? rect.top
              : Math.abs(centerX - (payload.anchorX ?? centerX)) + Math.abs(centerY - (payload.anchorY ?? centerY))
          rows.push({
            label,
            selected: selected(el),
            highlighted: highlighted(el),
            rank: (selected(el) ? -4_000 : 0) + (highlighted(el) ? -2_000 : 0) + distance,
          })
          seen.add(key)
          if (rows.length >= payload.maxOptions * 3) break
        }
      }

      rows.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
      return {
        hasPopup: popupRoots.length > 0,
        options: rows.slice(0, payload.maxOptions),
      }
    }, {
      popupSelector: POPUP_ROOT_SELECTOR,
      optionSelector: OPTION_PICKER_SELECTOR,
      anchorX: anchor?.x ?? null,
      anchorY: anchor?.y ?? null,
      maxOptions: MAX_VISIBLE_OPTION_HINTS,
    })

    hasPopup ||= snapshot.hasPopup
    for (const option of snapshot.options) {
      const key = normalizedOptionLabel(option.label)
      const existing = merged.get(key)
      const rank = (option.selected ? 0 : 10) + (option.highlighted ? 0 : 5) + merged.size
      if (!existing || rank < existing.rank) {
        merged.set(key, { ...option, rank })
      }
    }
  }

  const options = [...merged.values()]
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .slice(0, MAX_VISIBLE_OPTION_HINTS)
    .map(({ label, selected, highlighted }) => ({ label, selected, highlighted }))
  return { hasPopup, options }
}

async function activeListboxOptionLabel(page: Page, anchor?: AnchorPoint): Promise<string | null> {
  for (const frame of page.frames()) {
    const label = await frame.evaluate((payload) => {
      function visible(el: Element): el is HTMLElement {
        if (!(el instanceof HTMLElement)) return false
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return false
        const style = getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }

      function labelFor(el: Element | null): string | null {
        const text = el?.getAttribute('aria-label')?.trim() || el?.textContent?.trim() || ''
        return text || null
      }

      function highlighted(el: Element): boolean {
        return (
          el === document.activeElement ||
          el.getAttribute('data-highlighted') === 'true' ||
          el.getAttribute('data-focus') === 'true' ||
          el.getAttribute('data-focused') === 'true' ||
          el.getAttribute('data-hovered') === 'true' ||
          el.getAttribute('data-state') === 'active' ||
          el.getAttribute('aria-current') === 'true' ||
          el.getAttribute('aria-selected') === 'true'
        )
      }

      const active = document.activeElement
      const activeDescendantId = active?.getAttribute('aria-activedescendant')
      const referenced = activeDescendantId ? document.getElementById(activeDescendantId) : null
      if (referenced && visible(referenced)) return labelFor(referenced)

      const candidates = Array.from(document.querySelectorAll(payload.optionSelector)).filter(el =>
        visible(el) && highlighted(el),
      )
      let best: { label: string; score: number } | null = null
      for (const el of candidates) {
        const label = labelFor(el)
        if (!label) continue
        const rect = (el as HTMLElement).getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const distance =
          payload.anchorX === null && payload.anchorY === null
            ? rect.top
            : Math.abs(centerX - (payload.anchorX ?? centerX)) + Math.abs(centerY - (payload.anchorY ?? centerY))
        if (!best || distance < best.score) best = { label, score: distance }
      }
      return best?.label ?? null
    }, {
      optionSelector: OPTION_PICKER_SELECTOR,
      anchorX: anchor?.x ?? null,
      anchorY: anchor?.y ?? null,
    })

    if (label) return label
  }
  return null
}

async function tryKeyboardSelectVisibleOption(
  page: Page,
  label: string,
  exact: boolean,
  anchor?: AnchorPoint,
  focusLocator?: Locator,
): Promise<string | null> {
  if (focusLocator) {
    try {
      await focusLocator.click()
    } catch {
      /* ignore */
    }
    try {
      await focusLocator.focus()
    } catch {
      /* ignore */
    }
    await delay(40)
  }

  const visible = await collectVisibleOptionHints(page, anchor)
  if (!visible.options.some(option => selectionMatchScore(option.label, label, exact) !== null)) {
    return null
  }

  for (const key of ['ArrowDown', 'ArrowUp'] as const) {
    const seen = new Set<string>()
    for (let step = 0; step < LISTBOX_KEYBOARD_FALLBACK_STEPS; step++) {
      await page.keyboard.press(key)
      await delay(50)
      const active = await activeListboxOptionLabel(page, anchor)
      if (!active) continue
      if (selectionMatchScore(active, label, exact) !== null) {
        await page.keyboard.press('Enter')
        return active
      }
      const normalized = normalizedOptionLabel(active)
      if (seen.has(normalized)) break
      seen.add(normalized)
    }
  }

  return null
}

function listboxErrorMessage(opts: {
  reason: 'field_not_found' | 'no_visible_option_match' | 'selection_not_confirmed'
  requestedLabel: string
  fieldLabel?: string
  query?: string
  exact: boolean
  visibleOptions?: Array<{ label: string; selected: boolean; highlighted: boolean }>
  listEmpty?: boolean
  queryReset?: boolean
}): string {
  const visibleOptions = (opts.visibleOptions ?? []).map(option => option.label).slice(0, MAX_VISIBLE_OPTION_HINTS)
  const payload = {
    error: 'listboxPick',
    reason: opts.reason,
    message:
      opts.reason === 'field_not_found'
        ? `listboxPick: no visible combobox/dropdown matching field "${opts.fieldLabel ?? 'unknown'}"`
        : opts.reason === 'selection_not_confirmed'
          ? `listboxPick: selected "${opts.requestedLabel}" but could not confirm it on field "${opts.fieldLabel ?? 'unknown'}"`
          : `listboxPick: no visible option matching "${opts.requestedLabel}"`,
    requestedLabel: opts.requestedLabel,
    ...(opts.fieldLabel ? { fieldLabel: opts.fieldLabel } : {}),
    ...(opts.query ? { query: opts.query } : {}),
    exact: opts.exact,
    ...(opts.listEmpty !== undefined ? { listEmpty: opts.listEmpty } : {}),
    ...(opts.queryReset ? { queryReset: true } : {}),
    visibleOptionCount: visibleOptions.length,
    visibleOptions,
    suggestedAction:
      visibleOptions.length > 0
        ? 'Retry with one of visibleOptions, or pass a shorter query/alias for searchable comboboxes.'
        : opts.listEmpty
          ? 'The list appears empty. Retry after clearing the search query or reopening the dropdown.'
          : 'Open the dropdown first, or retry with fieldLabel so Geometra can anchor to the correct combobox.',
  }
  return JSON.stringify(payload, null, 2)
}

async function clickVisibleOptionCandidate(
  page: Page,
  label: string,
  exact: boolean,
  anchor?: AnchorPoint,
): Promise<string | null> {
  for (const frame of page.frames()) {
    const candidates = frame.locator(OPTION_PICKER_SELECTOR)
    const count = await candidates.count()
    if (count === 0) continue

    const bestIndex = await candidates.evaluateAll((elements, payload) => {
      function normalize(value: string): string {
        return value
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[＋﹢∔]/g, '+')
          .replace(/[‐‑‒–—―]/g, '-')
          .replace(/&/g, ' and ')
          .replace(/\bplus\b/g, '+')
          .replace(/[,/()]+/g, ' ')
          .replace(/\s*\+\s*/g, '+')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase()
      }

      function aliases(value: string): string[] {
        const out = new Set<string>([value])
        if (value === 'yes' || value === 'true') {
          for (const alias of ['agree', 'agreed', 'accept', 'accepted', 'consent', 'acknowledge', 'read', 'opt in']) {
            out.add(alias)
          }
        }
        if (value === 'no' || value === 'false') {
          for (const alias of ['decline', 'declined', 'disagree', 'deny', 'opt out', 'prefer not']) {
            out.add(alias)
          }
        }
        if (value === 'decline') {
          for (const alias of ['prefer not', 'opt out', 'do not']) {
            out.add(alias)
          }
        }
        if (value === 'atx' || value.includes('austin')) {
          for (const alias of ['atx', 'austin', 'austin tx', 'austin texas']) out.add(alias)
        }
        if (value === 'nyc' || value.includes('new york')) {
          for (const alias of ['nyc', 'new york', 'new york ny']) out.add(alias)
        }
        if (value === 'sf' || value.includes('san francisco')) {
          for (const alias of ['sf', 'san francisco', 'san francisco ca']) out.add(alias)
        }
        if (value === 'la' || value.includes('los angeles')) {
          for (const alias of ['la', 'los angeles', 'los angeles ca']) out.add(alias)
        }
        if (value === 'dc' || value.includes('washington dc')) {
          for (const alias of ['dc', 'washington dc', 'washington d c']) out.add(alias)
        }
        if (value === 'us' || value === 'usa' || value.includes('united states')) {
          for (const alias of ['us', 'usa', 'united states']) out.add(alias)
        }
        return [...out]
      }

      function hasNegativeCue(value: string): boolean {
        return /\b(no|not|do not|don't|decline|disagree|deny|opt out|prefer not)\b/.test(value)
      }

      function hasPositiveCue(value: string): boolean {
        return /\b(yes|agree|accept|consent|acknowledge|opt in|allow|read)\b/.test(value)
      }

      function matchScore(candidate: string | undefined): number | null {
        if (!candidate) return null
        const normalizedCandidate = normalize(candidate)
        const normalizedExpected = normalize(payload.label)
        if (!normalizedCandidate || !normalizedExpected) return null
        const expectsPositive = normalizedExpected === 'yes' || normalizedExpected === 'true'
        const expectsNegative =
          normalizedExpected === 'no' || normalizedExpected === 'false' || normalizedExpected === 'decline'
        if (payload.exact) return normalizedCandidate === normalizedExpected ? 0 : null
        if (normalizedCandidate === normalizedExpected) return 0
        if (normalizedCandidate.includes(normalizedExpected)) return normalizedCandidate.length - normalizedExpected.length
        if (expectsPositive && hasNegativeCue(normalizedCandidate)) return null
        if (expectsNegative && hasPositiveCue(normalizedCandidate)) return null

        for (const alias of aliases(normalizedExpected)) {
          if (alias !== normalizedExpected && normalizedCandidate.includes(alias)) {
            return 40 + normalizedCandidate.length - alias.length
          }
        }

        const tokens = normalizedExpected.split(' ').filter(token => token.length >= 3)
        if (tokens.length >= 2) {
          const matches = tokens.filter(token => normalizedCandidate.includes(token))
          if (matches.length >= Math.min(2, tokens.length)) {
            return 80 + (tokens.length - matches.length) * 10
          }
        }

        return null
      }

      function visible(el: Element): el is HTMLElement {
        if (!(el instanceof HTMLElement)) return false
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return false
        const style = getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }

      function popupWeight(el: HTMLElement): number {
        return el.closest(payload.popupSelector)
          ? 0
          : 220
      }

      let best: { index: number; score: number } | null = null
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        if (!(el instanceof Element)) continue
        if (!visible(el)) continue

        const candidateText = el.getAttribute('aria-label')?.trim() || el.textContent?.trim() || ''
        const match = matchScore(candidateText)
        if (match === null) continue

        const rect = el.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const upwardPenalty =
          payload.anchorY === null || centerY >= payload.anchorY - 16
            ? 0
            : 140
        const verticalProximity = payload.anchorY === null ? rect.top : Math.abs(centerY - payload.anchorY)
        const horizontalProximity = payload.anchorX === null ? 0 : Math.abs(centerX - payload.anchorX)
        const score = popupWeight(el) + upwardPenalty + verticalProximity + horizontalProximity / 2 + match * 2
        if (!best || score < best.score) best = { index: i, score }
      }

      return best?.index ?? -1
    }, {
      label,
      exact,
      anchorX: anchor?.x ?? null,
      anchorY: anchor?.y ?? null,
      popupSelector: POPUP_CONTAINER_SELECTOR,
    })

    if (bestIndex >= 0) {
      const candidate = candidates.nth(bestIndex)
      const selectedText =
        (await candidate.evaluate(el => el.getAttribute('aria-label')?.trim() || el.textContent?.trim() || '').catch(() => '')) || null
      const clickTarget = await resolveMeaningfulOptionClickTarget(candidate)
      if (clickTarget) {
        await clickTarget.scrollIntoViewIfNeeded()
        await clickTarget.click()
      } else {
        await candidate.click()
      }
      return selectedText
    }
  }

  return null
}

async function locatorDisplayedValues(locator: Locator): Promise<string[]> {
  try {
    return await locator.evaluate(browserDisplayedValues)
  } catch {
    return []
  }
}

async function elementHandleDisplayedValues(handle: ElementHandle<Element>): Promise<string[]> {
  try {
    return await handle.evaluate(browserDisplayedValues)
  } catch {
    return []
  }
}

async function visibleOptionIsSelected(
  page: Page,
  label: string,
  exact: boolean,
  anchor?: AnchorPoint,
): Promise<boolean> {
  for (const frame of page.frames()) {
    const candidates = frame.locator(OPTION_PICKER_SELECTOR)
    const count = await candidates.count()
    if (count === 0) continue

    const selected = await candidates.evaluateAll((elements, payload) => {
      function normalize(value: string): string {
        return value
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[＋﹢∔]/g, '+')
          .replace(/[‐‑‒–—―]/g, '-')
          .replace(/&/g, ' and ')
          .replace(/\bplus\b/g, '+')
          .replace(/[,/()]+/g, ' ')
          .replace(/\s*\+\s*/g, '+')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase()
      }

      function aliases(value: string): string[] {
        const out = new Set<string>([value])
        if (value === 'yes' || value === 'true') {
          for (const alias of ['agree', 'agreed', 'accept', 'accepted', 'consent', 'acknowledge', 'read', 'opt in']) {
            out.add(alias)
          }
        }
        if (value === 'no' || value === 'false') {
          for (const alias of ['decline', 'declined', 'disagree', 'deny', 'opt out', 'prefer not']) {
            out.add(alias)
          }
        }
        if (value === 'decline') {
          for (const alias of ['prefer not', 'opt out', 'do not']) {
            out.add(alias)
          }
        }
        if (value === 'atx' || value.includes('austin')) {
          for (const alias of ['atx', 'austin', 'austin tx', 'austin texas']) out.add(alias)
        }
        if (value === 'nyc' || value.includes('new york')) {
          for (const alias of ['nyc', 'new york', 'new york ny']) out.add(alias)
        }
        if (value === 'sf' || value.includes('san francisco')) {
          for (const alias of ['sf', 'san francisco', 'san francisco ca']) out.add(alias)
        }
        if (value === 'la' || value.includes('los angeles')) {
          for (const alias of ['la', 'los angeles', 'los angeles ca']) out.add(alias)
        }
        if (value === 'dc' || value.includes('washington dc')) {
          for (const alias of ['dc', 'washington dc', 'washington d c']) out.add(alias)
        }
        if (value === 'us' || value === 'usa' || value.includes('united states')) {
          for (const alias of ['us', 'usa', 'united states']) out.add(alias)
        }
        return [...out]
      }

      function hasNegativeCue(value: string): boolean {
        return /\b(no|not|do not|don't|decline|disagree|deny|opt out|prefer not)\b/.test(value)
      }

      function hasPositiveCue(value: string): boolean {
        return /\b(yes|agree|accept|consent|acknowledge|opt in|allow|read)\b/.test(value)
      }

      function matchScore(candidate: string | undefined): number | null {
        if (!candidate) return null
        const normalizedCandidate = normalize(candidate)
        const normalizedExpected = normalize(payload.label)
        if (!normalizedCandidate || !normalizedExpected) return null
        const expectsPositive = normalizedExpected === 'yes' || normalizedExpected === 'true'
        const expectsNegative =
          normalizedExpected === 'no' || normalizedExpected === 'false' || normalizedExpected === 'decline'
        if (payload.exact) return normalizedCandidate === normalizedExpected ? 0 : null
        if (normalizedCandidate === normalizedExpected) return 0
        if (normalizedCandidate.includes(normalizedExpected)) return normalizedCandidate.length - normalizedExpected.length
        if (expectsPositive && hasNegativeCue(normalizedCandidate)) return null
        if (expectsNegative && hasPositiveCue(normalizedCandidate)) return null
        for (const alias of aliases(normalizedExpected)) {
          if (alias !== normalizedExpected && normalizedCandidate.includes(alias)) {
            return 40 + normalizedCandidate.length - alias.length
          }
        }
        return null
      }

      function visible(el: Element): el is HTMLElement {
        if (!(el instanceof HTMLElement)) return false
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return false
        const style = getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }

      function isSelected(el: Element): boolean {
        return (
          el.getAttribute('aria-selected') === 'true' ||
          el.getAttribute('aria-checked') === 'true' ||
          el.getAttribute('data-selected') === 'true' ||
          el.getAttribute('data-state') === 'checked' ||
          el.getAttribute('data-state') === 'on'
        )
      }

      let bestScore = Number.POSITIVE_INFINITY
      for (const el of elements) {
        if (!(el instanceof Element)) continue
        if (!visible(el)) continue
        if (!isSelected(el)) continue
        const text = el.getAttribute('aria-label')?.trim() || el.textContent?.trim() || ''
        const match = matchScore(text)
        if (match === null) continue
        const rect = el.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const distance =
          payload.anchorX === null && payload.anchorY === null
            ? 0
            : Math.abs(centerX - (payload.anchorX ?? centerX)) + Math.abs(centerY - (payload.anchorY ?? centerY))
        bestScore = Math.min(bestScore, match * 2 + distance / 2)
      }

      return Number.isFinite(bestScore)
    }, { label, exact, anchorX: anchor?.x ?? null, anchorY: anchor?.y ?? null })

    if (selected) return true
  }

  return false
}

async function confirmListboxSelection(
  page: Page,
  fieldLabel: string,
  label: string,
  exact: boolean,
  anchor?: AnchorPoint,
  currentHandle?: ElementHandle<Element> | null,
  selectedOptionText?: string,
  opts?: { editable?: boolean },
): Promise<boolean> {
  const canTrustEditableDisplayMatch = async (): Promise<boolean> => {
    if (!opts?.editable) return true
    if (await visibleOptionIsSelected(page, label, exact, anchor)) return true
    const popupState = await collectVisibleOptionHints(page, anchor)
    return !popupState.hasPopup
  }

  if (currentHandle) {
    const immediateValues = await elementHandleDisplayedValues(currentHandle)
    if (
      immediateValues.some(value => displayedValueMatchesSelection(value, label, exact, selectedOptionText)) &&
      await canTrustEditableDisplayMatch()
    ) {
      return true
    }
  }

  const deadline = Date.now() + 1500
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const locator = await findLabeledControl(frame, fieldLabel, exact, { preferredAnchor: anchor })
      if (!locator) continue
      const values = await locatorDisplayedValues(locator)
      if (
        values.some(value => displayedValueMatchesSelection(value, label, exact, selectedOptionText)) &&
        await canTrustEditableDisplayMatch()
      ) {
        return true
      }
    }
    if (await visibleOptionIsSelected(page, label, exact, anchor)) return true
    await delay(100)
  }
  return false
}

const PLACEHOLDER_PATTERN = /^(select|choose|pick|--|—\s)/i

/**
 * Dismiss the dropdown (Tab) and re-verify the field value didn't revert to a placeholder.
 * Catches silent selection failures in React comboboxes where the value appears briefly
 * but isn't committed to form state.
 */
async function dismissAndReVerifySelection(
  page: Page,
  label: string,
  exact: boolean,
  currentHandle?: ElementHandle<Element> | null,
  selectedOptionText?: string,
): Promise<boolean> {
  await page.keyboard.press('Tab')
  await delay(50)

  if (!currentHandle) return true

  // Re-verify using the original element handle (immune to DOM reordering)
  const deadline = Date.now() + 800
  while (Date.now() < deadline) {
    try {
      const values = await elementHandleDisplayedValues(currentHandle)
      if (values.some(value => displayedValueMatchesSelection(value, label, exact, selectedOptionText))) {
        return true
      }
      if (values.length > 0 && values.every(v => PLACEHOLDER_PATTERN.test(v.trim()))) {
        return false
      }
    } catch {
      // Handle detached — trust the earlier confirmation
      return true
    }
    await delay(100)
  }
  return true
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

async function findLabeledFileInput(frame: Frame, fieldLabel: string, exact: boolean): Promise<Locator | null> {
  const direct = frame.getByLabel(fieldLabel, { exact })
  const directCount = await direct.count()
  for (let i = 0; i < directCount; i++) {
    const candidate = direct.nth(i)
    const isFileInput = await candidate.evaluate(el => el instanceof HTMLInputElement && el.type === 'file').catch(() => false)
    if (isFileInput) return candidate
  }

  const loc = frame.locator('input[type="file"]')
  const count = await loc.count()
  if (count === 0) return null

  const bestIndex = await loc.evaluateAll((elements, payload) => {
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

    function referencedText(ids: string | null, visited?: Set<string>): string | undefined {
      if (!ids) return undefined
      const seen = visited ?? new Set<string>()
      const text = ids
        .split(/\s+/)
        .map(id => {
          if (seen.has(id)) return ''
          seen.add(id)
          const target = document.getElementById(id)
          if (!target) return ''
          const chained = target.getAttribute('aria-labelledby')
          if (chained) return referencedText(chained, seen) ?? ''
          return target.textContent?.trim() ?? ''
        })
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
      if (el instanceof HTMLInputElement && el.labels && el.labels.length > 0) {
        return el.labels[0]?.textContent?.trim() || undefined
      }
      if (el instanceof HTMLElement && el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
        const text = label?.textContent?.trim()
        if (text) return text
      }
      if (el.parentElement?.tagName.toLowerCase() === 'label') {
        const text = el.parentElement.textContent?.trim()
        if (text) return text
      }
      const title = el.getAttribute('title')?.trim()
      if (title) return title
      return undefined
    }

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      if (!(el instanceof HTMLInputElement) || el.type !== 'file') continue
      if (matches(explicitLabelText(el))) return i
    }
    return -1
  }, { fieldLabel, exact })

  return bestIndex >= 0 ? loc.nth(bestIndex) : null
}

async function findLabeledFileInputInPage(
  page: Page,
  fieldLabel: string,
  exact: boolean,
  cache?: FillLookupCache,
  fieldId?: string,
): Promise<Locator | null> {
  const cached = readCachedLocator(cache, 'file', fieldLabel, exact, fieldId)
  if (cached !== undefined) return cached

  for (const frame of page.frames()) {
    const locator = await findLabeledFileInput(frame, fieldLabel, exact)
    if (!locator) continue
    writeCachedLocator(cache, 'file', fieldLabel, exact, fieldId, locator)
    return locator
  }

  writeCachedLocator(cache, 'file', fieldLabel, exact, fieldId, null)
  return null
}

async function attachHiddenInAllFrames(
  page: Page,
  paths: string[],
  opts?: { fieldLabel?: string; exact?: boolean; cache?: FillLookupCache; fieldId?: string },
): Promise<boolean> {
  if (opts?.fieldLabel) {
    const labeled = await findLabeledFileInputInPage(page, opts.fieldLabel, opts.exact ?? false, opts.cache, opts.fieldId)
    if (labeled) {
      try {
        await labeled.setInputFiles(paths)
        return true
      } catch {
        /* fall through to uncached scan */
      }
    }
  }

  for (const frame of page.frames()) {
    if (opts?.fieldLabel) {
      const labeled = await findLabeledFileInput(frame, opts.fieldLabel, opts.exact ?? false)
      if (!labeled) continue
      try {
        await labeled.setInputFiles(paths)
        return true
      } catch {
        /* try next frame */
      }
      continue
    }
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
    fieldId?: string
    clickX?: number
    clickY?: number
    fieldLabel?: string
    exact?: boolean
    strategy?: FileAttachStrategy
    dropX?: number
    dropY?: number
    cache?: FillLookupCache
  },
): Promise<void> {
  const strategy = opts?.strategy ?? 'auto'
  const clickX = opts?.clickX
  const clickY = opts?.clickY
  const fieldLabel = opts?.fieldLabel
  const exact = opts?.exact ?? false
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
    if (await attachHiddenInAllFrames(page, paths, { fieldId: opts?.fieldId, fieldLabel, exact, cache: opts?.cache })) return
    if (strategy === 'hidden') {
      if (fieldLabel) {
        throw new Error(`file: hidden strategy could not find input[type=file] for field "${fieldLabel}"`)
      }
      throw new Error('file: hidden strategy could not set any input[type=file]')
    }
    if (fieldLabel) {
      throw new Error(`file: no input[type=file] matching field "${fieldLabel}"`)
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

async function findLabeledEditableField(
  page: Page,
  fieldLabel: string,
  exact: boolean,
  cache?: FillLookupCache,
  fieldId?: string,
): Promise<Locator | null> {
  const cached = readCachedLocator(cache, 'editable', fieldLabel, exact, fieldId)
  if (cached !== undefined) return cached

  for (const frame of page.frames()) {
    const candidates = [
      frame.getByLabel(fieldLabel, { exact }),
      frame.getByPlaceholder(fieldLabel, { exact }),
      frame.getByRole('textbox', { name: fieldLabel, exact }),
      frame.getByRole('combobox', { name: fieldLabel, exact }),
    ]
    for (const candidate of candidates) {
      const visible = await firstVisible(candidate, { minWidth: 1, minHeight: 1 })
      if (!visible) continue
      if (await locatorIsEditable(visible)) {
        writeCachedLocator(cache, 'editable', fieldLabel, exact, fieldId, visible)
        return visible
      }
    }

    const fallback = await findLabeledControl(frame, fieldLabel, exact)
    if (fallback && await locatorIsEditable(fallback)) {
      writeCachedLocator(cache, 'editable', fieldLabel, exact, fieldId, fallback)
      return fallback
    }
  }

  writeCachedLocator(cache, 'editable', fieldLabel, exact, fieldId, null)
  return null
}

async function locatorCurrentValue(locator: Locator): Promise<string | null> {
  try {
    return await locator.evaluate((el) => {
      function normalized(value: string | null | undefined): string | null {
        const trimmed = value?.replace(/\s+/g, ' ').trim()
        return trimmed ? trimmed : null
      }

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return normalized(el.value || el.getAttribute('aria-valuetext') || el.getAttribute('aria-label'))
      }
      if (el instanceof HTMLSelectElement) {
        return normalized(el.selectedOptions[0]?.textContent || el.value || el.getAttribute('aria-valuetext'))
      }
      if (el instanceof HTMLElement && el.isContentEditable) {
        return normalized(el.innerText || el.textContent || el.getAttribute('aria-valuetext'))
      }
      if (el instanceof HTMLElement) {
        return normalized(el.getAttribute('aria-valuetext') || el.innerText || el.textContent || el.getAttribute('aria-label'))
      }
      return null
    })
  } catch {
    return null
  }
}

function normalizedFieldValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function fieldValueMatches(actual: string | null | undefined, expected: string): boolean {
  if (!actual) return false
  const normalizedActual = normalizedFieldValue(actual)
  const normalizedExpected = normalizedFieldValue(expected)
  if (!normalizedActual || !normalizedExpected) return false
  return normalizedActual === normalizedExpected || normalizedActual.includes(normalizedExpected)
}

async function setLocatorTextValue(locator: Locator, value: string): Promise<boolean> {
  try {
    return await locator.evaluate((el, nextValue) => {
      function dispatch(target: HTMLElement): void {
        target.dispatchEvent(new Event('input', { bubbles: true }))
        target.dispatchEvent(new Event('change', { bubbles: true }))
      }

      function setInputLikeValue(target: HTMLInputElement | HTMLTextAreaElement, next: string): void {
        const proto = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
        if (descriptor?.set) {
          descriptor.set.call(target, next)
        } else {
          target.value = next
        }
      }

      if (el instanceof HTMLInputElement) {
        if (['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'hidden'].includes(el.type)) return false
        el.focus()
        setInputLikeValue(el, nextValue)
        dispatch(el)
        return true
      }

      if (el instanceof HTMLTextAreaElement) {
        el.focus()
        setInputLikeValue(el, nextValue)
        dispatch(el)
        return true
      }

      if (el instanceof HTMLElement && (el.isContentEditable || el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'combobox')) {
        el.focus()
        el.textContent = nextValue
        dispatch(el)
        return true
      }

      return false
    }, value)
  } catch {
    return false
  }
}

async function attemptNativeBatchFill(page: Page, fields: FormFieldFill[]): Promise<boolean[]> {
  type NativeBatchPendingField =
    | { index: number; kind: 'auto'; fieldLabel: string; value: string | boolean; exact: boolean }
    | { index: number; kind: 'text'; fieldLabel: string; value: string; exact: boolean }
    | { index: number; kind: 'choice'; fieldLabel: string; value: string; exact: boolean; choiceType: ClientChoiceType | null }
    | { index: number; kind: 'toggle'; label: string; checked: boolean; exact: boolean; controlType: 'checkbox' | 'radio' | null }

  const results = fields.map(() => false)

  for (const frame of page.frames()) {
    const pending: NativeBatchPendingField[] = []
    for (let index = 0; index < fields.length; index++) {
      if (results[index]) continue
      const field = fields[index]!
      if (field.kind === 'file') continue
      if (field.kind === 'auto') {
        pending.push({
          index,
          kind: 'auto',
          fieldLabel: field.fieldLabel,
          value: field.value,
          exact: field.exact ?? false,
        })
        continue
      }
      if (field.kind === 'text') {
        pending.push({
          index,
          kind: 'text',
          fieldLabel: field.fieldLabel,
          value: field.value,
          exact: field.exact ?? false,
        })
        continue
      }
      if (field.kind === 'choice') {
        pending.push({
          index,
          kind: 'choice',
          fieldLabel: field.fieldLabel,
          value: field.value,
          exact: field.exact ?? false,
          choiceType: field.choiceType ?? null,
        })
        continue
      }
      pending.push({
        index,
        kind: 'toggle',
        label: field.label,
        checked: field.checked ?? true,
        exact: field.exact ?? false,
        controlType: field.controlType ?? null,
      })
    }

    if (pending.length === 0) break

    const frameResults = await frame.evaluate((items) => {
      type ChoiceType = 'select' | 'group' | 'listbox' | null
      type NativeBatchField =
        | { index: number; kind: 'auto'; fieldLabel: string; value: string | boolean; exact: boolean }
        | { index: number; kind: 'text'; fieldLabel: string; value: string; exact: boolean }
        | { index: number; kind: 'choice'; fieldLabel: string; value: string; exact: boolean; choiceType: ChoiceType }
        | { index: number; kind: 'toggle'; label: string; checked: boolean; exact: boolean; controlType: 'checkbox' | 'radio' | null }

      function normalize(value: string | null | undefined): string {
        return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
      }

      function matches(candidate: string | null | undefined, expected: string, exact: boolean): boolean {
        const normalizedCandidate = normalize(candidate)
        const normalizedExpected = normalize(expected)
        if (!normalizedCandidate || !normalizedExpected) return false
        return exact ? normalizedCandidate === normalizedExpected : normalizedCandidate.includes(normalizedExpected)
      }

      function visible(el: Element): el is HTMLElement {
        if (!(el instanceof HTMLElement)) return false
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return false
        const style = getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }

      function referencedText(ids: string | null, visited?: Set<string>): string | undefined {
        if (!ids) return undefined
        const seen = visited ?? new Set<string>()
        const text = ids
          .split(/\s+/)
          .map(id => {
            if (seen.has(id)) return ''
            seen.add(id)
            const target = document.getElementById(id)
            if (!target) return ''
            const chained = target.getAttribute('aria-labelledby')
            if (chained) return referencedText(chained, seen) ?? ''
            return target.textContent?.trim() ?? ''
          })
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
        if (el.parentElement?.tagName.toLowerCase() === 'label') {
          return el.parentElement.textContent?.trim() || undefined
        }
        if (
          (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
          !['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'hidden'].includes(el instanceof HTMLInputElement ? el.type : '')
        ) {
          const placeholder = el.getAttribute('aria-placeholder')?.trim() || el.getAttribute('placeholder')?.trim()
          if (placeholder) return placeholder
        }
        if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type)) {
          const value = el.value?.trim()
          if (value) return value
        }
        const title = el.getAttribute('title')?.trim()
        if (title) return title
        return undefined
      }

      function dispatch(target: HTMLElement): void {
        target.dispatchEvent(new Event('input', { bubbles: true }))
        target.dispatchEvent(new Event('change', { bubbles: true }))
      }

      function setInputLikeValue(target: HTMLInputElement | HTMLTextAreaElement, next: string): void {
        const proto = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
        if (descriptor?.set) descriptor.set.call(target, next)
        else target.value = next
      }

      function currentValue(el: Element): string {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value
        if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.textContent?.trim() || el.value
        if (el instanceof HTMLElement && el.isContentEditable) return el.innerText || el.textContent || ''
        return ''
      }

      function prefersGroupedChoice(input: string): boolean {
        const normalized = normalize(input)
        return normalized === 'yes' ||
          normalized === 'no' ||
          normalized === 'true' ||
          normalized === 'false' ||
          normalized === 'decline' ||
          normalized === 'prefer not' ||
          normalized === 'opt out'
      }

      function setTextField(fieldLabel: string, value: string, exact: boolean): boolean {
        const controls = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'))
        for (const control of controls) {
          if (!(control instanceof Element) || !visible(control)) continue
          if (control instanceof HTMLInputElement && ['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'hidden'].includes(control.type)) {
            continue
          }
          if (!matches(explicitLabelText(control), fieldLabel, exact)) continue
          if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
            control.focus()
            setInputLikeValue(control, value)
            dispatch(control)
            return matches(currentValue(control), value, false)
          }
          if (control instanceof HTMLElement && control.isContentEditable) {
            control.focus()
            control.textContent = value
            dispatch(control)
            return matches(currentValue(control), value, false)
          }
        }
        return false
      }

      function setSelectField(fieldLabel: string, value: string, exact: boolean): boolean {
        const controls = Array.from(document.querySelectorAll('select'))
        for (const control of controls) {
          if (!(control instanceof HTMLSelectElement) || !visible(control)) continue
          if (!matches(explicitLabelText(control), fieldLabel, exact)) continue
          const expected = normalize(value)
          const option = Array.from(control.options).find((candidate) => {
            const label = normalize(candidate.textContent)
            const rawValue = normalize(candidate.value)
            return exact ? label === expected || rawValue === expected : label.includes(expected) || rawValue.includes(expected)
          })
          if (!option) return false
          control.value = option.value
          dispatch(control)
          return matches(currentValue(control), value, false) || normalize(control.value) === expected
        }
        return false
      }

      function groupPrompt(container: Element): string | undefined {
        const legend = container.querySelector('legend')?.textContent?.trim()
        if (legend) return legend
        const explicit = explicitLabelText(container)
        if (explicit) return explicit
        const textLike = container.querySelector('h1, h2, h3, h4, h5, h6, p, span, div')
        const text = textLike?.textContent?.trim()
        return text || undefined
      }

      function choiceLabel(el: Element): string | undefined {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          return explicitLabelText(el)
        }
        if (el instanceof HTMLLabelElement) return el.textContent?.trim() || undefined
        const explicit = explicitLabelText(el)
        if (explicit) return explicit
        return el.textContent?.trim() || undefined
      }

      function setGroupedChoice(fieldLabel: string, value: string, exact: boolean): boolean {
        const groups = Array.from(document.querySelectorAll('fieldset, [role="radiogroup"], [role="group"]'))
          .filter((el): el is HTMLElement => visible(el) && matches(groupPrompt(el), fieldLabel, exact))
        for (const group of groups) {
          const options = Array.from(
            group.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], label, button'),
          )
          for (const option of options) {
            if (!(option instanceof Element) || !visible(option)) continue
            if (!matches(choiceLabel(option), value, exact)) continue

            if (option instanceof HTMLInputElement) {
              if (!option.checked) option.click()
              if (!option.checked) {
                option.checked = true
                dispatch(option)
              }
              return option.checked
            }
            if (option instanceof HTMLLabelElement) {
              option.click()
              const control = option.control
              if (control instanceof HTMLInputElement) return control.checked
              return true
            }
            option.click()
            return true
          }
        }
        return false
      }

      function setToggle(label: string, checked: boolean, exact: boolean, controlType: 'checkbox' | 'radio' | null): boolean {
        const inputs = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'))
        for (const input of inputs) {
          if (!(input instanceof HTMLInputElement) || !visible(input)) continue
          if (controlType && input.type !== controlType) continue
          if (!matches(explicitLabelText(input), label, exact)) continue
          if (input.checked !== checked) {
            input.click()
            if (input.checked !== checked) {
              input.checked = checked
              dispatch(input)
            }
          }
          return input.checked === checked
        }

        const labels = Array.from(document.querySelectorAll('label'))
        for (const labelEl of labels) {
          if (!(labelEl instanceof HTMLLabelElement) || !visible(labelEl)) continue
          if (!matches(labelEl.textContent, label, exact)) continue
          const control = labelEl.control
          if (!(control instanceof HTMLInputElement)) continue
          if (controlType && control.type !== controlType) continue
          if (control.checked !== checked) labelEl.click()
          if (control.checked !== checked) {
            control.checked = checked
            dispatch(control)
          }
          return control.checked === checked
        }

        return false
      }

      function setAutoField(fieldLabel: string, value: string | boolean, exact: boolean): boolean {
        if (typeof value === 'boolean') {
          if (setGroupedChoice(fieldLabel, value ? 'Yes' : 'No', exact)) return true
          if (setToggle(fieldLabel, value, exact, null)) return true
          return setSelectField(fieldLabel, value ? 'Yes' : 'No', exact)
        }

        if (prefersGroupedChoice(value) && setGroupedChoice(fieldLabel, value, exact)) return true
        if (setSelectField(fieldLabel, value, exact)) return true
        if (setTextField(fieldLabel, value, exact)) return true
        return setGroupedChoice(fieldLabel, value, exact)
      }

      return items.map((field: NativeBatchField) => {
        if (field.kind === 'auto') {
          return { index: field.index, ok: setAutoField(field.fieldLabel, field.value, field.exact) }
        }
        if (field.kind === 'text') return { index: field.index, ok: setTextField(field.fieldLabel, field.value, field.exact) }
        if (field.kind === 'choice') {
          if (field.choiceType === 'group') {
            return { index: field.index, ok: setGroupedChoice(field.fieldLabel, field.value, field.exact) }
          }
          if (field.choiceType === 'listbox') {
            return { index: field.index, ok: false }
          }
          const selected = setSelectField(field.fieldLabel, field.value, field.exact)
          if (selected) return { index: field.index, ok: true }
          return { index: field.index, ok: setGroupedChoice(field.fieldLabel, field.value, field.exact) }
        }
        return { index: field.index, ok: setToggle(field.label, field.checked, field.exact, field.controlType) }
      })
    }, pending).catch(() => [] as Array<{ index: number; ok: boolean }>)

    for (const entry of frameResults) {
      if (entry?.ok === true) results[entry.index] = true
    }
  }

  return results
}

export async function setFieldText(
  page: Page,
  fieldLabel: string,
  value: string,
  opts?: { exact?: boolean; cache?: FillLookupCache; fieldId?: string },
): Promise<void> {
  const exact = opts?.exact ?? false
  const locator = await findLabeledEditableField(page, fieldLabel, exact, opts?.cache, opts?.fieldId)
  if (!locator) {
    throw new Error(`setFieldText: no visible editable field matching "${fieldLabel}"`)
  }

  await locator.scrollIntoViewIfNeeded()
  const applied = await setLocatorTextValue(locator, value)
  if (!applied) {
    try {
      await locator.fill(value)
    } catch {
      await locator.click()
      await typeIntoEditableLocator(page, locator, value)
    }
  }

  const current = await locatorCurrentValue(locator)
  if (fieldValueMatches(current, value)) return

  const displayed = await locatorDisplayedValues(locator)
  if (displayed.some(candidate => fieldValueMatches(candidate, value))) return

  throw new Error(`setFieldText: set "${fieldLabel}" but could not confirm value ${JSON.stringify(value)}`)
}

async function setNativeSelectByLabel(locator: Locator, value: string, exact: boolean): Promise<boolean> {
  try {
    return await locator.evaluate((el, payload) => {
      if (!(el instanceof HTMLSelectElement)) return false
      const normalize = (input: string | undefined | null) => input?.replace(/\s+/g, ' ').trim().toLowerCase() ?? ''
      const expected = normalize(payload.value)
      if (!expected) return false

      const option = Array.from(el.options).find((candidate) => {
        const label = normalize(candidate.textContent)
        const rawValue = normalize(candidate.value)
        if (payload.exact) return label === expected || rawValue === expected
        return label.includes(expected) || rawValue.includes(expected)
      })

      if (!option) return false
      el.value = option.value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }, { value, exact })
  } catch {
    return false
  }
}

async function chooseValueFromLabeledGroup(
  page: Page,
  fieldLabel: string,
  value: string,
  exact: boolean,
): Promise<boolean> {
  for (const frame of page.frames()) {
    const matched = await frame.evaluate((payload) => {
      function normalize(input: string | undefined | null): string {
        return (input ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
      }

      function visible(el: Element): el is HTMLElement {
        if (!(el instanceof HTMLElement)) return false
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return false
        const style = getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }

      function matches(candidate: string | undefined | null): boolean {
        const normalizedCandidate = normalize(candidate)
        const normalizedExpected = normalize(payload.fieldLabel)
        if (!normalizedCandidate || !normalizedExpected) return false
        return payload.exact ? normalizedCandidate === normalizedExpected : normalizedCandidate.includes(normalizedExpected)
      }

      function matchesChoice(candidate: string | undefined | null): boolean {
        const normalizedCandidate = normalize(candidate)
        const normalizedExpected = normalize(payload.value)
        if (!normalizedCandidate || !normalizedExpected) return false
        return payload.exact ? normalizedCandidate === normalizedExpected : normalizedCandidate.includes(normalizedExpected)
      }

      function referencedText(ids: string | null, visited?: Set<string>): string | undefined {
        if (!ids) return undefined
        const seen = visited ?? new Set<string>()
        const text = ids
          .split(/\s+/)
          .map(id => {
            if (seen.has(id)) return ''
            seen.add(id)
            const target = document.getElementById(id)
            if (!target) return ''
            const chained = target.getAttribute('aria-labelledby')
            if (chained) return referencedText(chained, seen) ?? ''
            return target.textContent?.trim() ?? ''
          })
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
        if (el instanceof HTMLInputElement && el.labels && el.labels.length > 0) {
          return el.labels[0]?.textContent?.trim() || undefined
        }
        if (el.parentElement?.tagName.toLowerCase() === 'label') {
          return el.parentElement.textContent?.trim() || undefined
        }
        if (
          (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
          !['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'hidden'].includes(el instanceof HTMLInputElement ? el.type : '')
        ) {
          const placeholder = el.getAttribute('aria-placeholder')?.trim() || el.getAttribute('placeholder')?.trim()
          if (placeholder) return placeholder
        }
        if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type)) {
          const value = el.value?.trim()
          if (value) return value
        }
        const title = el.getAttribute('title')?.trim()
        if (title) return title
        return undefined
      }

      function choiceLabel(el: Element): string | undefined {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          return explicitLabelText(el)
        }
        if (el instanceof HTMLLabelElement) return el.textContent?.trim() || undefined
        const aria = el.getAttribute('aria-label')?.trim()
        if (aria) return aria
        const labelledBy = referencedText(el.getAttribute('aria-labelledby'))
        if (labelledBy) return labelledBy
        return el.textContent?.trim() || undefined
      }

      function hasGroupedChoices(container: Element): boolean {
        const count = container.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], button').length
        return count >= 2
      }

      const candidates: Array<{ root: HTMLElement; score: number }> = []
      const explicitGroups = Array.from(document.querySelectorAll('fieldset, [role="radiogroup"], [role="group"]'))
        .filter((el): el is HTMLElement => visible(el) && hasGroupedChoices(el))
      for (const group of explicitGroups) {
        const legend = group.querySelector('legend')?.textContent?.trim()
        const groupName = explicitLabelText(group) || legend || group.textContent?.trim()
        if (matches(groupName)) {
          const rect = group.getBoundingClientRect()
          candidates.push({ root: group, score: rect.width * rect.height })
        }
      }

      const labelNodes = Array.from(document.querySelectorAll('label, legend, h1, h2, h3, h4, h5, h6, p, span, div'))
        .filter((el): el is HTMLElement => visible(el) && matches(el.textContent))
      for (const labelNode of labelNodes) {
        let current: HTMLElement | null = labelNode.parentElement
        for (let depth = 0; current && depth < 5; depth++) {
          if (visible(current) && hasGroupedChoices(current)) {
            const rect = current.getBoundingClientRect()
            candidates.push({ root: current, score: rect.width * rect.height + depth * 1000 })
            break
          }
          current = current.parentElement
        }
      }

      candidates.sort((a, b) => a.score - b.score)

      for (const candidate of candidates) {
        const options = Array.from(
          candidate.root.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], label, button'),
        )

        for (const option of options) {
          if (!visible(option)) continue
          if (!matchesChoice(choiceLabel(option))) continue

          if (option instanceof HTMLInputElement) {
            option.click()
            return option.checked
          }
          if (option instanceof HTMLLabelElement) {
            option.click()
            const control = option.control
            if (control instanceof HTMLInputElement) return control.checked
            return true
          }
          option.click()
          if (option.getAttribute('role') === 'radio' || option.getAttribute('role') === 'checkbox') {
            return option.getAttribute('aria-checked') === 'true' || option.getAttribute('aria-selected') === 'true'
          }
          return true
        }
      }

      return false
    }, { fieldLabel, value, exact })

    if (matched) return true
  }

  return false
}

async function autoFieldLocatorKind(locator: Locator): Promise<'select' | 'text' | 'choice' | 'unknown'> {
  try {
    return await locator.evaluate((el) => {
      if (el instanceof HTMLSelectElement) return 'select'
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return 'text'
      if (el instanceof HTMLElement && el.isContentEditable) return 'text'
      const role = el.getAttribute('role')
      if (role === 'combobox' || role === 'listbox') return 'choice'
      if (el instanceof HTMLButtonElement) return 'choice'
      if (el.getAttribute('aria-haspopup') === 'listbox') return 'choice'
      return 'unknown'
    })
  } catch {
    return 'unknown'
  }
}

export async function setAutoFieldValue(
  page: Page,
  fieldLabel: string,
  value: string | boolean,
  opts?: { exact?: boolean; cache?: FillLookupCache; fieldId?: string },
): Promise<void> {
  const exact = opts?.exact ?? false

  if (typeof value === 'boolean') {
    if (await chooseValueFromLabeledGroup(page, fieldLabel, value ? 'Yes' : 'No', exact)) return
    await setCheckedControl(page, fieldLabel, { checked: value, exact })
    return
  }

  if (prefersGroupedChoiceValue(value) && await chooseValueFromLabeledGroup(page, fieldLabel, value, exact)) {
    return
  }

  const locator = await findLabeledControlInPage(page, fieldLabel, exact, { cache: opts?.cache, fieldId: opts?.fieldId })
  if (locator) {
    const kind = await autoFieldLocatorKind(locator)
    if (kind === 'select') {
      await setFieldChoice(page, fieldLabel, value, {
        fieldId: opts?.fieldId,
        exact,
        choiceType: 'select',
        cache: opts?.cache,
      })
      return
    }
    if (kind === 'text') {
      await setFieldText(page, fieldLabel, value, {
        fieldId: opts?.fieldId,
        exact,
        cache: opts?.cache,
      })
      return
    }
    if (kind === 'choice') {
      await setFieldChoice(page, fieldLabel, value, {
        fieldId: opts?.fieldId,
        exact,
        cache: opts?.cache,
      })
      return
    }
  }

  if (await chooseValueFromLabeledGroup(page, fieldLabel, value, exact)) return

  try {
    await setFieldText(page, fieldLabel, value, {
      fieldId: opts?.fieldId,
      exact,
      cache: opts?.cache,
    })
    return
  } catch {
    await setFieldChoice(page, fieldLabel, value, {
      fieldId: opts?.fieldId,
      exact,
      cache: opts?.cache,
    })
  }
}

export async function setFieldChoice(
  page: Page,
  fieldLabel: string,
  value: string,
  opts?: { exact?: boolean; query?: string; choiceType?: ClientChoiceType; cache?: FillLookupCache; fieldId?: string },
): Promise<void> {
  const exact = opts?.exact ?? false

  const locator = await findLabeledControlInPage(page, fieldLabel, exact, { cache: opts?.cache, fieldId: opts?.fieldId })
  if (locator) {
    await locator.scrollIntoViewIfNeeded()
    if (await setNativeSelectByLabel(locator, value, exact)) {
      const displayed = await locatorDisplayedValues(locator)
      if (displayed.some(candidate => displayedValueMatchesSelection(candidate, value, exact))) return
      throw new Error(`setFieldChoice: selected "${value}" for field "${fieldLabel}" but could not confirm it`)
    }
  }

  if (opts?.choiceType === 'group') {
    if (await chooseValueFromLabeledGroup(page, fieldLabel, value, exact)) return
    throw new Error(`setFieldChoice: no grouped choice matching "${value}" for field "${fieldLabel}"`)
  }

  try {
    await pickListboxOption(page, value, {
      fieldId: opts?.fieldId,
      fieldLabel,
      exact,
      query: opts?.query,
      cache: opts?.cache,
    })
    return
  } catch (listboxError) {
    if (await chooseValueFromLabeledGroup(page, fieldLabel, value, exact)) return
    throw listboxError
  }
}

export type FormFieldFill = ClientFillField

export async function fillFields(page: Page, fields: FormFieldFill[], cache = createFillLookupCache()): Promise<void> {
  const nativeResults = await attemptNativeBatchFill(page, fields)

  // Separate text fields (parallelizable) from interactive fields (sequential)
  const textFills: Array<{ field: FormFieldFill & { kind: 'text' } }> = []
  const otherFills: Array<{ index: number; field: FormFieldFill }> = []

  for (let index = 0; index < fields.length; index++) {
    if (nativeResults[index]) continue
    const field = fields[index]!
    if (field.kind === 'text') {
      textFills.push({ field: field as FormFieldFill & { kind: 'text' } })
    } else {
      otherFills.push({ index, field })
    }
  }

  // Fill text fields in parallel (they don't trigger DOM changes that affect each other)
  if (textFills.length > 0) {
    await Promise.all(textFills.map(({ field }) =>
      setFieldText(page, field.fieldLabel, field.value, { fieldId: field.fieldId, exact: field.exact, cache }),
    ))
  }

  // Fill interactive fields sequentially (choice/toggle/file/auto may trigger DOM changes)
  for (const { field } of otherFills) {
    if (field.kind === 'auto') {
      await setAutoFieldValue(page, field.fieldLabel, field.value, {
        fieldId: field.fieldId,
        exact: field.exact,
        cache,
      })
      continue
    }
    if (field.kind === 'choice') {
      await setFieldChoice(page, field.fieldLabel, field.value, {
        fieldId: field.fieldId,
        exact: field.exact,
        query: field.query,
        choiceType: field.choiceType,
        cache,
      })
      continue
    }
    if (field.kind === 'toggle') {
      await setCheckedControl(page, field.label, {
        checked: field.checked,
        exact: field.exact,
        controlType: field.controlType,
      })
      continue
    }
    if (field.kind === 'file') {
      await attachFiles(page, field.paths, { fieldId: field.fieldId, fieldLabel: field.fieldLabel, exact: field.exact, cache })
    }
  }
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
  opts?: { exact?: boolean; openX?: number; openY?: number; fieldId?: string; fieldLabel?: string; query?: string; cache?: FillLookupCache },
): Promise<void> {
  let anchor: AnchorPoint | undefined
  const exact = opts?.exact ?? false
  let attemptedSelection = false
  let selectedOptionText: string | undefined
  let openedHandle: ElementHandle<Element> | null | undefined
  let openedLocator: Locator | undefined
  let openedEditable = false
  let queryUsed: string | undefined
  let queryReset = false

  if (opts?.fieldLabel) {
    let opened
    try {
      opened = await openDropdownControl(page, opts.fieldLabel, exact, opts.cache, opts.fieldId)
    } catch {
      throw new Error(listboxErrorMessage({
        reason: 'field_not_found',
        requestedLabel: label,
        fieldLabel: opts.fieldLabel,
        query: opts?.query,
        exact,
      }))
    }
    anchor = { x: opened.anchorX, y: opened.anchorY }
    openedHandle = opened.handle
    openedLocator = opened.locator
    openedEditable = opened.editable
    queryUsed = opts.query ?? label
    if (queryUsed && opened.editable) {
      await typeIntoEditableLocator(page, opened.locator, queryUsed)
      await delay(80)
    } else if (queryUsed && await typeIntoActiveEditableElement(page, queryUsed)) {
      await delay(80)
    }
  } else if (opts?.openX !== undefined && opts?.openY !== undefined) {
    await page.mouse.click(opts.openX, opts.openY)
    anchor = { x: opts.openX, y: opts.openY }
    await delay(120)
  }

  const attemptClickSelection = async (): Promise<boolean> => {
    selectedOptionText = (await clickVisibleOptionCandidate(page, label, exact, anchor)) ?? undefined
    if (!selectedOptionText) return false
    attemptedSelection = true
    if (
      !opts?.fieldLabel ||
      await confirmListboxSelection(page, opts.fieldLabel, label, exact, anchor, openedHandle, selectedOptionText, {
        editable: openedEditable,
      })
    ) {
      return true
    }
    return false
  }

  const dismissAfterSelection = async (): Promise<boolean> => {
    if (!opts?.fieldLabel) {
      await page.keyboard.press('Tab')
      await delay(50)
      return true
    }
    if (await dismissAndReVerifySelection(page, label, exact, openedHandle, selectedOptionText)) {
      return true
    }
    // Value reverted — retry with Enter then re-verify
    await page.keyboard.press('Enter')
    await delay(50)
    if (await dismissAndReVerifySelection(page, label, exact, openedHandle, selectedOptionText)) {
      return true
    }
    return false
  }

  if (await attemptClickSelection()) {
    if (await dismissAfterSelection()) return
  }

  let visibleHints = await collectVisibleOptionHints(page, anchor)
  const visibleMatchExists = visibleHints.options.some(option => selectionMatchScore(option.label, label, exact) !== null)
  if (queryUsed && !visibleMatchExists) {
    queryReset = await resetTypedListboxQuery(page, openedLocator)
    if (queryReset) {
      await delay(80)
      if (await attemptClickSelection()) {
        if (await dismissAfterSelection()) return
      }
      visibleHints = await collectVisibleOptionHints(page, anchor)
    }
  }

  const keyboardSelection = await tryKeyboardSelectVisibleOption(page, label, exact, anchor, openedLocator)
  if (keyboardSelection) {
    selectedOptionText = keyboardSelection
    attemptedSelection = true
    if (
      !opts?.fieldLabel ||
      await confirmListboxSelection(page, opts.fieldLabel, label, exact, anchor, openedHandle, selectedOptionText, {
        editable: openedEditable,
      })
    ) {
      if (await dismissAfterSelection()) return
    }
  }

  visibleHints = await collectVisibleOptionHints(page, anchor)
  if (opts?.fieldLabel && attemptedSelection) {
    throw new Error(listboxErrorMessage({
      reason: 'selection_not_confirmed',
      requestedLabel: label,
      fieldLabel: opts.fieldLabel,
      query: queryUsed,
      exact,
      visibleOptions: visibleHints.options,
      listEmpty: visibleHints.hasPopup && visibleHints.options.length === 0,
      queryReset,
    }))
  }
  throw new Error(listboxErrorMessage({
    reason: 'no_visible_option_match',
    requestedLabel: label,
    fieldLabel: opts?.fieldLabel,
    query: queryUsed,
    exact,
    visibleOptions: visibleHints.options,
    listEmpty: visibleHints.hasPopup && visibleHints.options.length === 0,
    queryReset,
  }))
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

        function referencedText(ids: string | null, visited?: Set<string>): string | undefined {
          if (!ids) return undefined
          const seen = visited ?? new Set<string>()
          const text = ids
            .split(/\s+/)
            .map(id => {
              if (seen.has(id)) return ''
              seen.add(id)
              const target = document.getElementById(id)
              if (!target) return ''
              const chained = target.getAttribute('aria-labelledby')
              if (chained) return referencedText(chained, seen) ?? ''
              return target.textContent?.trim() ?? ''
            })
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

        const selector = 'input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"], [role="switch"]'
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
    const scrolled = await page.evaluate(({ deltaX, deltaY, x, y }) => {
      function overflowAllows(styleValue: string): boolean {
        return styleValue === 'auto' || styleValue === 'scroll' || styleValue === 'overlay'
      }

      function nearestScrollable(start: Element | null): HTMLElement | null {
        let current = start instanceof HTMLElement ? start : null
        while (current) {
          const style = getComputedStyle(current)
          const allowsY = overflowAllows(style.overflowY) && current.scrollHeight > current.clientHeight + 1
          const allowsX = overflowAllows(style.overflowX) && current.scrollWidth > current.clientWidth + 1
          if (allowsY || allowsX) return current
          current = current.parentElement
        }
        return null
      }

      const target = document.elementFromPoint(x, y)
      const container = nearestScrollable(target)
      if (container) {
        const beforeTop = container.scrollTop
        const beforeLeft = container.scrollLeft
        container.scrollBy(deltaX, deltaY)
        return container.scrollTop !== beforeTop || container.scrollLeft !== beforeLeft
      }

      const beforeX = window.scrollX
      const beforeY = window.scrollY
      window.scrollBy(deltaX, deltaY)
      return window.scrollX !== beforeX || window.scrollY !== beforeY
    }, { deltaX, deltaY, x, y })

    if (scrolled) return

    await page.mouse.move(x, y)
    await page.mouse.wheel(deltaX, deltaY)
    return
  }

  await page.evaluate(({ deltaX, deltaY }) => {
    window.scrollBy(deltaX, deltaY)
  }, { deltaX, deltaY })
}

import { performance } from 'node:perf_hooks'
import type { Frame, Page } from 'playwright'
import {
  enrichSnapshotWithCdpAx,
  shouldEnrichSnapshotWithCdpAx,
  type CdpAxSessionManager,
} from './a11y-enrich.js'
import { frameOriginInRootPage } from './frame-offset.js'
import { offsetLayoutSubtree } from './layout-offset.js'
import type { GeometrySnapshot, LayoutSnapshot, TreeSnapshot } from './types.js'

/**
 * In-browser extraction (no closure over Node). Single-frame viewport coordinates.
 */
function browserExtractGeometry(): { layout: LayoutSnapshot; tree: TreeSnapshot } {
  const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template'])
  const LEAF_FORM_TAGS = new Set(['input', 'textarea', 'select'])

  function textWithoutNestedControls(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (!(node instanceof Element)) return ''
    const tag = node.tagName.toLowerCase()
    if (LEAF_FORM_TAGS.has(tag) || tag === 'button') return ''
    let out = ''
    for (const child of node.childNodes) out += textWithoutNestedControls(child)
    return out
  }

  function getAccessibleName(el: Element): string | undefined {
    const role = el.getAttribute('role')
    const aria = el.getAttribute('aria-label')
    if (aria) return aria.trim() || undefined
    const labelledBy = el.getAttribute('aria-labelledby')
    if (labelledBy) {
      const resolveChain = (ids: string, visited: Set<string>): string =>
        ids
          .split(/\s+/)
          .map(id => {
            if (visited.has(id)) return ''
            visited.add(id)
            const target = document.getElementById(id)
            if (!target) return ''
            const chained = target.getAttribute('aria-labelledby')
            if (chained) return resolveChain(chained, visited)
            return textWithoutNestedControls(target).replace(/\s+/g, ' ').trim()
          })
          .filter(Boolean)
          .join(' ')
          .trim()
      const text = resolveChain(labelledBy, new Set<string>())
      if (text) return text.length > 100 ? text.slice(0, 100) : text
    }
    if (
      (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) &&
      el.labels &&
      el.labels.length > 0
    ) {
      const t = textWithoutNestedControls(el.labels[0]!).replace(/\s+/g, ' ').trim()
      if (t) return t
    }
    if (el instanceof HTMLElement && el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      const t = label ? textWithoutNestedControls(label).replace(/\s+/g, ' ').trim() : ''
      if (t) return t
    }
    if (el.parentElement?.tagName.toLowerCase() === 'label') {
      const t = textWithoutNestedControls(el.parentElement).replace(/\s+/g, ' ').trim()
      if (t) return t
    }
    if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type)) {
      const value = el.value?.trim()
      if (value) return value.length > 100 ? value.slice(0, 100) : value
    }
    const alt = el.getAttribute('alt')
    if (alt) return alt.trim() || undefined
    if (el.tagName.toLowerCase() === 'a' || el.tagName.toLowerCase() === 'button' || role === 'link' || role === 'button') {
      const descendantAlt = Array.from(el.querySelectorAll('img[alt]'))
        .map(img => img.getAttribute('alt')?.trim() ?? '')
        .find(Boolean)
      if (descendantAlt) return descendantAlt.length > 100 ? descendantAlt.slice(0, 100) : descendantAlt
    }
    const title = el.getAttribute('title')
    if (title) return title.trim() || undefined
    const textLikeControl =
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLInputElement && !['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'hidden', 'range', 'color'].includes(el.type)) ||
      role === 'textbox' ||
      role === 'combobox'
    const placeholder = el.getAttribute('aria-placeholder') || (textLikeControl ? el.getAttribute('placeholder') : null)
    if (placeholder) return placeholder.trim() || undefined
    const tc = textWithoutNestedControls(el).replace(/\s+/g, ' ').trim()
    if (tc && tc.length > 0) {
      return tc.length > 100 ? tc.slice(0, 100) : tc
    }
    return undefined
  }

  function isFocusable(el: Element): boolean {
    const h = el as HTMLElement
    if (h instanceof HTMLButtonElement && h.disabled) return false
    if (h instanceof HTMLInputElement && h.disabled) return false
    if (h instanceof HTMLSelectElement && h.disabled) return false
    if (h instanceof HTMLTextAreaElement && h.disabled) return false
    if (h.isContentEditable) return true
    const tab = h.tabIndex
    if (typeof tab === 'number' && tab >= 0) return true
    const tag = el.tagName.toLowerCase()
    return ['a', 'button', 'input', 'select', 'textarea'].includes(tag)
  }

  function shouldKeepDespiteOpacity(el: Element): boolean {
    const tag = el.tagName.toLowerCase()
    if (tag === 'input') {
      const type = (el as HTMLInputElement).type
      if (type === 'checkbox' || type === 'radio') return true
    }
    const role = el.getAttribute('role')
    return role === 'checkbox' || role === 'radio' || role === 'switch'
  }

  function readCheckedState(el: Element): boolean | 'mixed' | undefined {
    const ariaChecked = el.getAttribute('aria-checked')
    if (ariaChecked === 'mixed') return 'mixed'
    if (ariaChecked === 'true') return true
    if (ariaChecked === 'false') return false
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      if (el.indeterminate) return 'mixed'
      return el.checked
    }
    return undefined
  }

  function isTextLikeControl(el: Element): boolean {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
    if (el instanceof HTMLInputElement) {
      return !['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'hidden', 'range', 'color'].includes(el.type)
    }
    const role = el.getAttribute('role')
    return role === 'textbox' || role === 'combobox'
  }

  function normalizedControlValue(value: string | undefined): string | undefined {
    const trimmed = value?.replace(/\s+/g, ' ').trim()
    if (!trimmed) return undefined
    return trimmed.length > 240 ? trimmed.slice(0, 240) : trimmed
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
    return normalizedControlValue(text)
  }

  function controlRequired(el: Element): boolean {
    const ariaRequired = el.getAttribute('aria-required')
    if (ariaRequired === 'true') return true
    if (ariaRequired === 'false') return false
    return (
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) &&
      el.required
    )
  }

  function controlInvalid(el: Element): boolean {
    const ariaInvalid = el.getAttribute('aria-invalid')
    if (ariaInvalid && ariaInvalid !== 'false') return true
    if (ariaInvalid === 'false') return false
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      try {
        if (el.willValidate) return !el.checkValidity()
      } catch {
        return false
      }
    }
    return false
  }

  function controlBusy(el: Element): boolean {
    return el.getAttribute('aria-busy') === 'true'
  }

  function looksLikeValidationText(value: string): boolean {
    return /\b(required|invalid|must|please|enter|select|choose|upload|missing|error)\b/i.test(value)
  }

  function controlErrorText(el: Element): string | undefined {
    const err = referencedText(el.getAttribute('aria-errormessage'))
    if (err) return err
    if (!controlInvalid(el)) return undefined
    const described = referencedText(el.getAttribute('aria-describedby'))
    if (described && looksLikeValidationText(described)) return described
    return undefined
  }

  function controlDescriptionText(el: Element): string | undefined {
    const described = referencedText(el.getAttribute('aria-describedby'))
    if (!described) return undefined
    const error = controlErrorText(el)
    return described === error ? undefined : described
  }

  function controlValueText(el: Element): string | undefined {
    if (el instanceof HTMLInputElement) {
      if (el.type === 'password') return el.value ? '••••••••' : undefined
      if (el.type === 'file') {
        if (el.files && el.files.length > 0) {
          return normalizedControlValue(Array.from(el.files).map(file => file.name).join(', '))
        }
        return undefined
      }
      if (!isTextLikeControl(el)) return undefined
      return normalizedControlValue(el.value || el.getAttribute('aria-valuetext') || undefined)
    }
    if (el instanceof HTMLTextAreaElement) {
      return normalizedControlValue(el.value || el.getAttribute('aria-valuetext') || undefined)
    }
    if (el instanceof HTMLSelectElement) {
      return normalizedControlValue(
        el.selectedOptions[0]?.textContent || el.value || el.getAttribute('aria-valuetext') || undefined,
      )
    }
    if (el instanceof HTMLElement && el.isContentEditable) {
      return normalizedControlValue(el.innerText || el.textContent || el.getAttribute('aria-valuetext') || undefined)
    }

    const role = el.getAttribute('role')
    if (role === 'combobox' || role === 'textbox') {
      return normalizedControlValue(
        el.getAttribute('aria-valuetext') ||
          (el as HTMLElement).innerText ||
          el.textContent ||
          undefined,
      )
    }

    return undefined
  }

  function pickMeaningfulControlRect(el: Element): DOMRect {
    const h = el as HTMLElement
    const rect = h.getBoundingClientRect()
    if (!isTextLikeControl(el)) return rect
    if (rect.width >= 80 && rect.height >= 24) return rect

    let best = rect
    let bestScore = Number.POSITIVE_INFINITY
    let current = h.parentElement
    let depth = 0

    while (current && depth < 6) {
      const style = getComputedStyle(current)
      const candidate = current.getBoundingClientRect()
      if (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        candidate.width > 0 &&
        candidate.height > 0 &&
        candidate.width >= rect.width &&
        candidate.height >= rect.height &&
        candidate.width <= window.innerWidth * 0.98 &&
        candidate.height <= Math.max(window.innerHeight * 0.9, 320)
      ) {
        const largeEnough = candidate.width >= 80 || candidate.height >= 24
        if (largeEnough) {
          const area = candidate.width * candidate.height
          const score = area + depth * 1000
          if (score < bestScore) {
            best = candidate
            bestScore = score
          }
        }
      }
      current = current.parentElement
      depth++
    }

    return best
  }

  function shouldSkip(el: Element): boolean {
    const tag = el.tagName.toLowerCase()
    if (SKIP_TAGS.has(tag)) return true
    const h = el as HTMLElement
    const style = getComputedStyle(h)
    if (style.display === 'none' || style.visibility === 'hidden') return true
    const rect = h.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return true
    const op = parseFloat(style.opacity)
    if (op === 0 && !shouldKeepDespiteOpacity(el)) return true
    if (tag === 'input' && (el as HTMLInputElement).type === 'hidden') return true
    return false
  }

  function displayedElementChildren(container: Element): Element[] {
    const out: Element[] = []
    for (const c of container.children) {
      if (!shouldSkip(c)) out.push(c)
    }
    const sr = (container as HTMLElement).shadowRoot
    if (sr) {
      for (const c of sr.children) {
        if (!shouldSkip(c)) out.push(c)
      }
    }
    return out
  }

  function defaultRoleForTag(el: Element, tag: string): string | undefined {
    const explicit = el.getAttribute('role')
    if (explicit) return explicit
    if (tag === 'nav') return 'navigation'
    if (tag === 'main') return 'main'
    if (tag === 'article') return 'article'
    if (tag === 'section') return 'region'
    if (tag === 'ul' || tag === 'ol') return 'list'
    if (tag === 'li') return 'listitem'
    if (tag === 'form') return 'form'
    if (tag === 'button') return 'button'
    if (tag === 'a') return 'link'
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      return 'heading'
    }
    if (tag === 'img') return 'img'
    if (tag === 'input') {
      const t = (el as HTMLInputElement).type
      if (t === 'checkbox') return 'checkbox'
      if (t === 'radio') return 'radio'
      if (t === 'submit' || t === 'button' || t === 'reset') return 'button'
      return 'textbox'
    }
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea') return 'textbox'
    return undefined
  }

  function semanticFor(el: Element, tag: string): Record<string, unknown> {
    const semantic: Record<string, unknown> = { tag }
    const role = defaultRoleForTag(el, tag)
    if (role) semantic.role = role
    const al = el.getAttribute('aria-label')
    if (al) semantic.ariaLabel = al
    const valueText = controlValueText(el)
    if (valueText) semantic.valueText = valueText
    if (controlRequired(el)) semantic.ariaRequired = true
    if (controlInvalid(el)) semantic.ariaInvalid = true
    if (controlBusy(el)) semantic.ariaBusy = true
    const validationDescription = controlDescriptionText(el)
    if (validationDescription) semantic.validationDescription = validationDescription
    const validationError = controlErrorText(el)
    if (validationError) semantic.validationError = validationError
    if (isTextLikeControl(el)) {
      const placeholder = el.getAttribute('placeholder')?.trim()
      if (placeholder) semantic.placeholder = placeholder
      const pattern = el.getAttribute('pattern')
      if (pattern) semantic.inputPattern = pattern
      const inputType = (el instanceof HTMLInputElement) ? el.type : undefined
      if (inputType && ['date', 'tel', 'email', 'url', 'number'].includes(inputType)) {
        semantic.inputType = inputType
      }
      const autocomplete = el.getAttribute('autocomplete')?.trim()
      if (autocomplete && autocomplete !== 'off' && autocomplete !== 'on') {
        semantic.autocomplete = autocomplete
      }
    }
    const h = el as HTMLElement
    if (h instanceof HTMLInputElement && h.disabled) semantic.ariaDisabled = true
    if (h instanceof HTMLButtonElement && h.disabled) semantic.ariaDisabled = true
    if (h instanceof HTMLSelectElement && h.disabled) semantic.ariaDisabled = true
    if (h instanceof HTMLTextAreaElement && h.disabled) semantic.ariaDisabled = true
    const exp = el.getAttribute('aria-expanded')
    if (exp !== null) semantic.ariaExpanded = exp === 'true'
    const sel = el.getAttribute('aria-selected')
    if (sel !== null) semantic.ariaSelected = sel === 'true'
    const checked = readCheckedState(el)
    if (checked !== undefined) semantic.ariaChecked = checked
    if (tag === 'img') {
      const alt = el.getAttribute('alt')
      if (alt) semantic.alt = alt
    }
    if (document.activeElement === el) semantic.focused = true
    if (h.isContentEditable) semantic.role = 'textbox'
    return semantic
  }

  function handlersFor(focusable: boolean): TreeSnapshot['handlers'] | undefined {
    if (!focusable) return undefined
    return { onClick: true, onKeyDown: true, onKeyUp: true }
  }

  function extractFormControl(el: Element, tag: string): { layout: LayoutSnapshot; tree: TreeSnapshot } {
    const h = el as HTMLElement
    const rect = pickMeaningfulControlRect(el)
    const layout: LayoutSnapshot = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      children: [],
    }
    const name = getAccessibleName(el)
    const sem = semanticFor(el, tag)
    if (h instanceof HTMLInputElement && h.type === 'file') {
      sem.role = 'button'
      sem.fileInput = true
    }
    if (name && !sem.ariaLabel) sem.ariaLabel = name
    const focusable = isFocusable(el)
    const tree: TreeSnapshot = {
      kind: 'box',
      props: {},
      semantic: sem,
      handlers: handlersFor(focusable),
    }
    return { layout, tree }
  }

  function extractImage(el: HTMLImageElement): { layout: LayoutSnapshot; tree: TreeSnapshot } {
    const rect = el.getBoundingClientRect()
    const layout: LayoutSnapshot = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      children: [],
    }
    const tree: TreeSnapshot = {
      kind: 'image',
      props: { src: el.currentSrc || el.src || '', alt: el.alt || '' },
      semantic: { tag: 'img', alt: el.alt || undefined, role: 'img' },
    }
    return { layout, tree }
  }

  function extractElement(el: Element): { layout: LayoutSnapshot; tree: TreeSnapshot } | null {
    if (shouldSkip(el)) return null
    const tag = el.tagName.toLowerCase()
    if (tag === 'img' && el instanceof HTMLImageElement) return extractImage(el)
    if (LEAF_FORM_TAGS.has(tag)) return extractFormControl(el, tag)

    if (tag === 'iframe' && el instanceof HTMLIFrameElement) {
      const iframe = el as HTMLIFrameElement
      const rect = iframe.getBoundingClientRect()
      const layout: LayoutSnapshot = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        children: [],
      }
      const sem = semanticFor(iframe, 'iframe')
      sem.iframe = true
      sem.iframePlaceholder = true
      return {
        layout,
        tree: {
          kind: 'box',
          props: {},
          semantic: sem,
          handlers: handlersFor(isFocusable(iframe)),
          children: [],
        },
      }
    }

    const h = el as HTMLElement
    const rect = h.getBoundingClientRect()
    const layout: LayoutSnapshot = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      children: [],
    }

    const elementChildren = displayedElementChildren(el)
    if (elementChildren.length === 0) {
      const text = (el.textContent || '').trim()
      if (text.length > 0) {
        const sem = semanticFor(el, tag)
        const name = getAccessibleName(el)
        if (name && !sem.ariaLabel) sem.ariaLabel = name
        const focusable = isFocusable(el)
        const tree: TreeSnapshot = {
          kind: 'text',
          props: { text, font: '16px system-ui', lineHeight: 1.2 },
          semantic: sem,
          handlers: handlersFor(focusable),
        }
        return { layout, tree }
      }
      const sem = semanticFor(el, tag)
      const name = getAccessibleName(el)
      if (name && !sem.ariaLabel) sem.ariaLabel = name
      const focusable = isFocusable(el)
      const tree: TreeSnapshot = {
        kind: 'box',
        props: {},
        semantic: sem,
        handlers: handlersFor(focusable),
      }
      return { layout, tree }
    }

    const treeChildren: TreeSnapshot[] = []
    for (const child of elementChildren) {
      const sub = extractElement(child)
      if (sub) {
        layout.children.push(sub.layout)
        treeChildren.push(sub.tree)
      }
    }
    const sem = semanticFor(el, tag)
    const name = getAccessibleName(el)
    if (name && !sem.ariaLabel) sem.ariaLabel = name
    const focusable = isFocusable(el)
    const tree: TreeSnapshot = {
      kind: 'box',
      props: {},
      semantic: sem,
      handlers: handlersFor(focusable),
      children: treeChildren,
    }
    return { layout, tree }
  }

  const body = document.body
  if (!body) {
    const emptyLayout: LayoutSnapshot = { x: 0, y: 0, width: 0, height: 0, children: [] }
    const emptyTree: TreeSnapshot = { kind: 'box', props: {}, semantic: { tag: 'body' }, children: [] }
    return { layout: emptyLayout, tree: emptyTree }
  }

  const elementChildren = displayedElementChildren(body)
  const layout: LayoutSnapshot = {
    x: 0,
    y: 0,
    width: Math.round(document.documentElement.clientWidth),
    height: Math.round(document.documentElement.clientHeight),
    children: [],
  }
  const treeChildren: TreeSnapshot[] = []
  for (const child of elementChildren) {
    const sub = extractElement(child)
    if (sub) {
      layout.children.push(sub.layout)
      treeChildren.push(sub.tree)
    }
  }
  const tree: TreeSnapshot = {
    kind: 'box',
    props: {},
    semantic: {
      tag: 'body',
      role: 'group',
      pageUrl: location.href,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    children: treeChildren,
  }
  return { layout, tree }
}

function cloneLayout(layout: LayoutSnapshot): LayoutSnapshot {
  return structuredClone(layout)
}

function cloneTree(tree: TreeSnapshot): TreeSnapshot {
  return structuredClone(tree)
}

export interface ExtractGeometryTrace {
  mainFrameMs?: number
  iframeCount?: number
  iframeMergeMs?: number
  axDecisionMs?: number
  axEnrichMs?: number
  axRan?: boolean
  treeJsonMs?: number
  totalMs?: number
}

async function captureFrameGeometry(frame: Frame): Promise<{ layout: LayoutSnapshot; tree: TreeSnapshot }> {
  const raw = await frame.evaluate(browserExtractGeometry)
  return {
    layout: raw.layout as LayoutSnapshot,
    tree: raw.tree as TreeSnapshot,
  }
}

export async function extractFrameGeometry(frame: Frame): Promise<GeometrySnapshot> {
  const { tree, layout } = await captureFrameGeometry(frame)
  return {
    layout,
    tree,
    treeJson: JSON.stringify(tree),
  }
}

export async function mergeAllIframes(
  tree: TreeSnapshot,
  layout: LayoutSnapshot,
  ownerFrame: Frame,
): Promise<void> {
  if (ownerFrame.childFrames().length === 0) return

  async function dfs(t: TreeSnapshot, l: LayoutSnapshot, f: Frame): Promise<void> {
    const subFrames = f.childFrames()
    if (subFrames.length === 0) return
    let slot = 0
    const tch = t.children ?? []
    const lch = l.children
    for (let i = 0; i < tch.length; i++) {
      const st = tch[i]!
      const sl = lch[i]!
      if (st.semantic?.tag === 'iframe') {
        const cf = subFrames[slot++]
        if (cf && !cf.isDetached()) {
          const snap = await captureFrameGeometry(cf)
          await mergeAllIframes(snap.tree, snap.layout, cf)
          const { x: ox, y: oy } = await frameOriginInRootPage(cf)
          sl.children = snap.layout.children.map(c => {
            const copy = cloneLayout(c)
            offsetLayoutSubtree(copy, ox, oy)
            return copy
          })
          st.children = (snap.tree.children ?? []).map(cloneTree)
          st.semantic = { ...st.semantic, frameUrl: cf.url() }
          await dfs(st, sl, cf)
        }
      } else {
        await dfs(st, sl, f)
      }
    }
  }
  await dfs(tree, layout, ownerFrame)
}

export interface ExtractGeometryOptions {
  axSessionManager?: CdpAxSessionManager
  trace?: ExtractGeometryTrace
}

/**
 * Full page: main frame + every nested iframe (any origin) + optional CDP AX name enrichment.
 */
export async function extractGeometry(page: Page, options?: ExtractGeometryOptions): Promise<GeometrySnapshot> {
  const trace = options?.trace
  const totalStartedAt = performance.now()

  const mainFrameStartedAt = performance.now()
  const mainFrame = await captureFrameGeometry(page.mainFrame())
  if (trace) {
    trace.mainFrameMs = performance.now() - mainFrameStartedAt
    trace.iframeCount = Math.max(0, page.frames().length - 1)
  }
  const main: GeometrySnapshot = {
    layout: mainFrame.layout,
    tree: mainFrame.tree,
    treeJson: '',
  }

  const iframeMergeStartedAt = performance.now()
  await mergeAllIframes(main.tree, main.layout, page.mainFrame())
  if (trace) {
    trace.iframeMergeMs = performance.now() - iframeMergeStartedAt
  }

  const axDecisionStartedAt = performance.now()
  const shouldRunAxEnrichment = shouldEnrichSnapshotWithCdpAx(main)
  if (trace) {
    trace.axDecisionMs = performance.now() - axDecisionStartedAt
    trace.axRan = shouldRunAxEnrichment
  }

  if (shouldRunAxEnrichment) {
    const axEnrichStartedAt = performance.now()
    await enrichSnapshotWithCdpAx(page, main, options?.axSessionManager)
    if (trace) {
      trace.axEnrichMs = performance.now() - axEnrichStartedAt
    }
  }

  const treeJsonStartedAt = performance.now()
  main.treeJson = JSON.stringify(main.tree)
  if (trace) {
    trace.treeJsonMs = performance.now() - treeJsonStartedAt
    trace.totalMs = performance.now() - totalStartedAt
  }
  return main
}

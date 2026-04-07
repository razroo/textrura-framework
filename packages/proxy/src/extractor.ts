import type { Frame, Page } from 'playwright'
import { enrichSnapshotWithCdpAx } from './a11y-enrich.js'
import { frameOriginInRootPage } from './frame-offset.js'
import { offsetLayoutSubtree } from './layout-offset.js'
import type { GeometrySnapshot, LayoutSnapshot, TreeSnapshot } from './types.js'

/**
 * In-browser extraction (no closure over Node). Single-frame viewport coordinates.
 */
function browserExtractGeometry(): { layout: LayoutSnapshot; tree: TreeSnapshot } {
  const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template'])
  const LEAF_FORM_TAGS = new Set(['input', 'textarea', 'select'])

  function getAccessibleName(el: Element): string | undefined {
    const aria = el.getAttribute('aria-label')
    if (aria) return aria.trim() || undefined
    const alt = el.getAttribute('alt')
    if (alt) return alt.trim() || undefined
    const title = el.getAttribute('title')
    if (title) return title.trim() || undefined
    const ph = el.getAttribute('placeholder')
    if (ph) return ph.trim() || undefined
    if (el instanceof HTMLInputElement && el.labels && el.labels.length > 0) {
      const t = el.labels[0]!.textContent?.trim()
      if (t) return t
    }
    const tc = el.textContent?.trim()
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
    if (h.isContentEditable) semantic.role = 'textbox'
    return semantic
  }

  function handlersFor(focusable: boolean): TreeSnapshot['handlers'] | undefined {
    if (!focusable) return undefined
    return { onClick: true, onKeyDown: true, onKeyUp: true }
  }

  function extractFormControl(el: Element, tag: string): { layout: LayoutSnapshot; tree: TreeSnapshot } {
    const h = el as HTMLElement
    const rect = h.getBoundingClientRect()
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
    semantic: { tag: 'body', role: 'group' },
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

export async function extractFrameGeometry(frame: Frame): Promise<GeometrySnapshot> {
  const raw = await frame.evaluate(browserExtractGeometry)
  const tree = raw.tree as TreeSnapshot
  const layout = raw.layout as LayoutSnapshot
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
  async function dfs(t: TreeSnapshot, l: LayoutSnapshot, f: Frame): Promise<void> {
    const subFrames = f.childFrames()
    let slot = 0
    const tch = t.children ?? []
    const lch = l.children
    for (let i = 0; i < tch.length; i++) {
      const st = tch[i]!
      const sl = lch[i]!
      if (st.semantic?.tag === 'iframe') {
        const cf = subFrames[slot++]
        if (cf && !cf.isDetached()) {
          const snap = await extractFrameGeometry(cf)
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

/**
 * Full page: main frame + every nested iframe (any origin) + optional CDP AX name enrichment.
 */
export async function extractGeometry(page: Page): Promise<GeometrySnapshot> {
  const main = await extractFrameGeometry(page.mainFrame())
  await mergeAllIframes(main.tree, main.layout, page.mainFrame())
  await enrichSnapshotWithCdpAx(page, main)
  return {
    layout: main.layout,
    tree: main.tree,
    treeJson: JSON.stringify(main.tree),
  }
}

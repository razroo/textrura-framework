import type { Page } from 'playwright'
import type { GeometrySnapshot, LayoutSnapshot, TreeSnapshot } from './types.js'

/**
 * Walks the live DOM under `document.body` and returns parallel layout + synthetic Geometra UI trees
 * so `@geometra/mcp` `buildA11yTree` can derive roles, names, and bounds.
 */
export async function extractGeometry(page: Page): Promise<GeometrySnapshot> {
  const raw = await page.evaluate(() => {
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

    function shouldSkip(el: Element): boolean {
      const tag = el.tagName.toLowerCase()
      if (SKIP_TAGS.has(tag)) return true
      const h = el as HTMLElement
      const style = getComputedStyle(h)
      if (style.display === 'none' || style.visibility === 'hidden') return true
      const rect = h.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return true
      const op = parseFloat(style.opacity)
      if (op === 0) return true
      if (tag === 'input' && (el as HTMLInputElement).type === 'hidden') return true
      return false
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

      const h = el as HTMLElement
      const rect = h.getBoundingClientRect()
      const layout: LayoutSnapshot = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        children: [],
      }

      const elementChildren = Array.from(el.children).filter(c => !shouldSkip(c))
      if (elementChildren.length === 0) {
        const text = (el.textContent || '').trim()
        if (text.length > 0) {
          const tree: TreeSnapshot = {
            kind: 'text',
            props: { text, font: '16px system-ui', lineHeight: 1.2 },
            semantic: { tag },
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

    const elementChildren = Array.from(body.children).filter(c => !shouldSkip(c))
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
  })

  const tree = raw.tree as TreeSnapshot
  const layout = raw.layout as LayoutSnapshot
  return {
    layout,
    tree,
    treeJson: JSON.stringify(tree),
  }
}

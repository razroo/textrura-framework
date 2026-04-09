import type { CDPSession, Page } from 'playwright'
import type { GeometrySnapshot, LayoutSnapshot, TreeSnapshot } from './types.js'

interface AxBounds {
  left: number
  top: number
  width: number
  height: number
}

interface AxSnapshotCandidate {
  name?: string
  role: string
  bounds: AxBounds
  selected?: boolean
  expanded?: boolean
  checked?: boolean | 'mixed'
  disabled?: boolean
  focused?: boolean
}

export interface CdpAxSessionManager {
  get(page: Page): Promise<CDPSession>
  reset(): Promise<void>
  close(): Promise<void>
}

const INTERACTIVE_AX_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'combobox',
  'checkbox',
  'radio',
  'tab',
])

const INTERESTING_AX_ROLES = new Set([
  ...INTERACTIVE_AX_ROLES,
  'heading',
  'text',
  'img',
  'navigation',
  'main',
  'form',
  'article',
  'dialog',
  'alertdialog',
  'region',
  'list',
  'listitem',
  'tablist',
  'tabpanel',
])

function parseAxBounds(props: unknown[] | undefined): AxBounds | null {
  if (!Array.isArray(props)) return null
  for (const p of props) {
    if (p && typeof p === 'object' && 'name' in p && 'value' in p) {
      const name = (p as { name: unknown }).name
      const value = (p as { value: unknown }).value
      if (name === 'bounds' && value && typeof value === 'object' && value !== null) {
        const v = value as Record<string, unknown>
        const left = Number(v.left)
        const top = Number(v.top)
        const width = Number(v.width)
        const height = Number(v.height)
        if ([left, top, width, height].every(Number.isFinite)) {
          return { left, top, width, height }
        }
      }
    }
  }
  return null
}

function quadToBounds(quad: number[] | undefined): AxBounds | null {
  if (!Array.isArray(quad) || quad.length < 8) return null
  const xs = [quad[0], quad[2], quad[4], quad[6]].map(Number)
  const ys = [quad[1], quad[3], quad[5], quad[7]].map(Number)
  if (![...xs, ...ys].every(Number.isFinite)) return null
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

function boundsIntersectsViewport(b: AxBounds, root: LayoutSnapshot): boolean {
  return (
    b.left + b.width >= root.x &&
    b.left <= root.x + root.width &&
    b.top + b.height >= root.y &&
    b.top <= root.y + root.height
  )
}

function parseAxPropertyValue(props: unknown[] | undefined, expectedName: string): unknown {
  if (!Array.isArray(props)) return undefined
  for (const p of props) {
    if (p && typeof p === 'object' && 'name' in p && 'value' in p) {
      const name = (p as { name: unknown }).name
      if (name === expectedName) return (p as { value: unknown }).value
    }
  }
  return undefined
}

function parseAxBooleanProperty(props: unknown[] | undefined, expectedName: string): boolean | undefined {
  const value = parseAxPropertyValue(props, expectedName)
  if (value === true || value === false) return value
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const nested = (value as { value: unknown }).value
    if (nested === true || nested === false) return nested
    if (nested === 'true') return true
    if (nested === 'false') return false
  }
  return undefined
}

function parseAxCheckedProperty(props: unknown[] | undefined): boolean | 'mixed' | undefined {
  const value = parseAxPropertyValue(props, 'checked')
  if (value === 'mixed') return 'mixed'
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  if (value && typeof value === 'object' && 'value' in value) {
    const nested = (value as { value: unknown }).value
    if (nested === 'mixed') return 'mixed'
    if (nested === true || nested === false) return nested
    if (nested === 'true') return true
    if (nested === 'false') return false
  }
  return undefined
}

function normalizeAxRole(rawRole: string | undefined): string | undefined {
  if (!rawRole) return undefined
  const normalized = rawRole.trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (!normalized) return undefined
  if (normalized === 'rootwebarea' || normalized === 'webarea' || normalized === 'inlinetextbox') return undefined
  if (normalized === 'statictext' || normalized === 'labeltext' || normalized === 'text') return 'text'
  if (normalized === 'image') return 'img'
  if (normalized === 'searchbox' || normalized === 'textarea' || normalized === 'textinput') return 'textbox'
  if (normalized === 'editablecombobox') return 'combobox'
  if (normalized === 'radiobutton') return 'radio'
  if (normalized === 'listboxoption' || normalized === 'option') return 'listitem'
  if (normalized === 'menubutton' || normalized === 'menuitem') return 'button'
  if (normalized === 'contentinfo') return 'contentinfo'
  return normalized
}

function countMeaningfulSnapshotNodes(node: TreeSnapshot, isRoot = true): number {
  const semantic = node.semantic ?? {}
  const role = typeof semantic.role === 'string' ? semantic.role : undefined
  const text = typeof node.props.text === 'string' ? node.props.text.trim() : ''
  let count = 0
  if (!isRoot) {
    if (node.handlers || text || (role && role !== 'group')) count++
  }
  for (const child of node.children ?? []) {
    count += countMeaningfulSnapshotNodes(child, false)
  }
  return count
}

function snapshotNodeLabel(node: TreeSnapshot): string | undefined {
  const semantic = node.semantic ?? {}
  const ariaLabel = typeof semantic.ariaLabel === 'string' ? semantic.ariaLabel.trim() : ''
  if (ariaLabel) return ariaLabel
  const text = typeof node.props.text === 'string' ? node.props.text.trim() : ''
  if (text) return text
  const valueText = typeof semantic.valueText === 'string' ? semantic.valueText.trim() : ''
  return valueText || undefined
}

interface UnnamedInteractiveSnapshotSummary {
  criticalCount: number
  ignoredTinyLinkCount: number
}

function summarizeUnnamedInteractiveSnapshotNodes(
  tree: TreeSnapshot,
  layout: LayoutSnapshot,
  isRoot = true,
): UnnamedInteractiveSnapshotSummary {
  const summary: UnnamedInteractiveSnapshotSummary = {
    criticalCount: 0,
    ignoredTinyLinkCount: 0,
  }

  if (!isRoot) {
    const semantic = tree.semantic ?? {}
    const role = typeof semantic.role === 'string' ? semantic.role : undefined
    const interactive =
      (role !== undefined && INTERACTIVE_AX_ROLES.has(role)) ||
      !!tree.handlers?.onClick ||
      !!tree.handlers?.onKeyDown ||
      !!tree.handlers?.onKeyUp
    if (interactive && !snapshotNodeLabel(tree)) {
      const isTinyLink =
        role === 'link' &&
        layout.width > 0 &&
        layout.height > 0 &&
        layout.width <= 56 &&
        layout.height <= 56 &&
        layout.width * layout.height <= 2_500
      if (isTinyLink) {
        summary.ignoredTinyLinkCount += 1
      } else {
        summary.criticalCount += 1
      }
    }
  }

  const treeChildren = tree.children ?? []
  for (let i = 0; i < treeChildren.length; i++) {
    const childSummary = summarizeUnnamedInteractiveSnapshotNodes(treeChildren[i]!, layout.children[i]!, false)
    summary.criticalCount += childSummary.criticalCount
    summary.ignoredTinyLinkCount += childSummary.ignoredTinyLinkCount
  }

  return summary
}

export function shouldEnrichSnapshotWithCdpAx(snap: GeometrySnapshot): boolean {
  if (countMeaningfulSnapshotNodes(snap.tree) <= 1) return true
  const unnamed = summarizeUnnamedInteractiveSnapshotNodes(snap.tree, snap.layout)
  return unnamed.criticalCount > 0 || unnamed.ignoredTinyLinkCount > 1
}

async function detachCdpSession(session: CDPSession | undefined): Promise<void> {
  try {
    await session?.detach()
  } catch {
    /* ignore */
  }
}

async function createEnabledCdpSession(page: Page): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Accessibility.enable')
    try {
      await session.send('DOM.enable')
    } catch {
      /* optional */
    }
    return session
  } catch (err) {
    await detachCdpSession(session)
    throw err
  }
}

function isRecoverableCdpSessionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /Session closed|Target closed|Browser has been closed|page has been closed|Protocol error/i.test(message)
}

export function createCdpAxSessionManager(): CdpAxSessionManager {
  let activeSession: CDPSession | undefined
  let sessionPromise: Promise<CDPSession> | undefined

  const clear = async (): Promise<void> => {
    const pending = sessionPromise
    sessionPromise = undefined
    const session = activeSession ?? await pending?.catch(() => undefined)
    activeSession = undefined
    await detachCdpSession(session)
  }

  return {
    async get(page: Page): Promise<CDPSession> {
      if (activeSession) return activeSession
      if (!sessionPromise) {
        sessionPromise = createEnabledCdpSession(page)
          .then(session => {
            activeSession = session
            return session
          })
          .catch(err => {
            activeSession = undefined
            sessionPromise = undefined
            throw err
          })
      }
      return sessionPromise
    },
    reset: clear,
    close: clear,
  }
}

function buildAxFallbackChildren(candidates: AxSnapshotCandidate[]): {
  layoutChildren: LayoutSnapshot[]
  treeChildren: TreeSnapshot[]
} {
  const layoutChildren: LayoutSnapshot[] = []
  const treeChildren: TreeSnapshot[] = []
  const seen = new Set<string>()

  const sorted = [...candidates].sort((a, b) => {
    if (a.bounds.top !== b.bounds.top) return a.bounds.top - b.bounds.top
    return a.bounds.left - b.bounds.left
  })

  for (const candidate of sorted) {
    const rounded = {
      left: Math.round(candidate.bounds.left),
      top: Math.round(candidate.bounds.top),
      width: Math.round(candidate.bounds.width),
      height: Math.round(candidate.bounds.height),
    }
    const key = `${candidate.role}|${candidate.name ?? ''}|${rounded.left}|${rounded.top}|${rounded.width}|${rounded.height}`
    if (seen.has(key)) continue
    seen.add(key)

    const layout: LayoutSnapshot = {
      x: rounded.left,
      y: rounded.top,
      width: rounded.width,
      height: rounded.height,
      children: [],
    }

    const semantic: Record<string, unknown> = {
      tag: 'ax-fallback',
      role: candidate.role,
      a11yEnriched: true,
      a11yFallback: true,
    }
    if (candidate.name) semantic.ariaLabel = candidate.name
    if (candidate.selected !== undefined) semantic.ariaSelected = candidate.selected
    if (candidate.expanded !== undefined) semantic.ariaExpanded = candidate.expanded
    if (candidate.checked !== undefined) semantic.ariaChecked = candidate.checked
    if (candidate.disabled) semantic.ariaDisabled = true
    if (candidate.focused) semantic.focused = true

    const tree: TreeSnapshot = {
      kind: candidate.role === 'text' || candidate.role === 'heading' ? 'text' : candidate.role === 'img' ? 'image' : 'box',
      props:
        candidate.role === 'text' || candidate.role === 'heading'
          ? { text: candidate.name ?? '', font: '16px system-ui', lineHeight: 1.2 }
          : candidate.role === 'img'
            ? { src: '', alt: candidate.name ?? '' }
            : {},
      semantic,
      ...(INTERACTIVE_AX_ROLES.has(candidate.role)
        ? { handlers: { onClick: true, onKeyDown: true, onKeyUp: true } }
        : {}),
    }

    layoutChildren.push(layout)
    treeChildren.push(tree)
  }

  return { layoutChildren, treeChildren }
}

async function boundsForBackendNode(session: CDPSession, backendDOMNodeId: number | undefined): Promise<AxBounds | null> {
  if (!backendDOMNodeId || !Number.isFinite(backendDOMNodeId)) return null
  try {
    const res = (await session.send('DOM.getBoxModel', { backendNodeId: backendDOMNodeId })) as {
      model?: { border?: number[]; content?: number[] }
    }
    return quadToBounds(res.model?.border ?? res.model?.content)
  } catch {
    return null
  }
}

async function collectAxSnapshotCandidates(
  session: CDPSession,
  root: LayoutSnapshot,
): Promise<AxSnapshotCandidate[]> {
  const res = (await session.send('Accessibility.getFullAXTree')) as {
    nodes?: Array<{
      ignored?: boolean
      role?: { value?: string }
      name?: { value?: string }
      properties?: unknown[]
      backendDOMNodeId?: number
    }>
  }
  const nodes = res.nodes ?? []
  const candidates: AxSnapshotCandidate[] = []
  for (const n of nodes) {
    if (n.ignored) continue
    const role = normalizeAxRole(n.role?.value)
    if (!role || !INTERESTING_AX_ROLES.has(role)) continue
    const name = n.name?.value?.trim() || undefined
    const b = parseAxBounds(n.properties as unknown[] | undefined) ??
      await boundsForBackendNode(session, n.backendDOMNodeId)
    if (!b || b.width <= 0 || b.height <= 0) continue
    if (!boundsIntersectsViewport(b, root)) continue
    if (!name && !INTERACTIVE_AX_ROLES.has(role) && role !== 'img') continue
    candidates.push({
      ...(name ? { name } : {}),
      role,
      bounds: b,
      selected: parseAxBooleanProperty(n.properties as unknown[] | undefined, 'selected'),
      expanded: parseAxBooleanProperty(n.properties as unknown[] | undefined, 'expanded'),
      checked: parseAxCheckedProperty(n.properties as unknown[] | undefined),
      disabled: parseAxBooleanProperty(n.properties as unknown[] | undefined, 'disabled'),
      focused: parseAxBooleanProperty(n.properties as unknown[] | undefined, 'focused'),
    })
  }
  return candidates
}

function applyAxSnapshotCandidates(snap: GeometrySnapshot, candidates: AxSnapshotCandidate[]): void {
  const visit = (tNode: TreeSnapshot, lNode: LayoutSnapshot): void => {
    const sem = tNode.semantic
    if (sem?.ariaLabel || sem?.a11yEnriched) {
      /* skip */
    } else {
      const cx = lNode.x + lNode.width / 2
      const cy = lNode.y + lNode.height / 2
      for (const c of candidates) {
        const b = c.bounds
        if (cx >= b.left && cx <= b.left + b.width && cy >= b.top && cy <= b.top + b.height) {
          tNode.semantic = {
            ...(sem ?? {}),
            ariaLabel: c.name,
            a11yRoleHint: c.role,
            a11yEnriched: true,
          }
          break
        }
      }
    }
    const tch = tNode.children ?? []
    const lch = lNode.children
    for (let i = 0; i < tch.length; i++) {
      visit(tch[i]!, lch[i]!)
    }
  }

  visit(snap.tree, snap.layout)

  if (countMeaningfulSnapshotNodes(snap.tree) <= 1) {
    const fallback = buildAxFallbackChildren(candidates)
    if (fallback.treeChildren.length > 0) {
      snap.layout.children = fallback.layoutChildren
      snap.tree.children = fallback.treeChildren
      snap.tree.semantic = {
        ...(snap.tree.semantic ?? {}),
        a11yFallbackUsed: true,
      }
    }
  }
}

/**
 * Use Chrome DevTools `Accessibility.getFullAXTree` to back-fill `semantic.ariaLabel` on nodes
 * whose center falls inside an AX bounds box (helps closed shadow + custom controls).
 */
export async function enrichSnapshotWithCdpAx(
  page: Page,
  snap: GeometrySnapshot,
  sessionManager?: CdpAxSessionManager,
): Promise<void> {
  let temporarySession: CDPSession | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const session = sessionManager
        ? await sessionManager.get(page)
        : (temporarySession = await createEnabledCdpSession(page))
      const candidates = await collectAxSnapshotCandidates(session, snap.layout)
      applyAxSnapshotCandidates(snap, candidates)
      return
    } catch (err) {
      if (sessionManager && attempt === 0 && !page.isClosed() && isRecoverableCdpSessionError(err)) {
        await sessionManager.reset()
        continue
      }
      return
    } finally {
      if (!sessionManager && temporarySession) {
        await detachCdpSession(temporarySession)
        temporarySession = undefined
      }
    }
  }
}

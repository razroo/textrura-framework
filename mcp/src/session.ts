import type { ChildProcess } from 'node:child_process'
import WebSocket from 'ws'
import { spawnGeometraProxy } from './proxy-spawn.js'

/**
 * Parsed accessibility node from the UI tree + computed layout.
 * Mirrors the shape of @geometra/core's AccessibilityNode without importing it
 * (this package is standalone — no dependency on geometra packages).
 */
export interface A11yNode {
  role: string
  name?: string
  state?: { disabled?: boolean; expanded?: boolean; selected?: boolean; checked?: boolean | 'mixed'; focused?: boolean }
  meta?: { pageUrl?: string; scrollX?: number; scrollY?: number }
  bounds: { x: number; y: number; width: number; height: number }
  path: number[]
  children: A11yNode[]
  focusable: boolean
}

/** Flat, viewport-filtered index for token-efficient agent context (see `buildCompactUiIndex`). */
export interface CompactUiNode {
  id: string
  role: string
  name?: string
  state?: A11yNode['state']
  pinned?: boolean
  bounds: { x: number; y: number; width: number; height: number }
  path: number[]
  focusable: boolean
}

export interface CompactUiContext {
  pageUrl?: string
  scrollX?: number
  scrollY?: number
  focusedNode?: CompactUiNode
}

export type PageSectionKind = 'landmark' | 'form' | 'dialog' | 'list'

export type PageArchetype =
  | 'shell'
  | 'form'
  | 'dialog'
  | 'results'
  | 'content'
  | 'dashboard'

interface PageSectionSummaryBase {
  id: string
  role: string
  name?: string
  bounds: { x: number; y: number; width: number; height: number }
}

/** Higher-level webpage structures extracted from the a11y tree. */
export interface PageLandmark extends PageSectionSummaryBase {}

export interface PagePrimaryAction {
  id: string
  role: string
  name?: string
  state?: A11yNode['state']
  bounds: { x: number; y: number; width: number; height: number }
}

export interface PageFormModel extends PageSectionSummaryBase {
  fieldCount: number
  actionCount: number
}

export interface PageDialogModel extends PageSectionSummaryBase {
  fieldCount: number
  actionCount: number
}

export interface PageListModel extends PageSectionSummaryBase {
  itemCount: number
}

export interface PageModel {
  viewport: { width: number; height: number }
  archetypes: PageArchetype[]
  summary: {
    landmarkCount: number
    formCount: number
    dialogCount: number
    listCount: number
    focusableCount: number
  }
  primaryActions: PagePrimaryAction[]
  landmarks: PageLandmark[]
  forms: PageFormModel[]
  dialogs: PageDialogModel[]
  lists: PageListModel[]
}

export interface PageHeadingModel {
  id: string
  name: string
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface PageFieldModel {
  id: string
  role: string
  name?: string
  state?: A11yNode['state']
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface PageActionModel {
  id: string
  role: string
  name?: string
  state?: A11yNode['state']
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface PageListItemModel {
  id: string
  name?: string
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface PageSectionDetail {
  id: string
  kind: PageSectionKind
  role: string
  name?: string
  bounds: { x: number; y: number; width: number; height: number }
  summary: {
    headingCount: number
    fieldCount: number
    actionCount: number
    listCount: number
    itemCount: number
  }
  headings: PageHeadingModel[]
  fields: PageFieldModel[]
  actions: PageActionModel[]
  lists: PageListModel[]
  items: PageListItemModel[]
  textPreview: string[]
}

export interface UiNodeUpdate {
  before: CompactUiNode
  after: CompactUiNode
  changes: string[]
}

export interface UiListCountChange {
  id: string
  name?: string
  beforeCount: number
  afterCount: number
}

export interface UiNavigationChange {
  beforeUrl?: string
  afterUrl?: string
}

export interface UiViewportChange {
  beforeScrollX?: number
  beforeScrollY?: number
  afterScrollX?: number
  afterScrollY?: number
}

export interface UiFocusChange {
  before?: CompactUiNode
  after?: CompactUiNode
}

/** Semantic delta between two compact viewport models. */
export interface UiDelta {
  added: CompactUiNode[]
  removed: CompactUiNode[]
  updated: UiNodeUpdate[]
  dialogsOpened: PageDialogModel[]
  dialogsClosed: PageDialogModel[]
  formsAppeared: PageFormModel[]
  formsRemoved: PageFormModel[]
  listCountsChanged: UiListCountChange[]
  navigation?: UiNavigationChange
  viewport?: UiViewportChange
  focus?: UiFocusChange
}

export interface Session {
  ws: WebSocket
  layout: Record<string, unknown> | null
  tree: Record<string, unknown> | null
  url: string
  /** Present when this session owns a child geometra-proxy process (pageUrl connect). */
  proxyChild?: ChildProcess
}

export interface UpdateWaitResult {
  status: 'updated' | 'acknowledged' | 'timed_out'
  timeoutMs: number
}

let activeSession: Session | null = null
const ACTION_UPDATE_TIMEOUT_MS = 2000

function shutdownPreviousSession(): void {
  const prev = activeSession
  if (!prev) return
  activeSession = null
  try {
    prev.ws.close()
  } catch {
    /* ignore */
  }
  if (prev.proxyChild) {
    try {
      prev.proxyChild.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
}

/**
 * Connect to a running Geometra server. Waits for the first frame so that
 * layout/tree state is available immediately after connection.
 */
export function connect(url: string): Promise<Session> {
  return new Promise((resolve, reject) => {
    shutdownPreviousSession()

    const ws = new WebSocket(url)
    const session: Session = { ws, layout: null, tree: null, url }
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        ws.close()
        reject(new Error(`Connection to ${url} timed out after 10s`))
      }
    }, 10_000)

    ws.on('open', () => {
      // Send initial resize so server computes layout
      ws.send(JSON.stringify({ type: 'resize', width: 1024, height: 768 }))
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data))
        if (msg.type === 'frame') {
          session.layout = msg.layout
          session.tree = msg.tree
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            activeSession = session
            resolve(session)
          }
        } else if (msg.type === 'patch' && session.layout) {
          applyPatches(session.layout, msg.patches)
        }
      } catch { /* ignore malformed messages */ }
    })

    ws.on('error', (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(new Error(`WebSocket error connecting to ${url}: ${err.message}`))
      }
    })

    ws.on('close', () => {
      if (activeSession === session) {
        activeSession = null
        if (session.proxyChild) {
          try {
            session.proxyChild.kill('SIGTERM')
          } catch {
            /* ignore */
          }
        }
      }
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(new Error(`Connection to ${url} closed before first frame`))
      }
    })
  })
}

/**
 * Start geometra-proxy for `pageUrl`, connect to its WebSocket, and attach the child
 * process to the session so disconnect / reconnect can clean it up.
 */
export async function connectThroughProxy(options: {
  pageUrl: string
  port?: number
  headless?: boolean
  width?: number
  height?: number
  slowMo?: number
}): Promise<Session> {
  const { child, wsUrl } = await spawnGeometraProxy({
    pageUrl: options.pageUrl,
    port: options.port ?? 0,
    headless: options.headless,
    width: options.width,
    height: options.height,
    slowMo: options.slowMo,
  })
  try {
    const session = await connect(wsUrl)
    session.proxyChild = child
    return session
  } catch (e) {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    throw e
  }
}

export function getSession(): Session | null {
  return activeSession
}

export function disconnect(): void {
  shutdownPreviousSession()
}

/**
 * Send a click event at (x, y) and wait for the next frame/patch response.
 */
export function sendClick(session: Session, x: number, y: number): Promise<UpdateWaitResult> {
  return sendAndWaitForUpdate(session, {
    type: 'event',
    eventType: 'onClick',
    x,
    y,
  })
}

/**
 * Send a sequence of key events to type text into the focused element.
 */
export function sendType(session: Session, text: string): Promise<UpdateWaitResult> {
  return new Promise((resolve, reject) => {
    if (session.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected'))
      return
    }

    // Send each character as keydown + keyup
    for (const char of text) {
      const keyEvent = {
        type: 'key',
        eventType: 'onKeyDown',
        key: char,
        code: `Key${char.toUpperCase()}`,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }
      session.ws.send(JSON.stringify(keyEvent))
      session.ws.send(JSON.stringify({ ...keyEvent, eventType: 'onKeyUp' }))
    }

    // Wait briefly for server to process and send update
    waitForNextUpdate(session).then(resolve).catch(reject)
  })
}

/**
 * Send a special key (Enter, Tab, Escape, etc.)
 */
export function sendKey(
  session: Session,
  key: string,
  modifiers?: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean },
): Promise<UpdateWaitResult> {
  return sendAndWaitForUpdate(session, {
    type: 'key',
    eventType: 'onKeyDown',
    key,
    code: key,
    shiftKey: modifiers?.shift ?? false,
    ctrlKey: modifiers?.ctrl ?? false,
    metaKey: modifiers?.meta ?? false,
    altKey: modifiers?.alt ?? false,
  })
}

/**
 * Attach local file(s). Paths must exist on the machine running `@geometra/proxy` (not the MCP host).
 * Optional `x`,`y` click opens a file chooser; omit to use the first `input[type=file]` in any frame.
 */
export function sendFileUpload(
  session: Session,
  paths: string[],
  opts?: {
    click?: { x: number; y: number }
    strategy?: 'auto' | 'chooser' | 'hidden' | 'drop'
    drop?: { x: number; y: number }
  },
): Promise<UpdateWaitResult> {
  const payload: Record<string, unknown> = { type: 'file', paths }
  if (opts?.click) {
    payload.x = opts.click.x
    payload.y = opts.click.y
  }
  if (opts?.strategy) payload.strategy = opts.strategy
  if (opts?.drop) {
    payload.dropX = opts.drop.x
    payload.dropY = opts.drop.y
  }
  return sendAndWaitForUpdate(session, payload)
}

/** ARIA `role=option` listbox (e.g. React Select). Optional click opens the list. */
export function sendListboxPick(
  session: Session,
  label: string,
  opts?: { exact?: boolean; open?: { x: number; y: number }; fieldLabel?: string; query?: string },
): Promise<UpdateWaitResult> {
  const payload: Record<string, unknown> = { type: 'listboxPick', label }
  if (opts?.exact !== undefined) payload.exact = opts.exact
  if (opts?.open) {
    payload.openX = opts.open.x
    payload.openY = opts.open.y
  }
  if (opts?.fieldLabel) payload.fieldLabel = opts.fieldLabel
  if (opts?.query) payload.query = opts.query
  return sendAndWaitForUpdate(session, payload)
}

/** Native `<select>` only: click the control center, then pick by value, label text, or zero-based index. */
export function sendSelectOption(
  session: Session,
  x: number,
  y: number,
  option: { value?: string; label?: string; index?: number },
): Promise<UpdateWaitResult> {
  return sendAndWaitForUpdate(session, {
    type: 'selectOption',
    x,
    y,
    ...option,
  })
}

/** Set a checkbox/radio by label instead of relying on coordinate clicks. */
export function sendSetChecked(
  session: Session,
  label: string,
  opts?: { checked?: boolean; exact?: boolean; controlType?: 'checkbox' | 'radio' },
): Promise<UpdateWaitResult> {
  const payload: Record<string, unknown> = { type: 'setChecked', label }
  if (opts?.checked !== undefined) payload.checked = opts.checked
  if (opts?.exact !== undefined) payload.exact = opts.exact
  if (opts?.controlType) payload.controlType = opts.controlType
  return sendAndWaitForUpdate(session, payload)
}

/** Mouse wheel / scroll. Optional `x`,`y` move pointer before scrolling. */
export function sendWheel(
  session: Session,
  deltaY: number,
  opts?: { deltaX?: number; x?: number; y?: number },
): Promise<UpdateWaitResult> {
  return sendAndWaitForUpdate(session, {
    type: 'wheel',
    deltaY,
    deltaX: opts?.deltaX ?? 0,
    ...(opts?.x !== undefined ? { x: opts.x } : {}),
    ...(opts?.y !== undefined ? { y: opts.y } : {}),
  })
}

/**
 * Build a flat accessibility tree from the raw UI tree + layout.
 * This is a standalone reimplementation that works with raw JSON —
 * no dependency on @geometra/core.
 */
export function buildA11yTree(tree: Record<string, unknown>, layout: Record<string, unknown>): A11yNode {
  return walkNode(tree, layout, [])
}

/** Roles that usually matter for interaction or landmarks (non-wrapper noise). */
const COMPACT_INDEX_ROLES = new Set([
  'link',
  'button',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'heading',
  'img',
  'navigation',
  'main',
  'form',
  'article',
  'tablist',
  'tab',
  'listitem',
])

const PINNED_CONTEXT_ROLES = new Set([
  'navigation',
  'main',
  'form',
  'dialog',
  'tablist',
  'tab',
])

const LANDMARK_ROLES = new Set([
  'banner',
  'navigation',
  'main',
  'search',
  'form',
  'article',
  'region',
  'contentinfo',
])

const FORM_FIELD_ROLES = new Set([
  'textbox',
  'combobox',
  'checkbox',
  'radio',
])

const ACTION_ROLES = new Set([
  'button',
  'link',
])

const DIALOG_ROLES = new Set([
  'dialog',
  'alertdialog',
])

const FIELD_LABEL_ROLES = new Set(['textbox', 'combobox', 'checkbox', 'radio'])
const CONTENT_NAME_ROLES = new Set(['heading', 'text'])

function encodePath(path: number[]): string {
  return path.length === 0 ? 'root' : path.map(part => part.toString(36)).join('.')
}

function decodePath(encoded: string): number[] | null {
  if (encoded === 'root') return []
  const parts = encoded.split('.')
  const out: number[] = []
  for (const part of parts) {
    const value = Number.parseInt(part, 36)
    if (!Number.isFinite(value) || value < 0) return null
    out.push(value)
  }
  return out
}

export function nodeIdForPath(path: number[]): string {
  return `n:${encodePath(path)}`
}

function sectionPrefix(kind: PageSectionKind): string {
  if (kind === 'landmark') return 'lm'
  if (kind === 'form') return 'fm'
  if (kind === 'dialog') return 'dg'
  return 'ls'
}

function sectionIdForPath(kind: PageSectionKind, path: number[]): string {
  return `${sectionPrefix(kind)}:${encodePath(path)}`
}

function parseSectionId(id: string): { kind: PageSectionKind; path: number[] } | null {
  const [prefix, encoded] = id.split(':', 2)
  if (!prefix || !encoded) return null
  const path = decodePath(encoded)
  if (!path) return null
  if (prefix === 'lm') return { kind: 'landmark', path }
  if (prefix === 'fm') return { kind: 'form', path }
  if (prefix === 'dg') return { kind: 'dialog', path }
  if (prefix === 'ls') return { kind: 'list', path }
  return null
}

function normalizeUiText(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s*\u00a0\s*/g, ' ').trim()
}

function trimPunctuation(value: string): string {
  return value.replace(/[:*]+$/g, '').trim()
}

function sanitizeInlineName(value: string | undefined, max = 120): string | undefined {
  if (!value) return undefined
  const normalized = normalizeUiText(value)
  if (!normalized) return undefined
  return normalized.length > max ? `${normalized.slice(0, max - 1)}\u2026` : normalized
}

function sanitizeFieldName(value: string | undefined, max = 80): string | undefined {
  const normalized = sanitizeInlineName(value, max + 8)
  if (!normalized) return undefined
  const trimmed = trimPunctuation(normalized)
  if (!trimmed) return undefined
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}\u2026` : trimmed
}

function looksNoisyContainerName(value: string): boolean {
  const starCount = (value.match(/\*/g) ?? []).length
  const labelMatches = value.match(
    /\b(first name|last name|email|phone|country|location|resume|linkedin|portfolio|website|city)\b/gi,
  )
  const tokenCount = value.split(/\s+/).filter(Boolean).length
  if (value.length > 90) return true
  if (starCount >= 2) return true
  if ((labelMatches?.length ?? 0) >= 3) return true
  if (tokenCount >= 12) return true
  return false
}

function sanitizeContainerName(value: string | undefined, max = 80): string | undefined {
  const normalized = sanitizeInlineName(value, max + 24)
  if (!normalized) return undefined
  if (looksNoisyContainerName(normalized)) return undefined
  return normalized.length > max ? `${normalized.slice(0, max - 1)}\u2026` : normalized
}

function intersectsViewport(
  b: { x: number; y: number; width: number; height: number },
  vw: number,
  vh: number,
): boolean {
  return (
    b.width > 0 &&
    b.height > 0 &&
    b.x + b.width > 0 &&
    b.y + b.height > 0 &&
    b.x < vw &&
    b.y < vh
  )
}

function intersectsViewportWithMargin(
  b: { x: number; y: number; width: number; height: number },
  vw: number,
  vh: number,
  marginY: number,
): boolean {
  return (
    b.width > 0 &&
    b.height > 0 &&
    b.x + b.width > 0 &&
    b.x < vw &&
    b.y + b.height > -marginY &&
    b.y < vh + marginY
  )
}

function compactNodeFromA11y(node: A11yNode, pinned = false): CompactUiNode {
  const name = sanitizeInlineName(node.name, 240)
  return {
    id: nodeIdForPath(node.path),
    role: node.role,
    ...(name ? { name } : {}),
    ...(node.state && Object.keys(node.state).length > 0 ? { state: node.state } : {}),
    ...(pinned ? { pinned: true } : {}),
    bounds: { ...node.bounds },
    path: node.path,
    focusable: node.focusable,
  }
}

function pinnedRolePriority(role: string): number {
  if (role === 'tablist') return 0
  if (role === 'tab') return 1
  if (role === 'form') return 2
  if (role === 'dialog') return 3
  if (role === 'navigation') return 4
  if (role === 'main') return 5
  return 6
}

function shouldPinCompactContextNode(node: A11yNode): boolean {
  return PINNED_CONTEXT_ROLES.has(node.role) || node.state?.focused === true
}

function includeInCompactIndex(n: A11yNode): boolean {
  if (n.focusable) return true
  if (COMPACT_INDEX_ROLES.has(n.role)) return true
  if (n.role === 'text' && n.name && n.name.trim().length > 0) return true
  return false
}

/**
 * Flat list of actionable / semantic nodes in the viewport, sorted with focusable first
 * then top-to-bottom reading order. Intended to minimize LLM tokens vs a full nested tree.
 */
export function buildCompactUiIndex(
  root: A11yNode,
  options?: { viewportWidth?: number; viewportHeight?: number; maxNodes?: number },
): { nodes: CompactUiNode[]; truncated: boolean; context: CompactUiContext } {
  const vw = options?.viewportWidth ?? root.bounds.width
  const vh = options?.viewportHeight ?? root.bounds.height
  const maxNodes = options?.maxNodes ?? 400

  const visibleNodes: CompactUiNode[] = []
  const pinnedNodes = new Map<string, CompactUiNode>()
  const marginY = Math.round(vh * 0.6)

  function pinNode(node: A11yNode) {
    if (!shouldPinCompactContextNode(node)) return
    pinnedNodes.set(nodeIdForPath(node.path), compactNodeFromA11y(node, true))
  }

  function walk(n: A11yNode, ancestors: A11yNode[]) {
    const visibleSelf = includeInCompactIndex(n) && intersectsViewport(n.bounds, vw, vh)
    if (visibleSelf) {
      visibleNodes.push(compactNodeFromA11y(n))
      for (const ancestor of ancestors) {
        pinNode(ancestor)
      }
    }

    if (shouldPinCompactContextNode(n) && intersectsViewportWithMargin(n.bounds, vw, vh, marginY)) {
      pinNode(n)
    }

    for (const c of n.children) walk(c, [...ancestors, n])
  }

  walk(root, [])

  const merged = new Map<string, CompactUiNode>()
  for (const node of pinnedNodes.values()) {
    merged.set(node.id, node)
  }
  for (const node of visibleNodes) {
    const existing = merged.get(node.id)
    merged.set(node.id, existing?.pinned ? { ...node, pinned: true } : node)
  }

  const nodes = [...merged.values()]
  nodes.sort((a, b) => {
    if ((a.pinned ?? false) !== (b.pinned ?? false)) return a.pinned ? -1 : 1
    if (a.pinned && b.pinned && a.role !== b.role) {
      return pinnedRolePriority(a.role) - pinnedRolePriority(b.role)
    }
    if (a.focusable !== b.focusable) return a.focusable ? -1 : 1
    if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y
    return a.bounds.x - b.bounds.x
  })

  const focusedNode = nodes.find(node => node.state?.focused)
  const context: CompactUiContext = {
    ...(root.meta?.pageUrl ? { pageUrl: root.meta.pageUrl } : {}),
    ...(typeof root.meta?.scrollX === 'number' ? { scrollX: root.meta.scrollX } : {}),
    ...(typeof root.meta?.scrollY === 'number' ? { scrollY: root.meta.scrollY } : {}),
    ...(focusedNode ? { focusedNode } : {}),
  }

  if (nodes.length > maxNodes) return { nodes: nodes.slice(0, maxNodes), truncated: true, context }
  return { nodes, truncated: false, context }
}

export function summarizeCompactIndex(nodes: CompactUiNode[], maxLines = 80): string {
  const lines: string[] = []
  const slice = nodes.slice(0, maxLines)
  for (const n of slice) {
    const nm = n.name ? ` "${truncateUiText(n.name, 48)}"` : ''
    const st = n.state && Object.keys(n.state).length ? ` ${JSON.stringify(n.state)}` : ''
    const foc = n.focusable ? ' *' : ''
    const pin = n.pinned ? ' [pinned]' : ''
    const b = n.bounds
    lines.push(`${n.id} ${n.role}${nm}${pin} (${b.x},${b.y} ${b.width}x${b.height})${st}${foc}`)
  }
  if (nodes.length > maxLines) {
    lines.push(`… and ${nodes.length - maxLines} more (use geometra_snapshot with a higher maxNodes or geometra_query)`)
  }
  return lines.join('\n')
}

function cloneBounds(bounds: A11yNode['bounds']): A11yNode['bounds'] {
  return { ...bounds }
}

function cloneState(state: A11yNode['state'] | undefined): A11yNode['state'] | undefined {
  if (!state) return undefined
  const next: A11yNode['state'] = {}
  if (state.disabled) next.disabled = true
  if (state.expanded !== undefined) next.expanded = state.expanded
  if (state.selected !== undefined) next.selected = state.selected
  if (state.checked !== undefined) next.checked = state.checked
  if (state.focused !== undefined) next.focused = state.focused
  return Object.keys(next).length > 0 ? next : undefined
}

function clonePath(path: number[]): number[] {
  return [...path]
}

function sortByBounds<T extends { bounds: A11yNode['bounds'] }>(items: T[]): T[] {
  return items.sort((a, b) => {
    if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y
    return a.bounds.x - b.bounds.x
  })
}

function collectDescendants(node: A11yNode, predicate: (candidate: A11yNode) => boolean): A11yNode[] {
  const out: A11yNode[] = []
  function walk(current: A11yNode) {
    for (const child of current.children) {
      if (predicate(child)) out.push(child)
      walk(child)
    }
  }
  walk(node)
  return out
}

function firstNamedDescendant(node: A11yNode, allowedRoles?: ReadonlySet<string>): string | undefined {
  const queue = [...node.children]
  while (queue.length > 0) {
    const current = queue.shift()!
    if ((!allowedRoles || allowedRoles.has(current.role)) && current.name && current.name.trim().length > 0) {
      return current.name
    }
    queue.push(...current.children)
  }
  return undefined
}

function findNodeByPath(root: A11yNode, path: number[]): A11yNode | null {
  let current: A11yNode = root
  for (const index of path) {
    if (!current.children[index]) return null
    current = current.children[index]!
  }
  return current
}

function countFocusableNodes(root: A11yNode): number {
  let count = 0
  function walk(node: A11yNode) {
    if (node.focusable) count++
    for (const child of node.children) walk(child)
  }
  walk(root)
  return count
}

function dedupeStrings(values: Array<string | undefined>, max: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
    if (out.length >= max) break
  }
  return out
}

function fieldLabel(node: A11yNode): string | undefined {
  return sanitizeFieldName(node.name, 80)
}

function contentPreviewName(node: A11yNode): string | undefined {
  if (node.role === 'heading') return sanitizeInlineName(node.name, 80)
  if (node.role === 'text') return sanitizeInlineName(node.name, 80)
  if (node.role === 'link' || node.role === 'button') return sanitizeInlineName(node.name, 80)
  return undefined
}

function sectionDisplayName(node: A11yNode, kind: PageSectionKind): string | undefined {
  const headingName = sanitizeInlineName(firstNamedDescendant(node, new Set(['heading'])), 80)
  if (headingName) return headingName

  if (kind === 'list') {
    return sanitizeContainerName(node.name, 80)
      ?? sanitizeInlineName(firstNamedDescendant(node, new Set(['text', 'link', 'button'])), 80)
  }

  if (kind === 'landmark') {
    return sanitizeContainerName(node.name, 80)
      ?? sanitizeInlineName(firstNamedDescendant(node, CONTENT_NAME_ROLES), 80)
  }

  return sanitizeContainerName(node.name, 80)
}

function listItemName(node: A11yNode): string | undefined {
  return sanitizeInlineName(
    node.name ?? firstNamedDescendant(node, new Set(['heading', 'text', 'link', 'button'])),
    80,
  )
}

function textPreview(node: A11yNode, maxItems: number): string[] {
  const texts = collectDescendants(
    node,
    candidate =>
      (candidate.role === 'heading' || candidate.role === 'text') &&
      !!sanitizeInlineName(candidate.name, 90),
  )
  return dedupeStrings(texts.map(candidate => contentPreviewName(candidate)), maxItems)
}

function primaryAction(node: A11yNode): PagePrimaryAction {
  return {
    id: nodeIdForPath(node.path),
    role: node.role,
    ...(sanitizeInlineName(node.name, 80) ? { name: sanitizeInlineName(node.name, 80) } : {}),
    ...(cloneState(node.state) ? { state: cloneState(node.state) } : {}),
    bounds: cloneBounds(node.bounds),
  }
}

function toFieldModel(node: A11yNode, includeBounds = true): PageFieldModel {
  return {
    id: nodeIdForPath(node.path),
    role: node.role,
    ...(fieldLabel(node) ? { name: fieldLabel(node) } : {}),
    ...(cloneState(node.state) ? { state: cloneState(node.state) } : {}),
    ...(includeBounds ? { bounds: cloneBounds(node.bounds) } : {}),
  }
}

function toActionModel(node: A11yNode, includeBounds = true): PageActionModel {
  return {
    id: nodeIdForPath(node.path),
    role: node.role,
    ...(sanitizeInlineName(node.name, 80) ? { name: sanitizeInlineName(node.name, 80) } : {}),
    ...(cloneState(node.state) ? { state: cloneState(node.state) } : {}),
    ...(includeBounds ? { bounds: cloneBounds(node.bounds) } : {}),
  }
}

function toLandmarkModel(node: A11yNode): PageLandmark {
  const name = sectionDisplayName(node, 'landmark')
  return {
    id: sectionIdForPath('landmark', node.path),
    role: node.role,
    ...(name ? { name } : {}),
    bounds: cloneBounds(node.bounds),
  }
}

function inferPageArchetypes(model: Omit<PageModel, 'archetypes'>): PageArchetype[] {
  const out = new Set<PageArchetype>()
  const landmarkRoles = new Set(model.landmarks.map(landmark => landmark.role))
  if (landmarkRoles.has('navigation') && landmarkRoles.has('main')) out.add('shell')
  if (model.summary.formCount > 0) out.add('form')
  if (model.summary.dialogCount > 0) out.add('dialog')
  if (model.summary.listCount > 0) out.add('results')
  if (model.summary.focusableCount >= 14 && model.summary.listCount >= 2 && model.summary.formCount === 0) {
    out.add('dashboard')
  }
  if (
    model.summary.formCount === 0 &&
    model.summary.dialogCount === 0 &&
    model.summary.listCount <= 1 &&
    model.summary.focusableCount <= 8
  ) {
    out.add('content')
  }
  return [...out]
}

/**
 * Build a summary-first, stable-ID webpage model from the accessibility tree.
 * Use {@link expandPageSection} to fetch details for a specific section on demand.
 */
export function buildPageModel(
  root: A11yNode,
  options?: {
    maxPrimaryActions?: number
    maxSectionsPerKind?: number
  },
): PageModel {
  const maxPrimaryActions = options?.maxPrimaryActions ?? 6
  const maxSectionsPerKind = options?.maxSectionsPerKind ?? 8

  const landmarks: PageLandmark[] = []
  const forms: PageFormModel[] = []
  const dialogs: PageDialogModel[] = []
  const lists: PageListModel[] = []

  function walk(node: A11yNode) {
    if (LANDMARK_ROLES.has(node.role)) {
      landmarks.push(toLandmarkModel(node))
    }

    if (node.role === 'form') {
      const fields = collectDescendants(node, candidate => FORM_FIELD_ROLES.has(candidate.role))
      const actions = collectDescendants(
        node,
        candidate => ACTION_ROLES.has(candidate.role) && candidate.focusable,
      )
      const name = sectionDisplayName(node, 'form')
      forms.push({
        id: sectionIdForPath('form', node.path),
        role: node.role,
        ...(name ? { name } : {}),
        bounds: cloneBounds(node.bounds),
        fieldCount: fields.length,
        actionCount: actions.length,
      })
    }

    if (DIALOG_ROLES.has(node.role)) {
      const fields = collectDescendants(node, candidate => FORM_FIELD_ROLES.has(candidate.role))
      const actions = collectDescendants(
        node,
        candidate => ACTION_ROLES.has(candidate.role) && candidate.focusable,
      )
      const name = sectionDisplayName(node, 'dialog')
      dialogs.push({
        id: sectionIdForPath('dialog', node.path),
        role: node.role,
        ...(name ? { name } : {}),
        bounds: cloneBounds(node.bounds),
        fieldCount: fields.length,
        actionCount: actions.length,
      })
    }

    if (node.role === 'list') {
      const items = collectDescendants(node, candidate => candidate.role === 'listitem')
      const name = sectionDisplayName(node, 'list')
      lists.push({
        id: sectionIdForPath('list', node.path),
        role: node.role,
        ...(name ? { name } : {}),
        bounds: cloneBounds(node.bounds),
        itemCount: items.length,
      })
    }

    for (const child of node.children) walk(child)
  }

  walk(root)

  const compact = buildCompactUiIndex(root, { maxNodes: 200 })
  const primaryActions = compact.nodes
    .filter(node => node.focusable && ACTION_ROLES.has(node.role))
    .slice(0, maxPrimaryActions)
    .map(node => primaryAction({
      role: node.role,
      name: node.name,
      state: node.state,
      bounds: node.bounds,
      path: node.path,
      children: [],
      focusable: node.focusable,
    }))

  const baseModel = {
    viewport: {
      width: root.bounds.width,
      height: root.bounds.height,
    },
    summary: {
      landmarkCount: landmarks.length,
      formCount: forms.length,
      dialogCount: dialogs.length,
      listCount: lists.length,
      focusableCount: countFocusableNodes(root),
    },
    primaryActions,
    landmarks: sortByBounds(landmarks).slice(0, maxSectionsPerKind),
    forms: sortByBounds(forms).slice(0, maxSectionsPerKind),
    dialogs: sortByBounds(dialogs).slice(0, maxSectionsPerKind),
    lists: sortByBounds(lists).slice(0, maxSectionsPerKind),
  }

  return {
    ...baseModel,
    archetypes: inferPageArchetypes(baseModel),
  }
}

function headingModels(node: A11yNode, maxHeadings: number, includeBounds: boolean): PageHeadingModel[] {
  const headings = sortByBounds(
    collectDescendants(node, candidate => candidate.role === 'heading' && !!sanitizeInlineName(candidate.name, 80)),
  )
  return headings.slice(0, maxHeadings).map(heading => ({
    id: nodeIdForPath(heading.path),
    name: sanitizeInlineName(heading.name, 80)!,
    ...(includeBounds ? { bounds: cloneBounds(heading.bounds) } : {}),
  }))
}

function nestedListSummaries(node: A11yNode, maxLists: number, selfPath: number[]): PageListModel[] {
  const nestedLists = sortByBounds(
    collectDescendants(node, candidate => candidate.role === 'list' && pathKey(candidate.path) !== pathKey(selfPath)),
  )
  return nestedLists.slice(0, maxLists).map(list => ({
    id: sectionIdForPath('list', list.path),
    role: list.role,
    ...(sectionDisplayName(list, 'list') ? { name: sectionDisplayName(list, 'list') } : {}),
    bounds: cloneBounds(list.bounds),
    itemCount: collectDescendants(list, candidate => candidate.role === 'listitem').length,
  }))
}

function sectionKindForNode(node: A11yNode): PageSectionKind | null {
  if (node.role === 'form') return 'form'
  if (DIALOG_ROLES.has(node.role)) return 'dialog'
  if (node.role === 'list') return 'list'
  if (LANDMARK_ROLES.has(node.role)) return 'landmark'
  return null
}

/**
 * Expand a page-model section by stable ID into richer, on-demand details.
 */
export function expandPageSection(
  root: A11yNode,
  id: string,
  options?: {
    maxHeadings?: number
    maxFields?: number
    maxActions?: number
    maxLists?: number
    maxItems?: number
    maxTextPreview?: number
    includeBounds?: boolean
  },
): PageSectionDetail | null {
  const parsed = parseSectionId(id)
  if (!parsed) return null
  const node = findNodeByPath(root, parsed.path)
  if (!node) return null
  const actualKind = sectionKindForNode(node)
  if (actualKind !== parsed.kind) return null

  const maxHeadings = options?.maxHeadings ?? 6
  const maxFields = options?.maxFields ?? 18
  const maxActions = options?.maxActions ?? 12
  const maxLists = options?.maxLists ?? 8
  const maxItems = options?.maxItems ?? 20
  const maxTextPreview = options?.maxTextPreview ?? 6
  const includeBounds = options?.includeBounds ?? false

  const headingsAll = sortByBounds(
    collectDescendants(node, candidate => candidate.role === 'heading' && !!sanitizeInlineName(candidate.name, 80)),
  )
  const fieldsAll = sortByBounds(
    collectDescendants(node, candidate => FORM_FIELD_ROLES.has(candidate.role)),
  )
  const actionsAll = sortByBounds(
    collectDescendants(node, candidate => ACTION_ROLES.has(candidate.role) && candidate.focusable),
  )
  const nestedListsAll = sortByBounds(
    collectDescendants(node, candidate => candidate.role === 'list' && pathKey(candidate.path) !== pathKey(node.path)),
  )
  const itemsAll = actualKind === 'list'
    ? sortByBounds(collectDescendants(node, candidate => candidate.role === 'listitem'))
    : []

  const name = sectionDisplayName(node, actualKind)
  return {
    id: sectionIdForPath(actualKind, node.path),
    kind: actualKind,
    role: node.role,
    ...(name ? { name } : {}),
    bounds: cloneBounds(node.bounds),
    summary: {
      headingCount: headingsAll.length,
      fieldCount: fieldsAll.length,
      actionCount: actionsAll.length,
      listCount: nestedListsAll.length,
      itemCount: itemsAll.length,
    },
    headings: headingModels(node, maxHeadings, includeBounds),
    fields: fieldsAll.slice(0, maxFields).map(field => toFieldModel(field, includeBounds)),
    actions: actionsAll.slice(0, maxActions).map(action => toActionModel(action, includeBounds)),
    lists: nestedListSummaries(node, maxLists, node.path),
    items: itemsAll.slice(0, maxItems).map(item => ({
      id: nodeIdForPath(item.path),
      ...(listItemName(item) ? { name: listItemName(item) } : {}),
      ...(includeBounds ? { bounds: cloneBounds(item.bounds) } : {}),
    })),
    textPreview: actualKind === 'form' ? [] : textPreview(node, maxTextPreview),
  }
}

export function summarizePageModel(model: PageModel, maxLines = 10): string {
  const lines: string[] = []

  if (model.archetypes.length > 0) {
    lines.push(`archetypes: ${model.archetypes.join(', ')}`)
  }

  lines.push(
    `summary: ${model.summary.landmarkCount} landmarks, ${model.summary.formCount} forms, ${model.summary.dialogCount} dialogs, ${model.summary.listCount} lists, ${model.summary.focusableCount} focusable`,
  )

  for (const landmark of model.landmarks.slice(0, 3)) {
    const name = landmark.name ? ` "${truncateUiText(landmark.name, 32)}"` : ''
    lines.push(`${landmark.id} ${landmark.role}${name}`)
  }

  for (const form of model.forms.slice(0, 3)) {
    const name = form.name ? ` "${truncateUiText(form.name, 40)}"` : ''
    lines.push(`${form.id} form${name}: ${form.fieldCount} fields, ${form.actionCount} actions`)
  }

  for (const dialog of model.dialogs.slice(0, 2)) {
    const name = dialog.name ? ` "${truncateUiText(dialog.name, 40)}"` : ''
    lines.push(`${dialog.id} dialog${name}: ${dialog.fieldCount} fields, ${dialog.actionCount} actions`)
  }

  for (const list of model.lists.slice(0, 3)) {
    const name = list.name ? ` "${truncateUiText(list.name, 40)}"` : ''
    lines.push(`${list.id} list${name}: ${list.itemCount} items`)
  }

  if (model.primaryActions.length > 0) {
    const actions = model.primaryActions
      .slice(0, 4)
      .map(action => action.name ? `${action.id} "${truncateUiText(action.name, 24)}"` : action.id)
      .join(', ')
    lines.push(`primary actions: ${actions}`)
  }

  return lines.slice(0, maxLines).join('\n')
}

function pathKey(path: number[]): string {
  return path.join('.')
}

function compactNodeLabel(node: CompactUiNode): string {
  if (node.name) return `${node.id} ${node.role} "${truncateUiText(node.name, 40)}"`
  return `${node.id} ${node.role}`
}

function formatStateValue(value: boolean | 'mixed' | undefined): string {
  return value === undefined ? 'unset' : String(value)
}

function diffCompactNodes(before: CompactUiNode, after: CompactUiNode): string[] {
  const changes: string[] = []

  if (before.role !== after.role) changes.push(`role ${before.role} -> ${after.role}`)
  if ((before.name ?? '') !== (after.name ?? '')) {
    changes.push(`name ${JSON.stringify(truncateUiText(before.name ?? 'unset', 32))} -> ${JSON.stringify(truncateUiText(after.name ?? 'unset', 32))}`)
  }

  const beforeState = before.state ?? {}
  const afterState = after.state ?? {}
  for (const key of ['disabled', 'expanded', 'selected', 'checked', 'focused'] as const) {
    if (beforeState[key] !== afterState[key]) {
      changes.push(`${key} ${formatStateValue(beforeState[key])} -> ${formatStateValue(afterState[key])}`)
    }
  }

  const moved = Math.abs(before.bounds.x - after.bounds.x) + Math.abs(before.bounds.y - after.bounds.y)
  const resized = Math.abs(before.bounds.width - after.bounds.width) + Math.abs(before.bounds.height - after.bounds.height)
  if (moved >= 8 || resized >= 8) {
    changes.push(
      `bounds (${before.bounds.x},${before.bounds.y} ${before.bounds.width}x${before.bounds.height}) -> (${after.bounds.x},${after.bounds.y} ${after.bounds.width}x${after.bounds.height})`,
    )
  }

  return changes
}

function pageContainerKey<T extends { path: number[]; name?: string }>(value: T): string {
  return `${pathKey(value.path)}|${value.name ?? ''}`
}

/**
 * Compare two accessibility trees at the compact viewport layer plus a few
 * higher-level structures (dialogs, forms, lists).
 */
export function buildUiDelta(
  before: A11yNode,
  after: A11yNode,
  options?: { maxNodes?: number },
): UiDelta {
  const maxNodes = options?.maxNodes ?? 250
  const beforeIndex = buildCompactUiIndex(before, { maxNodes })
  const afterIndex = buildCompactUiIndex(after, { maxNodes })
  const beforeCompact = beforeIndex.nodes
  const afterCompact = afterIndex.nodes

  const beforeMap = new Map(beforeCompact.map(node => [node.id, node]))
  const afterMap = new Map(afterCompact.map(node => [node.id, node]))

  const added: CompactUiNode[] = []
  const removed: CompactUiNode[] = []
  const updated: UiNodeUpdate[] = []

  for (const [key, afterNode] of afterMap) {
    const beforeNode = beforeMap.get(key)
    if (!beforeNode) {
      added.push(afterNode)
      continue
    }
    const changes = diffCompactNodes(beforeNode, afterNode)
    if (changes.length > 0) updated.push({ before: beforeNode, after: afterNode, changes })
  }

  for (const [key, beforeNode] of beforeMap) {
    if (!afterMap.has(key)) removed.push(beforeNode)
  }

  const beforePage = buildPageModel(before)
  const afterPage = buildPageModel(after)

  const beforeDialogs = new Map(beforePage.dialogs.map(dialog => [dialog.id, dialog]))
  const afterDialogs = new Map(afterPage.dialogs.map(dialog => [dialog.id, dialog]))
  const dialogsOpened = [...afterDialogs.entries()]
    .filter(([key]) => !beforeDialogs.has(key))
    .map(([, value]) => value)
  const dialogsClosed = [...beforeDialogs.entries()]
    .filter(([key]) => !afterDialogs.has(key))
    .map(([, value]) => value)

  const beforeForms = new Map(beforePage.forms.map(form => [form.id, form]))
  const afterForms = new Map(afterPage.forms.map(form => [form.id, form]))
  const formsAppeared = [...afterForms.entries()]
    .filter(([key]) => !beforeForms.has(key))
    .map(([, value]) => value)
  const formsRemoved = [...beforeForms.entries()]
    .filter(([key]) => !afterForms.has(key))
    .map(([, value]) => value)

  const beforeLists = new Map(beforePage.lists.map(list => [list.id, list]))
  const afterLists = new Map(afterPage.lists.map(list => [list.id, list]))
  const listCountsChanged: UiListCountChange[] = []
  for (const [key, afterList] of afterLists) {
    const beforeList = beforeLists.get(key)
    if (beforeList && beforeList.itemCount !== afterList.itemCount) {
      listCountsChanged.push({
        id: afterList.id,
        ...(afterList.name ? { name: afterList.name } : {}),
        beforeCount: beforeList.itemCount,
        afterCount: afterList.itemCount,
      })
    }
  }

  const navigation =
    beforeIndex.context.pageUrl !== afterIndex.context.pageUrl
      ? {
          beforeUrl: beforeIndex.context.pageUrl,
          afterUrl: afterIndex.context.pageUrl,
        }
      : undefined

  const viewport =
    beforeIndex.context.scrollX !== afterIndex.context.scrollX || beforeIndex.context.scrollY !== afterIndex.context.scrollY
      ? {
          beforeScrollX: beforeIndex.context.scrollX,
          beforeScrollY: beforeIndex.context.scrollY,
          afterScrollX: afterIndex.context.scrollX,
          afterScrollY: afterIndex.context.scrollY,
        }
      : undefined

  const focus =
    beforeIndex.context.focusedNode?.id !== afterIndex.context.focusedNode?.id
      ? {
          before: beforeIndex.context.focusedNode,
          after: afterIndex.context.focusedNode,
        }
      : undefined

  return {
    added,
    removed,
    updated,
    dialogsOpened,
    dialogsClosed,
    formsAppeared,
    formsRemoved,
    listCountsChanged,
    ...(navigation ? { navigation } : {}),
    ...(viewport ? { viewport } : {}),
    ...(focus ? { focus } : {}),
  }
}

export function hasUiDelta(delta: UiDelta): boolean {
  return (
    delta.added.length > 0 ||
    delta.removed.length > 0 ||
    delta.updated.length > 0 ||
    delta.dialogsOpened.length > 0 ||
    delta.dialogsClosed.length > 0 ||
    delta.formsAppeared.length > 0 ||
    delta.formsRemoved.length > 0 ||
    delta.listCountsChanged.length > 0 ||
    !!delta.navigation ||
    !!delta.viewport ||
    !!delta.focus
  )
}

export function summarizeUiDelta(delta: UiDelta, maxLines = 14): string {
  const lines: string[] = []

  if (delta.navigation) {
    lines.push(`~ navigation ${JSON.stringify(delta.navigation.beforeUrl ?? 'unknown')} -> ${JSON.stringify(delta.navigation.afterUrl ?? 'unknown')}`)
  }

  if (delta.viewport) {
    lines.push(
      `~ viewport scroll (${delta.viewport.beforeScrollX ?? 0},${delta.viewport.beforeScrollY ?? 0}) -> (${delta.viewport.afterScrollX ?? 0},${delta.viewport.afterScrollY ?? 0})`,
    )
  }

  if (delta.focus) {
    const beforeLabel = delta.focus.before ? compactNodeLabel(delta.focus.before) : 'unset'
    const afterLabel = delta.focus.after ? compactNodeLabel(delta.focus.after) : 'unset'
    lines.push(`~ focus ${beforeLabel} -> ${afterLabel}`)
  }

  for (const dialog of delta.dialogsOpened.slice(0, 2)) {
    lines.push(`+ ${dialog.id} dialog${dialog.name ? ` "${truncateUiText(dialog.name, 40)}"` : ''} opened`)
  }

  for (const dialog of delta.dialogsClosed.slice(0, 2)) {
    lines.push(`- ${dialog.id} dialog${dialog.name ? ` "${truncateUiText(dialog.name, 40)}"` : ''} closed`)
  }

  for (const form of delta.formsAppeared.slice(0, 2)) {
    lines.push(`+ ${form.id} form${form.name ? ` "${truncateUiText(form.name, 40)}"` : ''} appeared (${form.fieldCount} fields)`)
  }

  for (const form of delta.formsRemoved.slice(0, 2)) {
    lines.push(`- ${form.id} form${form.name ? ` "${truncateUiText(form.name, 40)}"` : ''} removed`)
  }

  for (const list of delta.listCountsChanged.slice(0, 3)) {
    lines.push(`~ ${list.id} list${list.name ? ` "${truncateUiText(list.name, 40)}"` : ''} items ${list.beforeCount} -> ${list.afterCount}`)
  }

  for (const update of delta.updated.slice(0, 5)) {
    lines.push(`~ ${compactNodeLabel(update.after)}: ${update.changes.join('; ')}`)
  }

  for (const node of delta.added.slice(0, 4)) {
    lines.push(`+ ${compactNodeLabel(node)}`)
  }

  for (const node of delta.removed.slice(0, 4)) {
    lines.push(`- ${compactNodeLabel(node)}`)
  }

  if (lines.length === 0) {
    return 'No semantic changes detected in the compact viewport model.'
  }

  if (lines.length > maxLines) {
    const hidden = lines.length - maxLines
    return `${lines.slice(0, maxLines).join('\n')}\n… and ${hidden} more changes`
  }

  return lines.join('\n')
}

function truncateUiText(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s
}

const A11Y_ROLE_HINTS = new Set([
  'button',
  'checkbox',
  'radio',
  'switch',
  'link',
  'textbox',
  'combobox',
  'heading',
  'dialog',
  'alertdialog',
  'list',
  'listitem',
  'tab',
  'tablist',
  'tabpanel',
])

function normalizeCheckedState(value: unknown): boolean | 'mixed' | undefined {
  if (value === 'mixed') return 'mixed'
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function normalizeA11yRoleHint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return A11Y_ROLE_HINTS.has(normalized) ? normalized : undefined
}

function walkNode(element: Record<string, unknown>, layout: Record<string, unknown>, path: number[]): A11yNode {
  const kind = element.kind as string | undefined
  const semantic = element.semantic as Record<string, unknown> | undefined
  const props = element.props as Record<string, unknown> | undefined
  const handlers = element.handlers as Record<string, unknown> | undefined

  const role = inferRole(kind, semantic, handlers)
  const name = inferName(kind, semantic, props)
  const focusable = !!(handlers?.onClick || handlers?.onKeyDown || handlers?.onKeyUp ||
    handlers?.onCompositionStart || handlers?.onCompositionUpdate || handlers?.onCompositionEnd)

  const bounds = {
    x: (layout.x as number) ?? 0,
    y: (layout.y as number) ?? 0,
    width: (layout.width as number) ?? 0,
    height: (layout.height as number) ?? 0,
  }

  const state: A11yNode['state'] = {}
  if (semantic?.ariaDisabled) state.disabled = true
  if (semantic?.ariaExpanded !== undefined) state.expanded = !!semantic.ariaExpanded
  if (semantic?.ariaSelected !== undefined) state.selected = !!semantic.ariaSelected
  const checked = normalizeCheckedState(semantic?.ariaChecked)
  if (checked !== undefined) state.checked = checked
  if (semantic?.focused !== undefined) state.focused = !!semantic.focused

  const meta: A11yNode['meta'] = {}
  if (typeof semantic?.pageUrl === 'string') meta.pageUrl = semantic.pageUrl
  if (typeof semantic?.scrollX === 'number' && Number.isFinite(semantic.scrollX)) meta.scrollX = semantic.scrollX
  if (typeof semantic?.scrollY === 'number' && Number.isFinite(semantic.scrollY)) meta.scrollY = semantic.scrollY

  const children: A11yNode[] = []
  const elementChildren = element.children as Record<string, unknown>[] | undefined
  const layoutChildren = layout.children as Record<string, unknown>[] | undefined

  if (elementChildren && layoutChildren) {
    for (let i = 0; i < elementChildren.length; i++) {
      if (elementChildren[i] && layoutChildren[i]) {
        children.push(walkNode(elementChildren[i], layoutChildren[i], [...path, i]))
      }
    }
  }

  return {
    role,
    ...(name ? { name } : {}),
    ...(Object.keys(state).length > 0 ? { state } : {}),
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
    bounds,
    path,
    children,
    focusable,
  }
}

function inferRole(kind: string | undefined, semantic: Record<string, unknown> | undefined, handlers: Record<string, unknown> | undefined): string {
  if (semantic?.role) return semantic.role as string
  const hintedRole = normalizeA11yRoleHint(semantic?.a11yRoleHint)
  if (hintedRole) return hintedRole
  const tag = semantic?.tag as string | undefined
  if (kind === 'text') {
    if (tag && /^h[1-6]$/.test(tag)) return 'heading'
    return 'text'
  }
  if (kind === 'image') return 'img'
  if (kind === 'scene3d') return 'img'
  // box
  if (tag === 'nav') return 'navigation'
  if (tag === 'main') return 'main'
  if (tag === 'article') return 'article'
  if (tag === 'section') return 'region'
  if (tag === 'ul' || tag === 'ol') return 'list'
  if (tag === 'li') return 'listitem'
  if (tag === 'form') return 'form'
  if (tag === 'button') return 'button'
  if (tag === 'input') return 'textbox'
  if (handlers?.onClick) return 'button'
  return 'group'
}

function inferName(kind: string | undefined, semantic: Record<string, unknown> | undefined, props: Record<string, unknown> | undefined): string | undefined {
  if (semantic?.ariaLabel) return semantic.ariaLabel as string
  if (kind === 'text' && props?.text) return props.text as string
  if (kind === 'image') return (semantic?.alt ?? props?.alt) as string | undefined
  return semantic?.alt as string | undefined
}

function applyPatches(layout: Record<string, unknown>, patches: Array<{ path: number[]; x?: number; y?: number; width?: number; height?: number }>): void {
  for (const patch of patches) {
    let node = layout
    for (const idx of patch.path) {
      const children = node.children as Record<string, unknown>[] | undefined
      if (!children?.[idx]) break
      node = children[idx]
    }
    if (patch.x !== undefined) node.x = patch.x
    if (patch.y !== undefined) node.y = patch.y
    if (patch.width !== undefined) node.width = patch.width
    if (patch.height !== undefined) node.height = patch.height
  }
}

function sendAndWaitForUpdate(session: Session, message: Record<string, unknown>): Promise<UpdateWaitResult> {
  return new Promise((resolve, reject) => {
    if (session.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected'))
      return
    }
    session.ws.send(JSON.stringify(message))
    waitForNextUpdate(session).then(resolve).catch(reject)
  })
}

function waitForNextUpdate(session: Session): Promise<UpdateWaitResult> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(String(data))
        if (msg.type === 'error') {
          cleanup()
          reject(new Error(typeof msg.message === 'string' ? msg.message : 'Geometra server error'))
          return
        }
        if (msg.type === 'frame') {
          session.layout = msg.layout
          session.tree = msg.tree
          cleanup()
          resolve({ status: 'updated', timeoutMs: ACTION_UPDATE_TIMEOUT_MS })
        } else if (msg.type === 'patch' && session.layout) {
          applyPatches(session.layout, msg.patches)
          cleanup()
          resolve({ status: 'updated', timeoutMs: ACTION_UPDATE_TIMEOUT_MS })
        } else if (msg.type === 'ack') {
          cleanup()
          resolve({ status: 'acknowledged', timeoutMs: ACTION_UPDATE_TIMEOUT_MS })
        }
      } catch { /* ignore */ }
    }

    // Expose timeout explicitly so action handlers can tell the user the result is ambiguous.
    const timeout = setTimeout(() => {
      cleanup()
      resolve({ status: 'timed_out', timeoutMs: ACTION_UPDATE_TIMEOUT_MS })
    }, ACTION_UPDATE_TIMEOUT_MS)

    function cleanup() {
      clearTimeout(timeout)
      session.ws.off('message', onMessage)
    }

    session.ws.on('message', onMessage)
  })
}

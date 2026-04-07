import WebSocket from 'ws'

/**
 * Parsed accessibility node from the UI tree + computed layout.
 * Mirrors the shape of @geometra/core's AccessibilityNode without importing it
 * (this package is standalone — no dependency on geometra packages).
 */
export interface A11yNode {
  role: string
  name?: string
  state?: { disabled?: boolean; expanded?: boolean; selected?: boolean }
  bounds: { x: number; y: number; width: number; height: number }
  path: number[]
  children: A11yNode[]
  focusable: boolean
}

/** Flat, viewport-filtered index for token-efficient agent context (see `buildCompactUiIndex`). */
export interface CompactUiNode {
  role: string
  name?: string
  state?: A11yNode['state']
  bounds: { x: number; y: number; width: number; height: number }
  path: number[]
  focusable: boolean
}

/** Higher-level webpage structures extracted from the a11y tree. */
export interface PageLandmark {
  role: string
  name?: string
  bounds: { x: number; y: number; width: number; height: number }
  path: number[]
}

export interface PageFieldModel {
  role: string
  name?: string
  state?: A11yNode['state']
  bounds: { x: number; y: number; width: number; height: number }
  path: number[]
}

export interface PageActionModel {
  role: string
  name?: string
  state?: A11yNode['state']
  bounds: { x: number; y: number; width: number; height: number }
  path: number[]
}

export interface PageFormModel {
  name?: string
  bounds: { x: number; y: number; width: number; height: number }
  path: number[]
  fieldCount: number
  actionCount: number
  fields: PageFieldModel[]
  actions: PageActionModel[]
}

export interface PageDialogModel {
  name?: string
  bounds: { x: number; y: number; width: number; height: number }
  path: number[]
  actionCount: number
  actions: PageActionModel[]
}

export interface PageListModel {
  name?: string
  bounds: { x: number; y: number; width: number; height: number }
  path: number[]
  itemCount: number
  itemsPreview: string[]
}

export interface PageModel {
  viewport: { width: number; height: number }
  landmarks: PageLandmark[]
  forms: PageFormModel[]
  dialogs: PageDialogModel[]
  lists: PageListModel[]
}

export interface UiNodeUpdate {
  before: CompactUiNode
  after: CompactUiNode
  changes: string[]
}

export interface UiListCountChange {
  name?: string
  path: number[]
  beforeCount: number
  afterCount: number
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
}

export interface Session {
  ws: WebSocket
  layout: Record<string, unknown> | null
  tree: Record<string, unknown> | null
  url: string
}

let activeSession: Session | null = null

/**
 * Connect to a running Geometra server. Waits for the first frame so that
 * layout/tree state is available immediately after connection.
 */
export function connect(url: string): Promise<Session> {
  return new Promise((resolve, reject) => {
    if (activeSession) {
      activeSession.ws.close()
      activeSession = null
    }

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
      if (activeSession === session) activeSession = null
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(new Error(`Connection to ${url} closed before first frame`))
      }
    })
  })
}

export function getSession(): Session | null {
  return activeSession
}

export function disconnect(): void {
  if (activeSession) {
    activeSession.ws.close()
    activeSession = null
  }
}

/**
 * Send a click event at (x, y) and wait for the next frame/patch response.
 */
export function sendClick(session: Session, x: number, y: number): Promise<void> {
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
export function sendType(session: Session, text: string): Promise<void> {
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
export function sendKey(session: Session, key: string, modifiers?: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }): Promise<void> {
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
): Promise<void> {
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
  opts?: { exact?: boolean; open?: { x: number; y: number } },
): Promise<void> {
  const payload: Record<string, unknown> = { type: 'listboxPick', label }
  if (opts?.exact !== undefined) payload.exact = opts.exact
  if (opts?.open) {
    payload.openX = opts.open.x
    payload.openY = opts.open.y
  }
  return sendAndWaitForUpdate(session, payload)
}

/** Native `<select>` only: click the control center, then pick by value, label text, or zero-based index. */
export function sendSelectOption(
  session: Session,
  x: number,
  y: number,
  option: { value?: string; label?: string; index?: number },
): Promise<void> {
  return sendAndWaitForUpdate(session, {
    type: 'selectOption',
    x,
    y,
    ...option,
  })
}

/** Mouse wheel / scroll. Optional `x`,`y` move pointer before scrolling. */
export function sendWheel(
  session: Session,
  deltaY: number,
  opts?: { deltaX?: number; x?: number; y?: number },
): Promise<void> {
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
  'listitem',
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
): { nodes: CompactUiNode[]; truncated: boolean } {
  const vw = options?.viewportWidth ?? root.bounds.width
  const vh = options?.viewportHeight ?? root.bounds.height
  const maxNodes = options?.maxNodes ?? 400

  const acc: CompactUiNode[] = []

  function walk(n: A11yNode) {
    if (includeInCompactIndex(n) && intersectsViewport(n.bounds, vw, vh)) {
      const name =
        n.name && n.name.length > 240 ? `${n.name.slice(0, 239)}\u2026` : n.name
      acc.push({
        role: n.role,
        ...(name ? { name } : {}),
        ...(n.state && Object.keys(n.state).length > 0 ? { state: n.state } : {}),
        bounds: { ...n.bounds },
        path: n.path,
        focusable: n.focusable,
      })
    }
    for (const c of n.children) walk(c)
  }

  walk(root)

  acc.sort((a, b) => {
    if (a.focusable !== b.focusable) return a.focusable ? -1 : 1
    if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y
    return a.bounds.x - b.bounds.x
  })

  if (acc.length > maxNodes) return { nodes: acc.slice(0, maxNodes), truncated: true }
  return { nodes: acc, truncated: false }
}

export function summarizeCompactIndex(nodes: CompactUiNode[], maxLines = 80): string {
  const lines: string[] = []
  const slice = nodes.slice(0, maxLines)
  for (const n of slice) {
    const nm = n.name ? ` "${truncateUiText(n.name, 48)}"` : ''
    const st = n.state && Object.keys(n.state).length ? ` ${JSON.stringify(n.state)}` : ''
    const foc = n.focusable ? ' *' : ''
    const b = n.bounds
    lines.push(`${n.role}${nm} (${b.x},${b.y} ${b.width}x${b.height}) path=${JSON.stringify(n.path)}${st}${foc}`)
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

function containerName(node: A11yNode): string | undefined {
  return node.name ?? firstNamedDescendant(node, new Set(['heading', 'text']))
}

function listItemName(node: A11yNode): string | undefined {
  return node.name ?? firstNamedDescendant(node, new Set(['heading', 'text', 'link', 'button']))
}

function truncateForModel(value: string | undefined, max = 120): string | undefined {
  if (!value) return undefined
  return value.length > max ? `${value.slice(0, max - 1)}\u2026` : value
}

function toFieldModel(node: A11yNode): PageFieldModel {
  return {
    role: node.role,
    ...(truncateForModel(node.name, 160) ? { name: truncateForModel(node.name, 160) } : {}),
    ...(cloneState(node.state) ? { state: cloneState(node.state) } : {}),
    bounds: cloneBounds(node.bounds),
    path: clonePath(node.path),
  }
}

function toActionModel(node: A11yNode): PageActionModel {
  return {
    role: node.role,
    ...(truncateForModel(node.name, 160) ? { name: truncateForModel(node.name, 160) } : {}),
    ...(cloneState(node.state) ? { state: cloneState(node.state) } : {}),
    bounds: cloneBounds(node.bounds),
    path: clonePath(node.path),
  }
}

function toLandmarkModel(node: A11yNode): PageLandmark {
  return {
    role: node.role,
    ...(truncateForModel(containerName(node), 120) ? { name: truncateForModel(containerName(node), 120) } : {}),
    bounds: cloneBounds(node.bounds),
    path: clonePath(node.path),
  }
}

/**
 * Build a compact, webpage-shaped model from the accessibility tree:
 * landmarks, dialogs, forms, and lists with short previews.
 */
export function buildPageModel(
  root: A11yNode,
  options?: {
    maxFieldsPerForm?: number
    maxActionsPerContainer?: number
    maxItemsPerList?: number
  },
): PageModel {
  const maxFieldsPerForm = options?.maxFieldsPerForm ?? 12
  const maxActionsPerContainer = options?.maxActionsPerContainer ?? 8
  const maxItemsPerList = options?.maxItemsPerList ?? 5

  const landmarks: PageLandmark[] = []
  const forms: PageFormModel[] = []
  const dialogs: PageDialogModel[] = []
  const lists: PageListModel[] = []

  function walk(node: A11yNode) {
    if (LANDMARK_ROLES.has(node.role)) {
      landmarks.push(toLandmarkModel(node))
    }

    if (node.role === 'form') {
      const fields = sortByBounds(collectDescendants(node, candidate => FORM_FIELD_ROLES.has(candidate.role)))
      const actions = sortByBounds(
        collectDescendants(node, candidate => ACTION_ROLES.has(candidate.role) && candidate.focusable),
      )
      const name = truncateForModel(containerName(node), 120)
      forms.push({
        ...(name ? { name } : {}),
        bounds: cloneBounds(node.bounds),
        path: clonePath(node.path),
        fieldCount: fields.length,
        actionCount: actions.length,
        fields: fields.slice(0, maxFieldsPerForm).map(toFieldModel),
        actions: actions.slice(0, maxActionsPerContainer).map(toActionModel),
      })
    }

    if (DIALOG_ROLES.has(node.role)) {
      const actions = sortByBounds(
        collectDescendants(node, candidate => ACTION_ROLES.has(candidate.role) && candidate.focusable),
      )
      const name = truncateForModel(containerName(node), 120)
      dialogs.push({
        ...(name ? { name } : {}),
        bounds: cloneBounds(node.bounds),
        path: clonePath(node.path),
        actionCount: actions.length,
        actions: actions.slice(0, maxActionsPerContainer).map(toActionModel),
      })
    }

    if (node.role === 'list') {
      const items = sortByBounds(collectDescendants(node, candidate => candidate.role === 'listitem'))
      const preview = items
        .map(item => truncateForModel(listItemName(item), 80))
        .filter((value): value is string => !!value)
        .slice(0, maxItemsPerList)
      const name = truncateForModel(containerName(node), 120)
      lists.push({
        ...(name ? { name } : {}),
        bounds: cloneBounds(node.bounds),
        path: clonePath(node.path),
        itemCount: items.length,
        itemsPreview: preview,
      })
    }

    for (const child of node.children) walk(child)
  }

  walk(root)

  return {
    viewport: {
      width: root.bounds.width,
      height: root.bounds.height,
    },
    landmarks: sortByBounds(landmarks),
    forms: sortByBounds(forms),
    dialogs: sortByBounds(dialogs),
    lists: sortByBounds(lists),
  }
}

export function summarizePageModel(model: PageModel, maxLines = 10): string {
  const lines: string[] = []

  if (model.landmarks.length > 0) {
    const landmarks = model.landmarks
      .slice(0, 5)
      .map(landmark => landmark.name ? `${landmark.role} "${truncateUiText(landmark.name, 36)}"` : landmark.role)
      .join(', ')
    lines.push(`landmarks: ${landmarks}`)
  }

  for (const form of model.forms.slice(0, 3)) {
    const name = form.name ? ` "${truncateUiText(form.name, 40)}"` : ''
    lines.push(`form${name}: ${form.fieldCount} fields, ${form.actionCount} actions`)
  }

  for (const dialog of model.dialogs.slice(0, 2)) {
    const name = dialog.name ? ` "${truncateUiText(dialog.name, 40)}"` : ''
    lines.push(`dialog${name}: ${dialog.actionCount} actions`)
  }

  for (const list of model.lists.slice(0, 3)) {
    const name = list.name ? ` "${truncateUiText(list.name, 40)}"` : ''
    const preview = list.itemsPreview.length > 0
      ? ` [${list.itemsPreview.map(item => `"${truncateUiText(item, 24)}"`).join(', ')}]`
      : ''
    lines.push(`list${name}: ${list.itemCount} items${preview}`)
  }

  if (lines.length === 0) {
    return `viewport ${model.viewport.width}x${model.viewport.height}; no common page structures detected`
  }

  return lines.slice(0, maxLines).join('\n')
}

function pathKey(path: number[]): string {
  return path.join('.')
}

function compactNodeLabel(node: CompactUiNode): string {
  if (node.name) return `${node.role} "${truncateUiText(node.name, 40)}"`
  return `${node.role} @ ${JSON.stringify(node.path)}`
}

function formatStateValue(value: boolean | undefined): string {
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
  for (const key of ['disabled', 'expanded', 'selected'] as const) {
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
  const beforeCompact = buildCompactUiIndex(before, { maxNodes }).nodes
  const afterCompact = buildCompactUiIndex(after, { maxNodes }).nodes

  const beforeMap = new Map(beforeCompact.map(node => [pathKey(node.path), node]))
  const afterMap = new Map(afterCompact.map(node => [pathKey(node.path), node]))

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

  const beforeDialogs = new Map(beforePage.dialogs.map(dialog => [pageContainerKey(dialog), dialog]))
  const afterDialogs = new Map(afterPage.dialogs.map(dialog => [pageContainerKey(dialog), dialog]))
  const dialogsOpened = [...afterDialogs.entries()]
    .filter(([key]) => !beforeDialogs.has(key))
    .map(([, value]) => value)
  const dialogsClosed = [...beforeDialogs.entries()]
    .filter(([key]) => !afterDialogs.has(key))
    .map(([, value]) => value)

  const beforeForms = new Map(beforePage.forms.map(form => [pageContainerKey(form), form]))
  const afterForms = new Map(afterPage.forms.map(form => [pageContainerKey(form), form]))
  const formsAppeared = [...afterForms.entries()]
    .filter(([key]) => !beforeForms.has(key))
    .map(([, value]) => value)
  const formsRemoved = [...beforeForms.entries()]
    .filter(([key]) => !afterForms.has(key))
    .map(([, value]) => value)

  const beforeLists = new Map(beforePage.lists.map(list => [pathKey(list.path), list]))
  const afterLists = new Map(afterPage.lists.map(list => [pathKey(list.path), list]))
  const listCountsChanged: UiListCountChange[] = []
  for (const [key, afterList] of afterLists) {
    const beforeList = beforeLists.get(key)
    if (beforeList && beforeList.itemCount !== afterList.itemCount) {
      listCountsChanged.push({
        ...(afterList.name ? { name: afterList.name } : {}),
        path: clonePath(afterList.path),
        beforeCount: beforeList.itemCount,
        afterCount: afterList.itemCount,
      })
    }
  }

  return {
    added,
    removed,
    updated,
    dialogsOpened,
    dialogsClosed,
    formsAppeared,
    formsRemoved,
    listCountsChanged,
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
    delta.listCountsChanged.length > 0
  )
}

export function summarizeUiDelta(delta: UiDelta, maxLines = 14): string {
  const lines: string[] = []

  for (const dialog of delta.dialogsOpened.slice(0, 2)) {
    lines.push(`+ dialog${dialog.name ? ` "${truncateUiText(dialog.name, 40)}"` : ''} opened`)
  }

  for (const dialog of delta.dialogsClosed.slice(0, 2)) {
    lines.push(`- dialog${dialog.name ? ` "${truncateUiText(dialog.name, 40)}"` : ''} closed`)
  }

  for (const form of delta.formsAppeared.slice(0, 2)) {
    lines.push(`+ form${form.name ? ` "${truncateUiText(form.name, 40)}"` : ''} appeared (${form.fieldCount} fields)`)
  }

  for (const form of delta.formsRemoved.slice(0, 2)) {
    lines.push(`- form${form.name ? ` "${truncateUiText(form.name, 40)}"` : ''} removed`)
  }

  for (const list of delta.listCountsChanged.slice(0, 3)) {
    lines.push(`~ list${list.name ? ` "${truncateUiText(list.name, 40)}"` : ''} items ${list.beforeCount} -> ${list.afterCount}`)
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
    bounds,
    path,
    children,
    focusable,
  }
}

function inferRole(kind: string | undefined, semantic: Record<string, unknown> | undefined, handlers: Record<string, unknown> | undefined): string {
  if (semantic?.role) return semantic.role as string
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

function sendAndWaitForUpdate(session: Session, message: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (session.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected'))
      return
    }
    session.ws.send(JSON.stringify(message))
    waitForNextUpdate(session).then(resolve).catch(reject)
  })
}

function waitForNextUpdate(session: Session): Promise<void> {
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
          resolve()
        } else if (msg.type === 'patch' && session.layout) {
          applyPatches(session.layout, msg.patches)
          cleanup()
          resolve()
        }
      } catch { /* ignore */ }
    }

    // Resolve after timeout even if no update comes (action may not change layout)
    const timeout = setTimeout(() => { cleanup(); resolve() }, 2000)

    function cleanup() {
      clearTimeout(timeout)
      session.ws.off('message', onMessage)
    }

    session.ws.on('message', onMessage)
  })
}

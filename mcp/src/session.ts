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
  value?: string
  state?: {
    disabled?: boolean
    expanded?: boolean
    selected?: boolean
    checked?: boolean | 'mixed'
    focused?: boolean
    invalid?: boolean
    required?: boolean
    busy?: boolean
  }
  validation?: { description?: string; error?: string }
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
  value?: string
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

export interface NodeContextModel {
  prompt?: string
  section?: string
}

export interface NodeVisibilityModel {
  intersectsViewport: boolean
  fullyVisible: boolean
  offscreenAbove: boolean
  offscreenBelow: boolean
  offscreenLeft: boolean
  offscreenRight: boolean
}

export interface NodeScrollHintModel {
  status: 'visible' | 'partial' | 'offscreen'
  revealDeltaX: number
  revealDeltaY: number
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
  value?: string
  state?: A11yNode['state']
  validation?: A11yNode['validation']
  context?: NodeContextModel
  visibility?: NodeVisibilityModel
  scrollHint?: NodeScrollHintModel
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface PageActionModel {
  id: string
  role: string
  name?: string
  state?: A11yNode['state']
  context?: NodeContextModel
  visibility?: NodeVisibilityModel
  scrollHint?: NodeScrollHintModel
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
    requiredFieldCount: number
    invalidFieldCount: number
    actionCount: number
    listCount: number
    itemCount: number
  }
  page: {
    fields: { offset: number; returned: number; total: number; hasMore: boolean }
    actions: { offset: number; returned: number; total: number; hasMore: boolean }
    lists: { offset: number; returned: number; total: number; hasMore: boolean }
    items: { offset: number; returned: number; total: number; hasMore: boolean }
  }
  headings: PageHeadingModel[]
  fields: PageFieldModel[]
  actions: PageActionModel[]
  lists: PageListModel[]
  items: PageListItemModel[]
  textPreview: string[]
}

export type FormSchemaFieldKind = 'text' | 'choice' | 'toggle' | 'multi_choice'

export interface FormSchemaField {
  id: string
  kind: FormSchemaFieldKind
  label: string
  required?: boolean
  invalid?: boolean
  controlType?: 'checkbox' | 'radio'
  value?: string
  valueLength?: number
  checked?: boolean
  values?: string[]
  optionCount?: number
  options?: string[]
  context?: NodeContextModel
}

export interface FormSchemaModel {
  formId: string
  name?: string
  fieldCount: number
  requiredCount: number
  invalidCount: number
  fields: FormSchemaField[]
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
  updateRevision: number
  /** Present when this session owns a child geometra-proxy process (pageUrl connect). */
  proxyChild?: ChildProcess
}

export interface UpdateWaitResult {
  status: 'updated' | 'acknowledged' | 'timed_out'
  timeoutMs: number
  result?: unknown
}

let activeSession: Session | null = null
const ACTION_UPDATE_TIMEOUT_MS = 2000
const LISTBOX_UPDATE_TIMEOUT_MS = 4500
const FILL_BATCH_BASE_TIMEOUT_MS = 2500
const FILL_BATCH_TEXT_FIELD_TIMEOUT_MS = 275
const FILL_BATCH_TEXT_LENGTH_TIMEOUT_MS = 120
const FILL_BATCH_TEXT_LENGTH_SLICE = 80
const FILL_BATCH_CHOICE_FIELD_TIMEOUT_MS = 500
const FILL_BATCH_TOGGLE_FIELD_TIMEOUT_MS = 225
const FILL_BATCH_FILE_FIELD_TIMEOUT_MS = 5000
const FILL_BATCH_MAX_TIMEOUT_MS = 60_000
let nextRequestSequence = 0

export type ProxyFillField =
  | { kind: 'text'; fieldLabel: string; value: string; exact?: boolean }
  | { kind: 'choice'; fieldLabel: string; value: string; query?: string; exact?: boolean }
  | { kind: 'toggle'; label: string; checked?: boolean; exact?: boolean; controlType?: 'checkbox' | 'radio' }
  | { kind: 'file'; fieldLabel: string; paths: string[]; exact?: boolean }

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
export function connect(
  url: string,
  opts?: { width?: number; height?: number; skipInitialResize?: boolean },
): Promise<Session> {
  return new Promise((resolve, reject) => {
    shutdownPreviousSession()

    const ws = new WebSocket(url)
    const session: Session = { ws, layout: null, tree: null, url, updateRevision: 0 }
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        ws.close()
        reject(new Error(`Connection to ${url} timed out after 10s`))
      }
    }, 10_000)

    ws.on('open', () => {
      if (opts?.skipInitialResize) return
      const width = opts?.width ?? 1024
      const height = opts?.height ?? 768
      ws.send(JSON.stringify({ type: 'resize', width, height }))
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data))
        if (msg.type === 'frame') {
          session.layout = msg.layout
          session.tree = msg.tree
          session.updateRevision++
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            activeSession = session
            resolve(session)
          }
        } else if (msg.type === 'patch' && session.layout) {
          applyPatches(session.layout, msg.patches)
          session.updateRevision++
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
    const session = await connect(wsUrl, { skipInitialResize: true })
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

function estimateFillBatchTimeout(fields: ProxyFillField[]): number {
  let total = FILL_BATCH_BASE_TIMEOUT_MS
  let totalTextLength = 0
  for (const field of fields) {
    switch (field.kind) {
      case 'text':
        totalTextLength += field.value.length
        total += FILL_BATCH_TEXT_FIELD_TIMEOUT_MS
        total += Math.ceil(Math.max(1, field.value.length) / FILL_BATCH_TEXT_LENGTH_SLICE) * FILL_BATCH_TEXT_LENGTH_TIMEOUT_MS
        break
      case 'choice':
        total += FILL_BATCH_CHOICE_FIELD_TIMEOUT_MS
        break
      case 'toggle':
        total += FILL_BATCH_TOGGLE_FIELD_TIMEOUT_MS
        break
      case 'file':
        total += FILL_BATCH_FILE_FIELD_TIMEOUT_MS
        break
    }
  }
  if (fields.length >= 20 || totalTextLength >= 1500) {
    total = Math.max(total, 30_000)
  }
  return Math.min(total, FILL_BATCH_MAX_TIMEOUT_MS)
}

export function waitForUiCondition(
  session: Session,
  predicate: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const check = () => {
      let matched = false
      try {
        matched = predicate()
      } catch {
        matched = false
      }
      if (matched) {
        cleanup()
        resolve(true)
      }
    }

    const timeout = setTimeout(() => {
      cleanup()
      resolve(false)
    }, timeoutMs)

    const onMessage = () => {
      check()
    }

    const onClose = () => {
      cleanup()
      resolve(false)
    }

    function cleanup() {
      clearTimeout(timeout)
      session.ws.off('message', onMessage)
      session.ws.off('close', onClose)
    }

    session.ws.on('message', onMessage)
    session.ws.on('close', onClose)
    check()
  })
}

/**
 * Send a click event at (x, y) and wait for the next frame/patch response.
 */
export function sendClick(session: Session, x: number, y: number, timeoutMs?: number): Promise<UpdateWaitResult> {
  return sendAndWaitForUpdate(session, {
    type: 'event',
    eventType: 'onClick',
    x,
    y,
  }, timeoutMs)
}

/**
 * Send a sequence of key events to type text into the focused element.
 */
export function sendType(session: Session, text: string, timeoutMs?: number): Promise<UpdateWaitResult> {
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
    waitForNextUpdate(session, timeoutMs).then(resolve).catch(reject)
  })
}

/**
 * Send a special key (Enter, Tab, Escape, etc.)
 */
export function sendKey(
  session: Session,
  key: string,
  modifiers?: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean },
  timeoutMs?: number,
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
  }, timeoutMs)
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
    fieldLabel?: string
    exact?: boolean
    strategy?: 'auto' | 'chooser' | 'hidden' | 'drop'
    drop?: { x: number; y: number }
  },
  timeoutMs?: number,
): Promise<UpdateWaitResult> {
  const payload: Record<string, unknown> = { type: 'file', paths }
  if (opts?.click) {
    payload.x = opts.click.x
    payload.y = opts.click.y
  }
  if (opts?.fieldLabel) payload.fieldLabel = opts.fieldLabel
  if (opts?.exact !== undefined) payload.exact = opts.exact
  if (opts?.strategy) payload.strategy = opts.strategy
  if (opts?.drop) {
    payload.dropX = opts.drop.x
    payload.dropY = opts.drop.y
  }
  return sendAndWaitForUpdate(session, payload, timeoutMs)
}

/** Set a labeled text-like field (`input`, `textarea`, contenteditable, ARIA textbox) semantically. */
export function sendFieldText(
  session: Session,
  fieldLabel: string,
  value: string,
  opts?: { exact?: boolean },
  timeoutMs?: number,
): Promise<UpdateWaitResult> {
  const payload: Record<string, unknown> = {
    type: 'setFieldText',
    fieldLabel,
    value,
  }
  if (opts?.exact !== undefined) payload.exact = opts.exact
  return sendAndWaitForUpdate(session, payload, timeoutMs)
}

/** Choose a value for a labeled choice field (select, custom combobox, or radio-style group). */
export function sendFieldChoice(
  session: Session,
  fieldLabel: string,
  value: string,
  opts?: { exact?: boolean; query?: string },
  timeoutMs = LISTBOX_UPDATE_TIMEOUT_MS,
): Promise<UpdateWaitResult> {
  const payload: Record<string, unknown> = {
    type: 'setFieldChoice',
    fieldLabel,
    value,
  }
  if (opts?.exact !== undefined) payload.exact = opts.exact
  if (opts?.query) payload.query = opts.query
  return sendAndWaitForUpdate(session, payload, timeoutMs)
}

/** Fill several semantic form fields in one proxy-side batch. */
export function sendFillFields(
  session: Session,
  fields: ProxyFillField[],
  timeoutMs = estimateFillBatchTimeout(fields),
): Promise<UpdateWaitResult> {
  return sendAndWaitForUpdate(session, { type: 'fillFields', fields }, timeoutMs)
}

/** ARIA `role=option` listbox (e.g. React Select). Optional click opens the list. */
export function sendListboxPick(
  session: Session,
  label: string,
  opts?: { exact?: boolean; open?: { x: number; y: number }; fieldLabel?: string; query?: string },
  timeoutMs = LISTBOX_UPDATE_TIMEOUT_MS,
): Promise<UpdateWaitResult> {
  const payload: Record<string, unknown> = { type: 'listboxPick', label }
  if (opts?.exact !== undefined) payload.exact = opts.exact
  if (opts?.open) {
    payload.openX = opts.open.x
    payload.openY = opts.open.y
  }
  if (opts?.fieldLabel) payload.fieldLabel = opts.fieldLabel
  if (opts?.query) payload.query = opts.query
  return sendAndWaitForUpdate(session, payload, timeoutMs)
}

/** Native `<select>` only: click the control center, then pick by value, label text, or zero-based index. */
export function sendSelectOption(
  session: Session,
  x: number,
  y: number,
  option: { value?: string; label?: string; index?: number },
  timeoutMs?: number,
): Promise<UpdateWaitResult> {
  return sendAndWaitForUpdate(session, {
    type: 'selectOption',
    x,
    y,
    ...option,
  }, timeoutMs)
}

/** Set a checkbox/radio by label instead of relying on coordinate clicks. */
export function sendSetChecked(
  session: Session,
  label: string,
  opts?: { checked?: boolean; exact?: boolean; controlType?: 'checkbox' | 'radio' },
  timeoutMs?: number,
): Promise<UpdateWaitResult> {
  const payload: Record<string, unknown> = { type: 'setChecked', label }
  if (opts?.checked !== undefined) payload.checked = opts.checked
  if (opts?.exact !== undefined) payload.exact = opts.exact
  if (opts?.controlType) payload.controlType = opts.controlType
  return sendAndWaitForUpdate(session, payload, timeoutMs)
}

/** Mouse wheel / scroll. Optional `x`,`y` move pointer before scrolling. */
export function sendWheel(
  session: Session,
  deltaY: number,
  opts?: { deltaX?: number; x?: number; y?: number },
  timeoutMs?: number,
): Promise<UpdateWaitResult> {
  return sendAndWaitForUpdate(session, {
    type: 'wheel',
    deltaY,
    deltaX: opts?.deltaX ?? 0,
    ...(opts?.x !== undefined ? { x: opts.x } : {}),
    ...(opts?.y !== undefined ? { y: opts.y } : {}),
  }, timeoutMs)
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

function formFieldIdForPath(path: number[]): string {
  return `ff:${encodePath(path)}`
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
  const value = sanitizeInlineName(node.value, 180)
  return {
    id: nodeIdForPath(node.path),
    role: node.role,
    ...(name ? { name } : {}),
    ...(value ? { value } : {}),
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
    const val = n.value ? ` value=${JSON.stringify(truncateUiText(n.value, 40))}` : ''
    const st = n.state && Object.keys(n.state).length ? ` ${JSON.stringify(n.state)}` : ''
    const foc = n.focusable ? ' *' : ''
    const pin = n.pinned ? ' [pinned]' : ''
    const b = n.bounds
    lines.push(`${n.id} ${n.role}${nm}${pin}${val} (${b.x},${b.y} ${b.width}x${b.height})${st}${foc}`)
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
  if (state.invalid !== undefined) next.invalid = state.invalid
  if (state.required !== undefined) next.required = state.required
  if (state.busy !== undefined) next.busy = state.busy
  return Object.keys(next).length > 0 ? next : undefined
}

function cloneValidation(validation: A11yNode['validation'] | undefined): A11yNode['validation'] | undefined {
  if (!validation) return undefined
  const next: A11yNode['validation'] = {}
  if (validation.description) next.description = validation.description
  if (validation.error) next.error = validation.error
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

function buildVisibility(bounds: A11yNode['bounds'], viewport: { width: number; height: number }): NodeVisibilityModel {
  const visibleLeft = Math.max(0, bounds.x)
  const visibleTop = Math.max(0, bounds.y)
  const visibleRight = Math.min(viewport.width, bounds.x + bounds.width)
  const visibleBottom = Math.min(viewport.height, bounds.y + bounds.height)
  const hasVisibleIntersection = visibleRight > visibleLeft && visibleBottom > visibleTop
  const fullyVisible =
    bounds.x >= 0 &&
    bounds.y >= 0 &&
    bounds.x + bounds.width <= viewport.width &&
    bounds.y + bounds.height <= viewport.height
  return {
    intersectsViewport: hasVisibleIntersection,
    fullyVisible,
    offscreenAbove: bounds.y + bounds.height <= 0,
    offscreenBelow: bounds.y >= viewport.height,
    offscreenLeft: bounds.x + bounds.width <= 0,
    offscreenRight: bounds.x >= viewport.width,
  }
}

function buildScrollHint(bounds: A11yNode['bounds'], viewport: { width: number; height: number }): NodeScrollHintModel {
  const visibility = buildVisibility(bounds, viewport)
  return {
    status: visibility.fullyVisible ? 'visible' : visibility.intersectsViewport ? 'partial' : 'offscreen',
    revealDeltaX: Math.round(bounds.x + bounds.width / 2 - viewport.width / 2),
    revealDeltaY: Math.round(bounds.y + bounds.height / 2 - viewport.height / 2),
  }
}

function ancestorNodes(root: A11yNode, path: number[]): A11yNode[] {
  const out: A11yNode[] = []
  let current: A11yNode = root
  for (const index of path) {
    out.push(current)
    if (!current.children[index]) break
    current = current.children[index]!
  }
  return out
}

function countGroupedChoiceControls(node: A11yNode): number {
  return collectDescendants(
    node,
    candidate => candidate.role === 'radio' || candidate.role === 'checkbox' || candidate.role === 'button',
  ).length
}

function nearestPromptText(container: A11yNode, target: A11yNode): string | undefined {
  const candidates = collectDescendants(
    container,
    candidate =>
      (candidate.role === 'heading' || candidate.role === 'text') &&
      !!sanitizeInlineName(candidate.name, 120) &&
      pathKey(candidate.path) !== pathKey(target.path),
  )

  const normalizedTarget = normalizeUiText(target.name ?? '')
  const best = candidates
    .filter(candidate => candidate.bounds.y <= target.bounds.y + 8)
    .map(candidate => {
      const text = sanitizeInlineName(candidate.name, 120)
      if (!text) return null
      if (normalizeUiText(text) === normalizedTarget) return null
      const dy = Math.max(0, target.bounds.y - candidate.bounds.y)
      const dx = Math.abs(target.bounds.x - candidate.bounds.x)
      const headingBonus = candidate.role === 'heading' ? -32 : 0
      const questionBonus = /\?\s*$/.test(text) ? -160 : 0
      const lengthPenalty = text.length > 90 ? 80 : text.length > 60 ? 40 : text.length > 45 ? 20 : 0
      return { text, score: dy * 4 + dx + headingBonus + questionBonus + lengthPenalty }
    })
    .filter((candidate): candidate is { text: string; score: number } => !!candidate)
    .sort((a, b) => a.score - b.score)[0]

  return best?.text
}

function nodeContext(root: A11yNode, node: A11yNode): NodeContextModel | undefined {
  const ancestors = ancestorNodes(root, node.path)
  let prompt: string | undefined
  const promptEligibleNode = node.role === 'radio' || node.role === 'button'
  if (promptEligibleNode) {
    for (let index = ancestors.length - 1; index >= 0; index--) {
      const ancestor = ancestors[index]!
      const grouped = countGroupedChoiceControls(ancestor) >= 2
      const eligiblePromptContainer =
        (ancestor.role === 'group' && ancestor.path.length > 0) ||
        ancestor.role === 'dialog' ||
        (ancestor.role === 'form' && grouped)
      if (eligiblePromptContainer) {
        prompt = nearestPromptText(ancestor, node)
        if (prompt) break
      }
    }
  }

  let section: string | undefined
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const ancestor = ancestors[index]!
    const kind = sectionKindForNode(ancestor)
    if (!kind) continue
    section = sectionDisplayName(ancestor, kind)
    if (section) break
  }

  if (!prompt && !section) return undefined
  return {
    ...(prompt ? { prompt } : {}),
    ...(section ? { section } : {}),
  }
}

function toFieldModel(root: A11yNode, node: A11yNode, includeBounds = true): PageFieldModel {
  const value = sanitizeInlineName(node.value, 120)
  const context = nodeContext(root, node)
  const visibility = buildVisibility(node.bounds, root.bounds)
  const scrollHint = buildScrollHint(node.bounds, root.bounds)
  return {
    id: nodeIdForPath(node.path),
    role: node.role,
    ...(fieldLabel(node) ? { name: fieldLabel(node) } : {}),
    ...(value ? { value } : {}),
    ...(cloneState(node.state) ? { state: cloneState(node.state) } : {}),
    ...(cloneValidation(node.validation) ? { validation: cloneValidation(node.validation) } : {}),
    ...(context ? { context } : {}),
    visibility,
    scrollHint,
    ...(includeBounds ? { bounds: cloneBounds(node.bounds) } : {}),
  }
}

function toActionModel(root: A11yNode, node: A11yNode, includeBounds = true): PageActionModel {
  const context = nodeContext(root, node)
  const visibility = buildVisibility(node.bounds, root.bounds)
  const scrollHint = buildScrollHint(node.bounds, root.bounds)
  return {
    id: nodeIdForPath(node.path),
    role: node.role,
    ...(sanitizeInlineName(node.name, 80) ? { name: sanitizeInlineName(node.name, 80) } : {}),
    ...(cloneState(node.state) ? { state: cloneState(node.state) } : {}),
    ...(context ? { context } : {}),
    visibility,
    scrollHint,
    ...(includeBounds ? { bounds: cloneBounds(node.bounds) } : {}),
  }
}

function compactSchemaContext(context: NodeContextModel | undefined, label: string): NodeContextModel | undefined {
  if (!context) return undefined
  const out: NodeContextModel = {}
  if (context.prompt && normalizeUiText(context.prompt) !== normalizeUiText(label)) out.prompt = context.prompt
  if (context.section) out.section = context.section
  return Object.keys(out).length > 0 ? out : undefined
}

function compactSchemaValue(value: string | undefined, inlineLimit = 80): { value?: string; valueLength?: number } {
  const normalized = sanitizeInlineName(value, Math.max(120, inlineLimit + 32))
  if (!normalized) return {}
  return normalized.length <= inlineLimit
    ? { value: normalized }
    : { valueLength: normalized.length }
}

function schemaOptionLabel(node: A11yNode): string | undefined {
  return sanitizeFieldName(node.name, 80) ?? sanitizeInlineName(node.name, 80)
}

function isGroupedChoiceControl(node: A11yNode): boolean {
  return node.role === 'radio' || node.role === 'checkbox' || (node.role === 'button' && node.focusable)
}

function groupedChoiceForNode(root: A11yNode, formNode: A11yNode, seed: A11yNode): {
  container: A11yNode
  prompt: string
  controls: A11yNode[]
} | null {
  const context = nodeContext(root, seed)
  const prompt = context?.prompt
  if (!prompt) return null

  const matchesPrompt = (candidate: A11yNode): boolean => {
    if (!isGroupedChoiceControl(candidate)) return false
    return nodeContext(root, candidate)?.prompt === prompt
  }

  const ancestors = ancestorNodes(root, seed.path)
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const ancestor = ancestors[index]!
    if (ancestor.role === 'form') continue
    const controls = sortByBounds(collectDescendants(ancestor, matchesPrompt))
    if (controls.length >= 2) {
      return { container: ancestor, prompt, controls }
    }
  }

  if (seed.role !== 'radio' && seed.role !== 'button') return null
  const controls = sortByBounds(collectDescendants(formNode, matchesPrompt))
  return controls.length >= 2 ? { container: formNode, prompt, controls } : null
}

function simpleSchemaField(root: A11yNode, node: A11yNode): FormSchemaField | null {
  const context = nodeContext(root, node)
  const label = fieldLabel(node) ?? sanitizeInlineName(node.name, 80) ?? context?.prompt
  if (!label) return null

  return {
    id: formFieldIdForPath(node.path),
    kind: node.role === 'combobox' ? 'choice' : 'text',
    label,
    ...(node.state?.required ? { required: true } : {}),
    ...(node.state?.invalid ? { invalid: true } : {}),
    ...compactSchemaValue(node.value, 72),
    ...(compactSchemaContext(context, label) ? { context: compactSchemaContext(context, label) } : {}),
  }
}

function groupedSchemaField(
  root: A11yNode,
  grouped: { container: A11yNode; prompt: string; controls: A11yNode[] },
): FormSchemaField | null {
  const optionEntries = grouped.controls
    .map(control => ({
      label: schemaOptionLabel(control),
      selected: control.state?.checked === true || control.state?.selected === true,
      role: control.role,
    }))
    .filter((entry): entry is { label: string; selected: boolean; role: string } => !!entry.label)

  if (optionEntries.length < 2) return null

  const options = dedupeStrings(optionEntries.map(entry => entry.label), 16)
  const selectedOptions = dedupeStrings(
    optionEntries.filter(entry => entry.selected).map(entry => entry.label),
    16,
  )
  const radioLike = optionEntries.every(entry => entry.role === 'radio' || entry.role === 'button')
  const context = nodeContext(root, grouped.controls[0]!)

  return {
    id: formFieldIdForPath(grouped.container.path),
    kind: radioLike ? 'choice' : 'multi_choice',
    label: grouped.prompt,
    ...(grouped.controls.some(control => control.state?.required) ? { required: true } : {}),
    ...(grouped.controls.some(control => control.state?.invalid) ? { invalid: true } : {}),
    ...(radioLike
      ? {
          ...(selectedOptions[0] ? { value: selectedOptions[0] } : {}),
        }
      : {
          ...(selectedOptions.length > 0 ? { values: selectedOptions } : {}),
        }),
    optionCount: options.length,
    options,
    ...(compactSchemaContext(context, grouped.prompt) ? { context: compactSchemaContext(context, grouped.prompt) } : {}),
  }
}

function toggleSchemaField(root: A11yNode, node: A11yNode): FormSchemaField | null {
  const label = schemaOptionLabel(node)
  if (!label) return null
  const context = nodeContext(root, node)
  const controlType = node.role === 'radio' ? 'radio' : 'checkbox'
  return {
    id: formFieldIdForPath(node.path),
    kind: 'toggle',
    label,
    controlType,
    ...(node.state?.required ? { required: true } : {}),
    ...(node.state?.invalid ? { invalid: true } : {}),
    ...(node.state?.checked !== undefined ? { checked: node.state.checked === true } : {}),
    ...(compactSchemaContext(context, label) ? { context: compactSchemaContext(context, label) } : {}),
  }
}

function buildFormSchemaForNode(
  root: A11yNode,
  formNode: A11yNode,
  options?: {
    maxFields?: number
    onlyRequiredFields?: boolean
    onlyInvalidFields?: boolean
  },
): FormSchemaModel {
  const candidates = sortByBounds(
    collectDescendants(
      formNode,
      candidate =>
        candidate.role === 'textbox' ||
        candidate.role === 'combobox' ||
        candidate.role === 'checkbox' ||
        candidate.role === 'radio' ||
        (candidate.role === 'button' && candidate.focusable),
    ),
  )

  const consumed = new Set<string>()
  const fields: FormSchemaField[] = []

  for (const candidate of candidates) {
    const candidateKey = pathKey(candidate.path)
    if (consumed.has(candidateKey)) continue

    if (candidate.role === 'textbox' || candidate.role === 'combobox') {
      const field = simpleSchemaField(root, candidate)
      if (field) fields.push(field)
      consumed.add(candidateKey)
      continue
    }

    const grouped = groupedChoiceForNode(root, formNode, candidate)
    if (grouped && grouped.controls.some(control => pathKey(control.path) === candidateKey)) {
      const field = groupedSchemaField(root, grouped)
      for (const control of grouped.controls) consumed.add(pathKey(control.path))
      if (field) fields.push(field)
      continue
    }

    if (candidate.role === 'checkbox' || candidate.role === 'radio') {
      const field = toggleSchemaField(root, candidate)
      if (field) fields.push(field)
      consumed.add(candidateKey)
    }
  }

  const compactFields = trimSchemaFieldContexts(fields)

  const filteredFields = compactFields.filter(field => {
    if (options?.onlyRequiredFields && !field.required) return false
    if (options?.onlyInvalidFields && !field.invalid) return false
    return true
  })
  const maxFields = options?.maxFields ?? filteredFields.length
  const pageFields = filteredFields.slice(0, maxFields)
  const name = sectionDisplayName(formNode, 'form')

  return {
    formId: sectionIdForPath('form', formNode.path),
    ...(name ? { name } : {}),
    fieldCount: compactFields.length,
    requiredCount: compactFields.filter(field => field.required).length,
    invalidCount: compactFields.filter(field => field.invalid).length,
    fields: pageFields,
  }
}

function trimSchemaFieldContexts(fields: FormSchemaField[]): FormSchemaField[] {
  const labelCounts = new Map<string, number>()
  for (const field of fields) {
    const key = normalizeUiText(field.label)
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1)
  }

  return fields.map(field => {
    if (!field.context) return field

    const trimmed: NodeContextModel = {}
    if (field.context.prompt && normalizeUiText(field.context.prompt) !== normalizeUiText(field.label)) {
      trimmed.prompt = field.context.prompt
    }
    if ((labelCounts.get(normalizeUiText(field.label)) ?? 0) > 1 && field.context.section) {
      trimmed.section = field.context.section
    }

    if (Object.keys(trimmed).length === 0) {
      const { context: _context, ...rest } = field
      return rest
    }
    return { ...field, context: trimmed }
  })
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

export function buildFormSchemas(
  root: A11yNode,
  options?: {
    formId?: string
    maxFields?: number
    onlyRequiredFields?: boolean
    onlyInvalidFields?: boolean
  },
): FormSchemaModel[] {
  const forms = sortByBounds([
    ...(root.role === 'form' ? [root] : []),
    ...collectDescendants(root, candidate => candidate.role === 'form'),
  ])
  return forms
    .filter(form => !options?.formId || sectionIdForPath('form', form.path) === options.formId)
    .map(form => buildFormSchemaForNode(root, form, options))
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
    fieldOffset?: number
    onlyRequiredFields?: boolean
    onlyInvalidFields?: boolean
    maxActions?: number
    actionOffset?: number
    maxLists?: number
    listOffset?: number
    maxItems?: number
    itemOffset?: number
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
  const fieldOffset = Math.max(0, options?.fieldOffset ?? 0)
  const onlyRequiredFields = options?.onlyRequiredFields ?? false
  const onlyInvalidFields = options?.onlyInvalidFields ?? false
  const maxActions = options?.maxActions ?? 12
  const actionOffset = Math.max(0, options?.actionOffset ?? 0)
  const maxLists = options?.maxLists ?? 8
  const listOffset = Math.max(0, options?.listOffset ?? 0)
  const maxItems = options?.maxItems ?? 20
  const itemOffset = Math.max(0, options?.itemOffset ?? 0)
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
  const requiredFieldCount = fieldsAll.filter(field => field.state?.required).length
  const invalidFieldCount = fieldsAll.filter(field => field.state?.invalid).length
  const filteredFields = fieldsAll.filter(field => {
    if (onlyRequiredFields && !field.state?.required) return false
    if (onlyInvalidFields && !field.state?.invalid) return false
    return true
  })
  const pageFields = filteredFields.slice(fieldOffset, fieldOffset + maxFields)
  const pageActions = actionsAll.slice(actionOffset, actionOffset + maxActions)
  const pageLists = nestedListsAll.slice(listOffset, listOffset + maxLists)
  const pageItems = itemsAll.slice(itemOffset, itemOffset + maxItems)

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
      requiredFieldCount,
      invalidFieldCount,
      actionCount: actionsAll.length,
      listCount: nestedListsAll.length,
      itemCount: itemsAll.length,
    },
    page: {
      fields: {
        offset: fieldOffset,
        returned: pageFields.length,
        total: filteredFields.length,
        hasMore: fieldOffset + pageFields.length < filteredFields.length,
      },
      actions: {
        offset: actionOffset,
        returned: pageActions.length,
        total: actionsAll.length,
        hasMore: actionOffset + pageActions.length < actionsAll.length,
      },
      lists: {
        offset: listOffset,
        returned: pageLists.length,
        total: nestedListsAll.length,
        hasMore: listOffset + pageLists.length < nestedListsAll.length,
      },
      items: {
        offset: itemOffset,
        returned: pageItems.length,
        total: itemsAll.length,
        hasMore: itemOffset + pageItems.length < itemsAll.length,
      },
    },
    headings: headingModels(node, maxHeadings, includeBounds),
    fields: pageFields.map(field => toFieldModel(root, field, includeBounds)),
    actions: pageActions.map(action => toActionModel(root, action, includeBounds)),
    lists: pageLists.map(list => ({
      id: sectionIdForPath('list', list.path),
      role: list.role,
      ...(sectionDisplayName(list, 'list') ? { name: sectionDisplayName(list, 'list') } : {}),
      bounds: cloneBounds(list.bounds),
      itemCount: collectDescendants(list, candidate => candidate.role === 'listitem').length,
    })),
    items: pageItems.map(item => ({
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
  if (node.name) {
    const value = node.value ? ` value=${JSON.stringify(truncateUiText(node.value, 28))}` : ''
    return `${node.id} ${node.role} "${truncateUiText(node.name, 40)}"${value}`
  }
  if (node.value) return `${node.id} ${node.role} value=${JSON.stringify(truncateUiText(node.value, 28))}`
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
  if ((before.value ?? '') !== (after.value ?? '')) {
    changes.push(`value ${JSON.stringify(truncateUiText(before.value ?? 'unset', 32))} -> ${JSON.stringify(truncateUiText(after.value ?? 'unset', 32))}`)
  }

  const beforeState = before.state ?? {}
  const afterState = after.state ?? {}
  for (const key of ['disabled', 'expanded', 'selected', 'checked', 'focused', 'invalid', 'required', 'busy'] as const) {
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
  const value = inferValue(semantic, props)
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
  if (semantic?.ariaInvalid !== undefined) state.invalid = !!semantic.ariaInvalid
  if (semantic?.ariaRequired !== undefined) state.required = !!semantic.ariaRequired
  if (semantic?.ariaBusy !== undefined) state.busy = !!semantic.ariaBusy

  const validation: A11yNode['validation'] = {}
  if (typeof semantic?.validationDescription === 'string' && semantic.validationDescription.trim().length > 0) {
    validation.description = semantic.validationDescription
  }
  if (typeof semantic?.validationError === 'string' && semantic.validationError.trim().length > 0) {
    validation.error = semantic.validationError
  }

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
    ...(value ? { value } : {}),
    ...(Object.keys(state).length > 0 ? { state } : {}),
    ...(Object.keys(validation).length > 0 ? { validation } : {}),
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

function inferValue(
  semantic: Record<string, unknown> | undefined,
  props: Record<string, unknown> | undefined,
): string | undefined {
  const direct = semantic?.valueText ?? props?.value
  return typeof direct === 'string' && direct.trim().length > 0 ? direct : undefined
}

function applyPatches(layout: Record<string, unknown>, patches: Array<{ path: number[]; x?: number; y?: number; width?: number; height?: number }>): void {
  for (const patch of patches) {
    let node = layout
    let validPath = true
    for (const idx of patch.path) {
      const children = node.children as Record<string, unknown>[] | undefined
      if (!children?.[idx]) {
        validPath = false
        break
      }
      node = children[idx]
    }
    if (!validPath) continue
    if (patch.x !== undefined) node.x = patch.x
    if (patch.y !== undefined) node.y = patch.y
    if (patch.width !== undefined) node.width = patch.width
    if (patch.height !== undefined) node.height = patch.height
  }
}

function sendAndWaitForUpdate(
  session: Session,
  message: Record<string, unknown>,
  timeoutMs = ACTION_UPDATE_TIMEOUT_MS,
): Promise<UpdateWaitResult> {
  return new Promise((resolve, reject) => {
    if (session.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected'))
      return
    }
    const requestId = `req-${++nextRequestSequence}`
    const startRevision = session.updateRevision
    session.ws.send(JSON.stringify({ ...message, requestId }))
    waitForNextUpdate(session, timeoutMs, requestId, startRevision).then(resolve).catch(reject)
  })
}

function waitForNextUpdate(
  session: Session,
  timeoutMs = ACTION_UPDATE_TIMEOUT_MS,
  requestId?: string,
  startRevision = session.updateRevision,
): Promise<UpdateWaitResult> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(String(data))
        const messageRequestId = typeof msg.requestId === 'string' ? msg.requestId : undefined

        if (requestId) {
          if (msg.type === 'error' && (messageRequestId === requestId || messageRequestId === undefined)) {
            cleanup()
            reject(new Error(typeof msg.message === 'string' ? msg.message : 'Geometra server error'))
            return
          }
          if (msg.type === 'ack' && messageRequestId === requestId) {
            cleanup()
            resolve({
              status: session.updateRevision > startRevision ? 'updated' : 'acknowledged',
              timeoutMs,
              ...(msg.result !== undefined ? { result: msg.result } : {}),
            })
          }
          return
        }

        if (msg.type === 'error') {
          cleanup()
          reject(new Error(typeof msg.message === 'string' ? msg.message : 'Geometra server error'))
          return
        }
        if (msg.type === 'frame') {
          cleanup()
          resolve({ status: 'updated', timeoutMs })
        } else if (msg.type === 'patch' && session.layout) {
          cleanup()
          resolve({ status: 'updated', timeoutMs })
        } else if (msg.type === 'ack') {
          cleanup()
          resolve({
            status: 'acknowledged',
            timeoutMs,
            ...(msg.result !== undefined ? { result: msg.result } : {}),
          })
        }
      } catch { /* ignore */ }
    }

    // Expose timeout explicitly so action handlers can tell the user the result is ambiguous.
    const timeout = setTimeout(() => {
      cleanup()
      if (requestId && session.updateRevision > startRevision) {
        resolve({ status: 'updated', timeoutMs })
        return
      }
      resolve({ status: 'timed_out', timeoutMs })
    }, timeoutMs)

    function cleanup() {
      clearTimeout(timeout)
      session.ws.off('message', onMessage)
    }

    session.ws.on('message', onMessage)
  })
}

import { performance } from 'node:perf_hooks'
import type { Page } from 'playwright'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  attachFiles,
  clearFillLookupCache,
  createFillLookupCache,
  fillFields,
  pickListboxOption,
  resolveExistingFiles,
  setFieldChoice,
  setFieldText,
  selectNativeOption,
  setCheckedControl,
  wheelAt,
} from './dom-actions.js'
import { createCdpAxSessionManager } from './a11y-enrich.js'
import { coalescePatches, diffLayout } from './diff-layout.js'
import { extractGeometry, type ExtractGeometryTrace } from './extractor.js'
import type { ClientKeyMessage, GeometrySnapshot, LayoutSnapshot, ParsedClientMessage } from './types.js'
import {
  isClickEventMessage,
  isCompositionMessage,
  isFillFieldsMessage,
  isFileMessage,
  isKeyMessage,
  isListboxPickMessage,
  isNavigateMessage,
  isResizeMessage,
  isScreenshotMessage,
  isSetFieldChoiceMessage,
  isSetFieldTextMessage,
  isSetCheckedMessage,
  isSelectOptionMessage,
  isWheelMessage,
  PROXY_PROTOCOL_VERSION,
} from './types.js'

const DOM_OBSERVER_BINDINGS = new WeakSet<Page>()

async function bindDomObserverBridge(page: Page, scheduleExtract: () => void): Promise<void> {
  if (DOM_OBSERVER_BINDINGS.has(page)) return
  await page.exposeFunction('__geometraProxyNotify', () => {
    scheduleExtract()
  })
  await page.addInitScript(() => {
    const w = window as unknown as {
      __geometraProxyNotify?: () => Promise<void>
      __geometraProxyObserverBootstrapped?: boolean
      __geometraProxyObserverInstalled?: boolean
    }
    if (w.__geometraProxyObserverBootstrapped) return

    const install = () => {
      if (w.__geometraProxyObserverInstalled) return
      const root = document.documentElement
      if (!root) return
      const observer = new MutationObserver(() => {
        void w.__geometraProxyNotify?.()
      })
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      })
      w.__geometraProxyObserverInstalled = true
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true })
    } else {
      install()
    }

    w.__geometraProxyObserverBootstrapped = true
  })
  DOM_OBSERVER_BINDINGS.add(page)
}

interface PendingInputAck {
  ws: WebSocket
  requestId?: string
  result?: unknown
}

function isProtocolCompatible(peerVersion: number | undefined): boolean {
  if (peerVersion === undefined) return true
  if (typeof peerVersion !== 'number' || !Number.isFinite(peerVersion)) return false
  return peerVersion <= PROXY_PROTOCOL_VERSION
}

function cloneLayout(layout: LayoutSnapshot): LayoutSnapshot {
  return structuredClone(layout)
}

function normalizePlaywrightKey(key: string): string {
  if (key === ' ') return 'Space'
  return key
}

async function applyKeyPhase(page: Page, msg: ClientKeyMessage): Promise<void> {
  if (msg.eventType !== 'onKeyDown' && msg.eventType !== 'onKeyUp') return
  const k = normalizePlaywrightKey(msg.key)
  /**
   * `geometra_key` sends a single `onKeyDown` with `code === key` (e.g. Enter).
   * `geometra_type` sends `onKeyDown` / `onKeyUp` pairs with `code` like `KeyA` and `key` like `a`.
   */
  const singleShotSpecial = msg.code === msg.key

  if (msg.eventType === 'onKeyDown') {
    if (msg.shiftKey) await page.keyboard.down('Shift')
    if (msg.ctrlKey) await page.keyboard.down('Control')
    if (msg.metaKey) await page.keyboard.down('Meta')
    if (msg.altKey) await page.keyboard.down('Alt')
    if (singleShotSpecial) {
      await page.keyboard.press(k)
      if (msg.altKey) await page.keyboard.up('Alt')
      if (msg.metaKey) await page.keyboard.up('Meta')
      if (msg.ctrlKey) await page.keyboard.up('Control')
      if (msg.shiftKey) await page.keyboard.up('Shift')
    } else {
      await page.keyboard.down(k)
    }
    return
  }

  if (singleShotSpecial) {
    return
  }
  await page.keyboard.up(k)
  if (msg.altKey) await page.keyboard.up('Alt')
  if (msg.metaKey) await page.keyboard.up('Meta')
  if (msg.ctrlKey) await page.keyboard.up('Control')
  if (msg.shiftKey) await page.keyboard.up('Shift')
}

async function handleClientMessage(
  waitForPage: () => Promise<Page>,
  ws: WebSocket,
  raw: unknown,
  fieldLookupCache: ReturnType<typeof createFillLookupCache>,
  waitForBeforeInput: () => Promise<void>,
  onViewportOrInput: (kind: 'resize' | 'input', requestId?: string, result?: unknown) => void,
  onHandlerError: (err: unknown) => void,
): Promise<void> {
  let msg: ParsedClientMessage
  try {
    msg = JSON.parse(String(raw)) as ParsedClientMessage
  } catch {
    return
  }
  if (typeof msg !== 'object' || msg === null || typeof msg.type !== 'string') return
  const pv = 'protocolVersion' in msg ? msg.protocolVersion : undefined
  const requestId = typeof (msg as { requestId?: unknown }).requestId === 'string'
    ? (msg as { requestId?: string }).requestId
    : undefined
  if (!isProtocolCompatible(pv)) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: `Client protocol ${String(pv)} is newer than proxy protocol ${PROXY_PROTOCOL_VERSION}`,
        ...(requestId ? { requestId } : {}),
        protocolVersion: PROXY_PROTOCOL_VERSION,
      }),
    )
    return
  }

  const wireError = (message: string) => {
    ws.send(JSON.stringify({
      type: 'error',
      message,
      ...(requestId ? { requestId } : {}),
      protocolVersion: PROXY_PROTOCOL_VERSION,
    }))
  }

  try {
    const page = await waitForPage()
    if (isResizeMessage(msg)) {
      const w = Math.max(1, Math.floor(msg.width))
      const h = Math.max(1, Math.floor(msg.height))
      await page.setViewportSize({ width: w, height: h })
      onViewportOrInput('resize', requestId)
      return
    }

    await waitForBeforeInput()

    if (isNavigateMessage(msg)) {
      clearFillLookupCache(fieldLookupCache)
      await page.goto(msg.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      onViewportOrInput('input', requestId, { pageUrl: page.url() })
      return
    }

    if (isClickEventMessage(msg)) {
      const x = msg.x
      const y = msg.y
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        await page.mouse.click(x, y)
        onViewportOrInput('input', requestId)
      }
      return
    }

    if (isKeyMessage(msg)) {
      await applyKeyPhase(page, msg)
      onViewportOrInput('input', requestId)
      return
    }

    if (isCompositionMessage(msg)) {
      const data = typeof msg.data === 'string' ? msg.data : ''
      if (msg.eventType === 'onCompositionUpdate' || msg.eventType === 'onCompositionEnd') {
        await page.keyboard.insertText(data)
        onViewportOrInput('input', requestId)
      }
      return
    }

    if (isFileMessage(msg)) {
      const paths = resolveExistingFiles(msg.paths)
      await attachFiles(page, paths, {
        clickX: msg.x,
        clickY: msg.y,
        fieldId: msg.fieldId,
        fieldLabel: msg.fieldLabel,
        exact: msg.exact,
        strategy: msg.strategy,
        dropX: msg.dropX,
        dropY: msg.dropY,
      })
      onViewportOrInput('input', requestId)
      return
    }

    if (isSetFieldTextMessage(msg)) {
      await setFieldText(page, msg.fieldLabel, msg.value, {
        fieldId: msg.fieldId,
        exact: msg.exact,
        cache: fieldLookupCache,
      })
      onViewportOrInput('input', requestId)
      return
    }

    if (isSetFieldChoiceMessage(msg)) {
      await setFieldChoice(page, msg.fieldLabel, msg.value, {
        fieldId: msg.fieldId,
        exact: msg.exact,
        query: msg.query,
        choiceType: msg.choiceType,
        cache: fieldLookupCache,
      })
      onViewportOrInput('input', requestId)
      return
    }

    if (isFillFieldsMessage(msg)) {
      await fillFields(page, msg.fields, fieldLookupCache)
      const result = await fillFieldsAckResult(page)
      onViewportOrInput('input', requestId, result)
      return
    }

    if (isListboxPickMessage(msg)) {
      await pickListboxOption(page, msg.label, {
        exact: msg.exact,
        openX: msg.openX,
        openY: msg.openY,
        fieldId: msg.fieldId,
        fieldLabel: msg.fieldLabel,
        query: msg.query,
        cache: fieldLookupCache,
      })
      onViewportOrInput('input', requestId)
      return
    }

    if (isSelectOptionMessage(msg)) {
      await selectNativeOption(page, msg.x, msg.y, {
        value: msg.value,
        label: msg.label,
        index: msg.index,
      })
      onViewportOrInput('input', requestId)
      return
    }

    if (isSetCheckedMessage(msg)) {
      await setCheckedControl(page, msg.label, {
        checked: msg.checked,
        exact: msg.exact,
        controlType: msg.controlType,
      })
      onViewportOrInput('input', requestId)
      return
    }

    if (isWheelMessage(msg)) {
      const dx = typeof msg.deltaX === 'number' && Number.isFinite(msg.deltaX) ? msg.deltaX : 0
      const dy = typeof msg.deltaY === 'number' && Number.isFinite(msg.deltaY) ? msg.deltaY : 0
      const x = typeof msg.x === 'number' && Number.isFinite(msg.x) ? msg.x : undefined
      const y = typeof msg.y === 'number' && Number.isFinite(msg.y) ? msg.y : undefined
      await wheelAt(page, dx, dy, x, y)
      onViewportOrInput('input', requestId)
      return
    }

    if (isScreenshotMessage(msg)) {
      const buffer = await page.screenshot({ type: 'png', fullPage: false })
      const base64 = buffer.toString('base64')
      onViewportOrInput('input', requestId, { screenshot: base64 })
    }
  } catch (err) {
    onHandlerError(err)
    wireError(err instanceof Error ? err.message : String(err))
  }
}

async function fillFieldsAckResult(page: Page): Promise<Record<string, unknown>> {
  const frames = page.frames()
  const [invalidCount, alertCount, dialogCount, busyCount] = await Promise.all([
    countAcrossFrames(frames, ':invalid'),
    countAcrossFrames(frames, '[role="alert"], [role="alertdialog"]'),
    countAcrossFrames(frames, '[role="dialog"], [role="alertdialog"]'),
    countAcrossFrames(frames, '[aria-busy="true"]'),
  ])

  let invalidFields: Array<{ name?: string; error?: string }> | undefined
  if (invalidCount > 0) {
    invalidFields = await collectInvalidFieldErrors(frames)
  }

  return {
    pageUrl: page.url(),
    invalidCount,
    alertCount,
    dialogCount,
    busyCount,
    ...(invalidFields && invalidFields.length > 0 ? { invalidFields } : {}),
  }
}

async function collectInvalidFieldErrors(
  frames: ReturnType<Page['frames']>,
): Promise<Array<{ name?: string; error?: string }>> {
  const results = await Promise.all(
    frames.map(frame =>
      frame.evaluate(() => {
        const fields: Array<{ name?: string; error?: string }> = []
        const invalidEls = document.querySelectorAll(':invalid')
        for (const el of invalidEls) {
          if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue
          const label =
            el.getAttribute('aria-label')?.trim() ||
            (el.labels && el.labels.length > 0 ? el.labels[0]?.textContent?.trim() : undefined) ||
            el.getAttribute('placeholder')?.trim() ||
            el.name ||
            undefined
          const errorId = el.getAttribute('aria-errormessage')
          const errorEl = errorId ? document.getElementById(errorId) : null
          const error =
            errorEl?.textContent?.trim() ||
            el.validationMessage ||
            undefined
          if (label || error) fields.push({ ...(label ? { name: label } : {}), ...(error ? { error } : {}) })
        }
        return fields.slice(0, 10)
      }).catch(() => [] as Array<{ name?: string; error?: string }>),
    ),
  )
  return results.flat().slice(0, 10)
}

async function countAcrossFrames(frames: ReturnType<Page['frames']>, selector: string): Promise<number> {
  const counts = await Promise.all(
    frames.map(frame => frame.locator(selector).count().catch(() => 0)),
  )
  return counts.reduce((sum, count) => sum + count, 0)
}

export interface GeometryWsHub {
  /** Run extraction and broadcast (debounced observer calls this). */
  scheduleExtract: () => void
  /** Wait until any in-flight extract + broadcast finishes. */
  flushExtract: () => Promise<void>
  getTrace: () => GeometryWsTrace
  close: () => Promise<void>
}

export interface GeometryExtractRecoveryTrace {
  attemptCount: number
  domContentLoadedWaitMs: number
  loadWaitMs: number
}

export interface GeometryFirstExtractTrace {
  beforeInputMs: number
  extractMs: number
  broadcastMs: number
  totalMs: number
  changed: boolean
  extractor: ExtractGeometryTrace
  recovery: GeometryExtractRecoveryTrace
}

export interface GeometryWsTrace {
  extractCount: number
  firstExtract?: GeometryFirstExtractTrace
}

export function startGeometryWebSocket(options: {
  port: number
  page: Page | Promise<Page>
  /** DOM mutation debounce (ms). */
  debounceMs?: number
  /** Optional promise that must resolve before extracts or input actions run. */
  beforeInput?: Promise<unknown>
  onListening?: (port: number) => void
  onError?: (err: unknown) => void
}): GeometryWsHub {
  const debounceMs = options.debounceMs ?? 50
  const clients = new Set<WebSocket>()
  const wss = new WebSocketServer({ port: options.port })
  const axSessionManager = createCdpAxSessionManager()

  let prevLayout: LayoutSnapshot | null = null
  let prevTreeJson: string | null = null

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let extracting = false
  let pendingExtract = false
  let actionQueue: Promise<void> = Promise.resolve()
  let pendingInputAcks: PendingInputAck[] = []
  const fieldLookupCache = createFillLookupCache()
  const beforeInput = options.beforeInput?.then(() => undefined)
  const trace: GeometryWsTrace = { extractCount: 0 }
  const pagePromise = Promise.resolve(options.page)

  async function waitForBeforeInput(): Promise<void> {
    if (!beforeInput) return
    await beforeInput
  }

  async function waitForPage(): Promise<Page> {
    return await pagePromise
  }

  void pagePromise.then(page => {
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        clearFillLookupCache(fieldLookupCache)
      }
    })
  }).catch(err => options.onError?.(err))

  function sendPendingInputAcks() {
    if (pendingInputAcks.length === 0) return
    const pending = pendingInputAcks
    pendingInputAcks = []
    for (const { ws, requestId, result } of pending) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'ack',
          ...(requestId ? { requestId } : {}),
          ...(result !== undefined ? { result } : {}),
          protocolVersion: PROXY_PROTOCOL_VERSION,
        }))
      }
    }
  }

  function sendPendingInputErrors(message: string) {
    if (pendingInputAcks.length === 0) {
      const errText = JSON.stringify({ type: 'error', message, protocolVersion: PROXY_PROTOCOL_VERSION })
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) ws.send(errText)
      }
      return
    }

    const pending = pendingInputAcks
    pendingInputAcks = []
    for (const { ws, requestId } of pending) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message,
          ...(requestId ? { requestId } : {}),
          protocolVersion: PROXY_PROTOCOL_VERSION,
        }))
      }
    }
  }

  function broadcastSnapshot(snap: GeometrySnapshot): boolean {
    const treeChanged = prevTreeJson !== snap.treeJson

    let outbound:
      | { type: 'frame'; layout: LayoutSnapshot; tree: GeometrySnapshot['tree']; protocolVersion: number }
      | { type: 'patch'; patches: ReturnType<typeof diffLayout>; protocolVersion: number }

    if (!prevLayout || treeChanged) {
      outbound = {
        type: 'frame',
        layout: snap.layout,
        tree: snap.tree,
        protocolVersion: PROXY_PROTOCOL_VERSION,
      }
      prevLayout = cloneLayout(snap.layout)
      prevTreeJson = snap.treeJson
    } else {
      const rawPatches = diffLayout(prevLayout, snap.layout)
      const patches = coalescePatches(rawPatches)
      if (patches.length === 0) {
        return false
      }
      if (patches.length > 20) {
        outbound = {
          type: 'frame',
          layout: snap.layout,
          tree: snap.tree,
          protocolVersion: PROXY_PROTOCOL_VERSION,
        }
      } else {
        outbound = { type: 'patch', patches, protocolVersion: PROXY_PROTOCOL_VERSION }
      }
      prevLayout = cloneLayout(snap.layout)
      prevTreeJson = snap.treeJson
    }

    const text = JSON.stringify(outbound)
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(text)
      }
    }
    return true
  }

  async function runExtract(): Promise<boolean> {
    const runStartedAt = performance.now()
    const beforeInputStartedAt = performance.now()
    try {
      await waitForBeforeInput()
      const beforeInputMs = performance.now() - beforeInputStartedAt
      const extractorTrace: ExtractGeometryTrace = {}
      const recoveryTrace: GeometryExtractRecoveryTrace = {
        attemptCount: 0,
        domContentLoadedWaitMs: 0,
        loadWaitMs: 0,
      }
      const page = await waitForPage()
      const extractStartedAt = performance.now()
      const snap = await extractGeometryWithRecovery(page, axSessionManager, extractorTrace, recoveryTrace)
      const extractMs = performance.now() - extractStartedAt
      const broadcastStartedAt = performance.now()
      const changed = broadcastSnapshot(snap)
      const broadcastMs = performance.now() - broadcastStartedAt
      trace.extractCount += 1
      if (!trace.firstExtract) {
        trace.firstExtract = {
          beforeInputMs,
          extractMs,
          broadcastMs,
          totalMs: performance.now() - runStartedAt,
          changed,
          extractor: { ...extractorTrace },
          recovery: { ...recoveryTrace },
        }
      }
      return changed
    } catch (err) {
      options.onError?.(err)
      sendPendingInputErrors(err instanceof Error ? err.message : String(err))
      return false
    }
  }

  async function runExtractQueued(): Promise<boolean> {
    if (extracting) {
      pendingExtract = true
      return false
    }
    extracting = true
    let changed = false
    try {
      changed = (await runExtract()) || changed
      while (pendingExtract) {
        pendingExtract = false
        changed = (await runExtract()) || changed
      }
    } finally {
      extracting = false
    }
    return changed
  }

  function scheduleExtract() {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void runExtractQueued()
        .then(() => {
          sendPendingInputAcks()
        })
        .catch(err => options.onError?.(err))
    }, debounceMs)
  }

  wss.on('listening', () => {
    const addr = wss.address()
    const p = typeof addr === 'object' && addr ? addr.port : options.port
    options.onListening?.(p)
  })

  wss.on('error', err => {
    options.onError?.(err)
  })

  wss.on('connection', (ws) => {
    clients.add(ws)
    if (prevLayout && prevTreeJson !== null) {
      const snap: GeometrySnapshot = {
        layout: prevLayout,
        tree: JSON.parse(prevTreeJson) as GeometrySnapshot['tree'],
        treeJson: prevTreeJson,
      }
      const text = JSON.stringify({
        type: 'frame',
        layout: snap.layout,
        tree: snap.tree,
        protocolVersion: PROXY_PROTOCOL_VERSION,
      })
      if (ws.readyState === ws.OPEN) ws.send(text)
    }
    ws.on('message', (raw) => {
      actionQueue = actionQueue
        .then(() =>
          handleClientMessage(
            waitForPage,
            ws,
            raw,
            fieldLookupCache,
            waitForBeforeInput,
            (kind, requestId, result) => {
              if (kind === 'resize') {
                void runExtractQueued()
              } else {
                pendingInputAcks.push({ ws, ...(requestId ? { requestId } : {}), ...(result !== undefined ? { result } : {}) })
                scheduleExtract()
              }
            },
            err => options.onError?.(err),
          ),
        )
        .catch(err => options.onError?.(err))
    })
    ws.on('close', () => {
      clients.delete(ws)
      pendingInputAcks = pendingInputAcks.filter(entry => entry.ws !== ws)
    })
  })

  return {
    scheduleExtract,
    flushExtract: async () => {
      await actionQueue.catch(() => {})
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      await runExtractQueued()
      sendPendingInputAcks()
    },
    getTrace: () => structuredClone(trace),
    close: () =>
      new Promise((resolve, reject) => {
        void axSessionManager.close().finally(() => {
          for (const ws of clients) {
            ws.close()
          }
          clients.clear()
          wss.close(err => (err ? reject(err) : resolve()))
        })
      }),
  }
}

export async function primeDomObserver(page: Page, scheduleExtract: () => void): Promise<void> {
  await bindDomObserverBridge(page, scheduleExtract)
}

export async function installDomObserver(page: Page, scheduleExtract: () => void): Promise<void> {
  await bindDomObserverBridge(page, scheduleExtract)
  await page.evaluate(() => {
    const w = window as unknown as {
      __geometraProxyNotify?: () => Promise<void>
      __geometraProxyObserverInstalled?: boolean
    }
    if (w.__geometraProxyObserverInstalled) return
    const observer = new MutationObserver(() => {
      void w.__geometraProxyNotify?.()
    })
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
    w.__geometraProxyObserverInstalled = true
  })
}

function isNavigationTransitionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /Execution context was destroyed|Cannot find context with specified id|Frame was detached|navigation/i.test(message)
}

async function extractGeometryWithRecovery(
  page: Page,
  axSessionManager: ReturnType<typeof createCdpAxSessionManager>,
  extractTrace?: ExtractGeometryTrace,
  recoveryTrace?: GeometryExtractRecoveryTrace,
): Promise<GeometrySnapshot> {
  let lastNavigationError: Error | null = null
  let domContentLoadedWaitMs = 0
  let loadWaitMs = 0

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (recoveryTrace) {
        recoveryTrace.attemptCount = attempt + 1
      }
      return await extractGeometry(page, { axSessionManager, trace: extractTrace })
    } catch (err) {
      if (page.isClosed() || !isNavigationTransitionError(err)) throw err
      lastNavigationError = err instanceof Error ? err : new Error(String(err))
      const domContentLoadedStartedAt = performance.now()
      await page.waitForLoadState('domcontentloaded', { timeout: 2500 }).catch(() => {})
      domContentLoadedWaitMs += performance.now() - domContentLoadedStartedAt
      const loadStartedAt = performance.now()
      await page.waitForLoadState('load', { timeout: 1000 }).catch(() => {})
      loadWaitMs += performance.now() - loadStartedAt
      if (recoveryTrace) {
        recoveryTrace.domContentLoadedWaitMs = domContentLoadedWaitMs
        recoveryTrace.loadWaitMs = loadWaitMs
      }
    }
  }

  const detail = lastNavigationError?.message ?? 'Navigation interrupted extraction'
  throw new Error(`Page navigation interrupted extraction. Wait for the next frame or retry after the new route stabilizes. ${detail}`)
}

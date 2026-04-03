import type { ComputedLayout } from 'textura'
import type { Renderer, UIElement } from '@geometra/core'
import { decodeBinaryFrameJson } from './binary-frame.js'

const PROTOCOL_VERSION = 1

/** Keep in sync with `CLOSE_AUTH_FAILED` in `@geometra/server` (`protocol.ts`). */
const WS_CLOSE_AUTH_FAILED = 4001

interface ServerFrame {
  type: 'frame'
  layout: ComputedLayout
  tree: UIElement
  protocolVersion?: number
}

interface ServerPatch {
  type: 'patch'
  patches: Array<{
    path: number[]
    x?: number
    y?: number
    width?: number
    height?: number
  }>
  protocolVersion?: number
}

interface ServerError {
  type: 'error'
  message: string
  protocolVersion?: number
}

type ServerMessage = ServerFrame | ServerPatch | ServerError

export interface ServerMessageDecodeMeta {
  decodeMs: number
  encoding?: 'json' | 'binary'
  bytesReceived?: number
}

export interface ClientFrameMetrics {
  messageType: ServerMessage['type']
  decodeMs: number
  applyMs: number
  renderMs: number
  patchCount?: number
  encoding?: 'json' | 'binary'
  bytesReceived?: number
}

interface ClientStateShape {
  layout: ComputedLayout | null
  tree: UIElement | null
}

export interface TexturaClientOptions {
  /** WebSocket URL to connect to. Default: 'ws://localhost:3100'. */
  url?: string
  /** The renderer to paint with. */
  renderer: Renderer
  /** Optional canvas element for forwarding pointer events. */
  canvas?: HTMLCanvasElement
  /** Capture keyboard on canvas/document and forward to server. Default: true when canvas provided. */
  forwardKeyboard?: boolean
  /** Capture IME composition events and forward to server. Default: true when canvas provided. */
  forwardComposition?: boolean
  /** Keyboard event target. Default: canvas, else document. */
  keyboardTarget?: HTMLElement | Document
  /** Forward resize events to server. Default: true when canvas provided. */
  forwardResize?: boolean
  /** Resize event target. Default: window. */
  resizeTarget?: Window
  /** Called on WebSocket or message parsing errors. */
  onError?: (error: unknown) => void
  /** Called when the WebSocket closes (any code). */
  onClose?: (event: CloseEvent) => void
  /** Optional frame-budget telemetry hook per processed server message. */
  onFrameMetrics?: (metrics: ClientFrameMetrics) => void
  /** Enable automatic reconnection on disconnect. Default: true. */
  reconnect?: boolean
  /**
   * Negotiate optional binary JSON envelopes for server→client frames (same JSON payload as text).
   * Requires `resize` with `capabilities.binaryFraming` (sent automatically when true).
   */
  binaryFraming?: boolean
}

export interface TexturaClient {
  /** Current layout (if received). */
  layout: ComputedLayout | null
  /** Current tree (if received). */
  tree: UIElement | null
  /** Disconnect from server (no reconnect). */
  close(): void
}

function applyPatches(layout: ComputedLayout, patches: ServerPatch['patches']): void {
  for (const patch of patches) {
    let node = layout
    for (const idx of patch.path) {
      const child = node.children[idx]
      if (!child) break
      node = child
    }
    if (patch.x !== undefined) node.x = patch.x
    if (patch.y !== undefined) node.y = patch.y
    if (patch.width !== undefined) node.width = patch.width
    if (patch.height !== undefined) node.height = patch.height
  }
}

export function applyServerMessage(
  state: ClientStateShape,
  renderer: Renderer,
  msg: ServerMessage,
  onError?: (error: unknown) => void,
  onMetrics?: (metrics: ClientFrameMetrics) => void,
  decodeMeta: ServerMessageDecodeMeta = { decodeMs: 0 },
): void {
  const applyStart = performance.now()
  let renderMs = 0
  let didRender = false
  if (msg.protocolVersion && msg.protocolVersion > PROTOCOL_VERSION) {
    onError?.(
      new Error(
        `Server protocol ${msg.protocolVersion} is newer than client protocol ${PROTOCOL_VERSION}`,
      ),
    )
    return
  }
  if (msg.type === 'frame') {
    state.layout = msg.layout
    state.tree = msg.tree
    const renderStart = performance.now()
    renderer.render(msg.layout, msg.tree)
    renderMs = performance.now() - renderStart
    didRender = true
  } else if (msg.type === 'patch' && state.layout && state.tree) {
    applyPatches(state.layout, msg.patches)
    const renderStart = performance.now()
    renderer.render(state.layout, state.tree)
    renderMs = performance.now() - renderStart
    didRender = true
  } else if (msg.type === 'error') {
    onError?.(new Error(msg.message))
  }
  const applyMs = performance.now() - applyStart
  onMetrics?.({
    messageType: msg.type,
    decodeMs: decodeMeta.decodeMs,
    applyMs,
    renderMs: didRender ? renderMs : 0,
    patchCount: msg.type === 'patch' ? msg.patches.length : undefined,
    encoding: decodeMeta.encoding,
    bytesReceived: decodeMeta.bytesReceived,
  })
}

/**
 * Connect to a Geometra server and render received geometry.
 *
 * The client is a thin paint layer — all layout computation happens server-side.
 * Pointer events on the canvas are forwarded to the server for hit-testing.
 * Automatically reconnects on disconnect with exponential backoff.
 */
export function createClient(options: TexturaClientOptions): TexturaClient {
  const url = options.url ?? 'ws://localhost:3100'
  const { renderer, canvas, onError, onFrameMetrics } = options
  const userWantsReconnect = options.reconnect !== false
  let allowReconnect = userWantsReconnect

  let ws: WebSocket
  let closed = false
  let retryCount = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const handlers: Array<[EventTarget, string, EventListener]> = []

  const state: TexturaClient = {
    layout: null,
    tree: null,
    close() {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      ws.close()
      cleanup()
    },
  }

  function connect() {
    ws = new WebSocket(url)
    if (options.binaryFraming) {
      ws.binaryType = 'arraybuffer'
    }

    ws.addEventListener('open', () => {
      retryCount = 0
      if (canvas && (options.forwardResize ?? true)) {
        const payload: Record<string, unknown> = {
          type: 'resize',
          width: Math.max(1, Math.round(canvas.clientWidth || canvas.width)),
          height: Math.max(1, Math.round(canvas.clientHeight || canvas.height)),
          protocolVersion: PROTOCOL_VERSION,
        }
        if (options.binaryFraming) {
          payload.capabilities = { binaryFraming: true }
        }
        ws.send(JSON.stringify(payload))
      }
    })

    ws.addEventListener('message', (event) => {
      try {
        const parseStart = performance.now()
        let msg: ServerMessage
        let decodeMeta: ServerMessageDecodeMeta
        if (typeof event.data === 'string') {
          const text = event.data
          msg = JSON.parse(text) as ServerMessage
          decodeMeta = {
            decodeMs: performance.now() - parseStart,
            encoding: 'json',
            bytesReceived: new TextEncoder().encode(text).length,
          }
        } else {
          const buf = event.data as ArrayBuffer
          const json = decodeBinaryFrameJson(buf)
          msg = JSON.parse(json) as ServerMessage
          decodeMeta = {
            decodeMs: performance.now() - parseStart,
            encoding: 'binary',
            bytesReceived: buf.byteLength,
          }
        }
        applyServerMessage(state, renderer, msg, onError, onFrameMetrics, decodeMeta)
      } catch (err) {
        onError?.(err)
      }
    })

    ws.addEventListener('error', (event) => {
      onError?.(event)
    })

    ws.addEventListener('close', (event) => {
      options.onClose?.(event as CloseEvent)
      if ((event as CloseEvent).code === WS_CLOSE_AUTH_FAILED) {
        allowReconnect = false
      }
      if (!closed && allowReconnect) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
        retryCount++
        retryTimer = setTimeout(connect, delay)
      }
    })
  }

  const sendEvent = (eventType: string, e: MouseEvent) => {
    if (ws.readyState !== WebSocket.OPEN) return
    const rect = canvas?.getBoundingClientRect()
    const x = rect ? e.clientX - rect.left : e.clientX
    const y = rect ? e.clientY - rect.top : e.clientY
    ws.send(JSON.stringify({ type: 'event', eventType, x, y, protocolVersion: PROTOCOL_VERSION }))
  }

  const sendKeyEvent = (eventType: 'onKeyDown' | 'onKeyUp', e: KeyboardEvent) => {
    if (ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({
      type: 'key',
      eventType,
      key: e.key,
      code: e.code,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      protocolVersion: PROTOCOL_VERSION,
    }))
  }

  const sendCompositionEvent = (
    eventType: 'onCompositionStart' | 'onCompositionUpdate' | 'onCompositionEnd',
    e: CompositionEvent,
  ) => {
    if (ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({
      type: 'composition',
      eventType,
      data: e.data ?? '',
      protocolVersion: PROTOCOL_VERSION,
    }))
  }

  const sendResize = () => {
    if (!canvas || ws.readyState !== WebSocket.OPEN) return
    const payload: Record<string, unknown> = {
      type: 'resize',
      width: Math.max(1, Math.round(canvas.clientWidth || canvas.width)),
      height: Math.max(1, Math.round(canvas.clientHeight || canvas.height)),
      protocolVersion: PROTOCOL_VERSION,
    }
    if (options.binaryFraming) {
      payload.capabilities = { binaryFraming: true }
    }
    ws.send(JSON.stringify(payload))
  }

  if (canvas) {
    const onClick = (e: MouseEvent) => sendEvent('onClick', e)
    const onPointerDown = (e: MouseEvent) => sendEvent('onPointerDown', e)
    const onPointerUp = (e: MouseEvent) => sendEvent('onPointerUp', e)
    const onPointerMove = (e: MouseEvent) => sendEvent('onPointerMove', e)

    canvas.addEventListener('click', onClick)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointermove', onPointerMove)

    handlers.push(
      [canvas, 'click', onClick as EventListener],
      [canvas, 'pointerdown', onPointerDown as EventListener],
      [canvas, 'pointerup', onPointerUp as EventListener],
      [canvas, 'pointermove', onPointerMove as EventListener],
    )
  }

  const forwardKeyboard = options.forwardKeyboard ?? !!canvas
  const keyboardTarget = options.keyboardTarget ?? canvas ?? document
  if (forwardKeyboard) {
    if (keyboardTarget instanceof HTMLElement && !keyboardTarget.hasAttribute('tabindex')) {
      keyboardTarget.setAttribute('tabindex', '0')
    }
    const onKeyDown = (e: KeyboardEvent) => sendKeyEvent('onKeyDown', e)
    const onKeyUp = (e: KeyboardEvent) => sendKeyEvent('onKeyUp', e)
    keyboardTarget.addEventListener('keydown', onKeyDown as EventListener)
    keyboardTarget.addEventListener('keyup', onKeyUp as EventListener)
    handlers.push(
      [keyboardTarget, 'keydown', onKeyDown as EventListener],
      [keyboardTarget, 'keyup', onKeyUp as EventListener],
    )
  }

  const forwardComposition = options.forwardComposition ?? !!canvas
  if (forwardComposition) {
    if (keyboardTarget instanceof HTMLElement && !keyboardTarget.hasAttribute('tabindex')) {
      keyboardTarget.setAttribute('tabindex', '0')
    }
    const onCompositionStart = (e: CompositionEvent) => sendCompositionEvent('onCompositionStart', e)
    const onCompositionUpdate = (e: CompositionEvent) => sendCompositionEvent('onCompositionUpdate', e)
    const onCompositionEnd = (e: CompositionEvent) => sendCompositionEvent('onCompositionEnd', e)
    keyboardTarget.addEventListener('compositionstart', onCompositionStart as EventListener)
    keyboardTarget.addEventListener('compositionupdate', onCompositionUpdate as EventListener)
    keyboardTarget.addEventListener('compositionend', onCompositionEnd as EventListener)
    handlers.push(
      [keyboardTarget, 'compositionstart', onCompositionStart as EventListener],
      [keyboardTarget, 'compositionupdate', onCompositionUpdate as EventListener],
      [keyboardTarget, 'compositionend', onCompositionEnd as EventListener],
    )
  }

  const forwardResize = options.forwardResize ?? !!canvas
  if (forwardResize && canvas) {
    const target = options.resizeTarget ?? window
    const onResize = () => sendResize()
    target.addEventListener('resize', onResize as EventListener)
    handlers.push([target, 'resize', onResize as EventListener])
  }

  function cleanup() {
    for (const [target, event, handler] of handlers) {
      target.removeEventListener(event, handler)
    }
    renderer.destroy()
  }

  connect()

  return state
}

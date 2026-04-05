import type { ComputedLayout } from 'textura'
import { layoutBoundsAreFinite, type Renderer, type UIElement } from '@geometra/core'
import { decodeBinaryFrameJson, type BinaryFrameBytes } from './binary-frame.js'

function asBinaryFrameBytes(data: unknown): BinaryFrameBytes {
  if (data instanceof ArrayBuffer) return data
  if (typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer) {
    return data
  }
  if (ArrayBuffer.isView(data)) {
    return data
  }
  throw new Error(
    'WebSocket binary message is not ArrayBuffer, SharedArrayBuffer, or ArrayBufferView (createClient sets binaryType to "arraybuffer"; unexpected Blob or other type).',
  )
}

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

interface ServerData {
  type: 'data'
  channel: string
  payload: unknown
  protocolVersion?: number
}

type ServerMessage = ServerFrame | ServerPatch | ServerError | ServerData

/**
 * JSON-serializable plain data (no Date, Map, undefined in objects, etc.).
 * Rejects cyclic object graphs (including `a.push(a)` on arrays) so corrupt server payloads cannot blow the stack;
 * shared acyclic subgraphs referenced from multiple paths remain valid, matching `JSON.stringify` behavior.
 */
function isJsonSerializableValue(v: unknown, visiting: Set<object> = new Set()): boolean {
  if (v === null) return true
  const t = typeof v
  if (t === 'string' || t === 'number' || t === 'boolean') return true
  if (t === 'bigint' || t === 'undefined' || t === 'function' || t === 'symbol') return false
  if (Array.isArray(v)) {
    if (visiting.has(v)) return false
    visiting.add(v)
    try {
      return v.every(item => isJsonSerializableValue(item, visiting))
    } finally {
      visiting.delete(v)
    }
  }
  if (t === 'object') {
    if (Object.getPrototypeOf(v) !== Object.prototype) return false
    if (visiting.has(v as object)) return false
    visiting.add(v as object)
    try {
      for (const key of Object.keys(v as object)) {
        if (!isJsonSerializableValue((v as Record<string, unknown>)[key], visiting)) return false
      }
      return true
    } finally {
      visiting.delete(v as object)
    }
  }
  return false
}

/** Plain JSON object shape (`JSON.parse` yields `Object.prototype` only — rejects `Object.create(null)`, arrays, Dates, etc.). */
function isPlainLayoutTreeValue(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  return Object.getPrototypeOf(v) === Object.prototype
}

function isOptionalFiniteNumberField(record: Record<string, unknown>, key: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return true
  const v = record[key]
  return typeof v === 'number' && Number.isFinite(v)
}

/** Like {@link isOptionalFiniteNumberField} but requires `>= 0` when present (layout width/height). */
function isOptionalNonNegativeFiniteDimensionField(record: Record<string, unknown>, key: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return true
  const v = record[key]
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/** Each patch must be a plain object with an array `path` of non-negative integer indices. */
function isWellFormedPatchList(patches: unknown): boolean {
  if (!Array.isArray(patches)) return false
  for (const raw of patches) {
    if (!isPlainLayoutTreeValue(raw)) return false
    const patch = raw as Record<string, unknown>
    if (!Array.isArray(patch.path)) return false
    for (const step of patch.path) {
      if (
        typeof step !== 'number' ||
        !Number.isFinite(step) ||
        !Number.isInteger(step) ||
        step < 0
      ) {
        return false
      }
    }
    if (!isOptionalFiniteNumberField(patch, 'x')) return false
    if (!isOptionalFiniteNumberField(patch, 'y')) return false
    if (!isOptionalNonNegativeFiniteDimensionField(patch, 'width')) return false
    if (!isOptionalNonNegativeFiniteDimensionField(patch, 'height')) return false
  }
  return true
}

/** Root layout from the wire must carry an array `children` (matches Textura `ComputedLayout`). */
function layoutRootHasChildrenArray(layout: unknown): boolean {
  if (!isPlainLayoutTreeValue(layout)) return false
  const rec = layout as Record<string, unknown>
  return Array.isArray(rec.children)
}

/** Reject malformed payloads that JSON.parse can produce without throwing. */
function isWellFormedGeomV1Message(msg: Record<string, unknown>): boolean {
  const t = msg.type
  if (t === 'frame') {
    return layoutRootHasChildrenArray(msg.layout) && isPlainLayoutTreeValue(msg.tree)
  }
  if (t === 'patch') {
    return isWellFormedPatchList(msg.patches)
  }
  if (t === 'error') {
    return typeof msg.message === 'string'
  }
  if (t === 'data') {
    return (
      typeof msg.channel === 'string' &&
      msg.channel.trim().length > 0 &&
      isJsonSerializableValue(msg.payload)
    )
  }
  return false
}

/** Decode-phase timings and byte counts passed into {@link applyServerMessage} from the WebSocket layer. */
export interface ServerMessageDecodeMeta {
  /** Milliseconds spent parsing the wire payload (`JSON.parse` or binary GEOM v1 header + UTF-8 decode). */
  decodeMs: number
  /** Whether this message was received as a JSON string frame or a GEOM v1 binary envelope. */
  encoding?: 'json' | 'binary'
  /** Byte length of the raw `MessageEvent.data` when measured (text UTF-8 or binary buffer length). */
  bytesReceived?: number
}

/** Per-message frame budget: decode, state apply, and renderer work (see {@link TexturaClientOptions.onFrameMetrics}). */
export interface ClientFrameMetrics {
  /** Server message discriminant (`frame`, `patch`, `error`, or `data`). */
  messageType: ServerMessage['type']
  /** Same as {@link ServerMessageDecodeMeta.decodeMs} for this message. */
  decodeMs: number
  /** Milliseconds to merge the message into client state (patch walk, tree/layout assignment). */
  applyMs: number
  /** Milliseconds inside {@link Renderer.render} when a frame or patch triggered a paint; `0` for `error` / `data`. */
  renderMs: number
  /** Length of `patches` when `messageType` is `patch`; omitted otherwise. */
  patchCount?: number
  /** Same as {@link ServerMessageDecodeMeta.encoding} when provided by the transport. */
  encoding?: 'json' | 'binary'
  /** Same as {@link ServerMessageDecodeMeta.bytesReceived} when provided by the transport. */
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
   * Called for each server `data` message (same WebSocket as layout frames).
   * Pair with `GEOM_DATA_CHANNEL_TRACKER_SNAPSHOT` from `@geometra/client` or your own channel ids.
   */
  onData?: (channel: string, payload: unknown) => void
  /**
   * Negotiate optional binary JSON envelopes for server→client frames (same JSON payload as text).
   * Requires `resize` with `capabilities.binaryFraming` (sent automatically when true).
   * The client always sets `WebSocket.binaryType` to `"arraybuffer"` so binary GEOM envelopes decode
   * reliably even when this flag is false (e.g. mixed JSON text + binary fallback). String frames still
   * use `JSON.parse`; non-string `MessageEvent.data` is decoded as a GEOM v1 binary envelope.
   */
  binaryFraming?: boolean
}

export interface TexturaClient {
  /** Current layout (if received). */
  layout: ComputedLayout | null
  /** Current tree (if received). */
  tree: UIElement | null
  /** Disconnect from server (no reconnect). Idempotent — repeated calls are ignored. */
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

/**
 * Apply a parsed GEOM v1 server message to local client state and the renderer.
 *
 * Updates `state.layout` / `state.tree` on full frames, mutates the existing layout in place for
 * patches, and calls {@link Renderer.render} when a frame is applied or a patch runs against current
 * state. Patches received before the first frame are ignored (no state change, no render).
 *
 * A well-formed `patch` with an empty `patches` array still calls {@link Renderer.render} (no geometry
 * mutation, but a repaint hook for hosts that rely on render side effects).
 *
 * For `patch` messages, each entry walks `path` into `layout.children`; if an index is missing, the
 * walk stops and any `x` / `y` / `width` / `height` fields apply to that last resolved node (often the
 * root). This is intentional lenient behavior and does not call `onError`.
 *
 * When the payload is not a plain JSON object (including JSON array roots, which are `typeof` `"object"`,
 * and objects with a null or exotic prototype, which `JSON.parse` never produces),
 * or is missing a well-formed `type` (`frame` with object
 * `layout`/`tree`, `patch` with a `patches` array of objects that each include an integer `path` and
 * only finite numeric `x`/`y` and non-negative finite `width`/`height` when those fields are present,
 * `error` with string `message`, or `data` with non-empty string `channel` and JSON-serializable
 * `payload`), calls `onError` and returns
 * without mutating state or invoking `onMetrics`. Full `frame` messages additionally require root `layout`
 * to be a plain object with an array `children`, and root bounds that satisfy {@link layoutBoundsAreFinite}
 * (finite `x`/`y`, non-negative finite `width`/`height`).
 *
 * When `msg.protocolVersion` is omitted, no version check runs (message is treated as compatible).
 * When it is present but not a finite number, or is greater than the client’s supported version,
 * calls `onError` and returns without mutating state or invoking `onMetrics`.
 *
 * Well-formed `error` messages call `onError` with the server message and still invoke `onMetrics`
 * once with `messageType: 'error'` (no render; `renderMs` is zero).
 *
 * Well-formed `data` messages invoke `onData(channel, payload)` when provided, invoke `onMetrics` with
 * `messageType: 'data'`, and do not call `render` (`renderMs` is zero).
 *
 * @param state — Mutable `{ layout, tree }` (same fields as {@link TexturaClient}).
 * @param renderer — Receives `render` after successful frame or patch application.
 * @param msg — `frame`, `patch`, `error`, or `data` payload from the wire after JSON/binary decode.
 * @param onError — Malformed messages, invalid `frame` root bounds, protocol version mismatches, and
 * well-formed server `error` messages (those still invoke `onMetrics` once with `messageType: 'error'`).
 * @param onMetrics — Once per call when processing continues past the protocol guard; includes decode/apply/render timing.
 * @param decodeMeta — Optional timings and byte counts from the transport layer (binary vs JSON).
 * @param onData — Optional handler for `data` messages (namespaced side-channel JSON).
 */
export function applyServerMessage(
  state: ClientStateShape,
  renderer: Renderer,
  msg: ServerMessage,
  onError?: (error: unknown) => void,
  onMetrics?: (metrics: ClientFrameMetrics) => void,
  decodeMeta: ServerMessageDecodeMeta = { decodeMs: 0 },
  onData?: (channel: string, payload: unknown) => void,
): void {
  const applyStart = performance.now()
  let renderMs = 0
  let didRender = false
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) {
    onError?.(new Error('Invalid server message: expected a JSON object'))
    return
  }
  const record = msg as unknown as Record<string, unknown>
  const protocolVersion = record.protocolVersion as unknown
  if (protocolVersion !== undefined) {
    if (typeof protocolVersion !== 'number' || !Number.isFinite(protocolVersion)) {
      onError?.(
        new Error(
          'Invalid server message: protocolVersion must be a finite number when present',
        ),
      )
      return
    }
    if (protocolVersion > PROTOCOL_VERSION) {
      onError?.(
        new Error(
          `Server protocol ${protocolVersion} is newer than client protocol ${PROTOCOL_VERSION}`,
        ),
      )
      return
    }
  }
  if (!isWellFormedGeomV1Message(record)) {
    const t = record.type
    onError?.(
      new Error(
        `Invalid server message: expected type frame, patch, error, or data (channel+JSON payload); got ${String(t)}`,
      ),
    )
    return
  }
  if (msg.type === 'frame') {
    if (!layoutBoundsAreFinite(msg.layout)) {
      onError?.(
        new Error(
          'Invalid server message: frame root layout must have finite x/y and non-negative finite width/height',
        ),
      )
      return
    }
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
  } else if (msg.type === 'data') {
    onData?.(msg.channel, msg.payload)
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
 * With a `canvas`, pointer hits are forwarded as `event` messages for server-side hit-testing; keyboard,
 * IME composition, and `resize` forwarding default on and target the canvas (or {@link TexturaClientOptions.keyboardTarget} /
 * {@link TexturaClientOptions.resizeTarget} when set). Without a canvas, those forwarders stay off unless
 * you opt in explicitly on {@link TexturaClientOptions}.
 *
 * Server messages may arrive as JSON text WebSocket frames or GEOM v1 binary envelopes (same JSON
 * payload); see {@link TexturaClientOptions.binaryFraming} and {@link decodeBinaryFrameJson}. Use
 * {@link createHeadlessClient} when you only need wire state (`onData`, {@link TexturaClient.layout}) without
 * painting. For custom transports or tests, decode JSON yourself and call {@link applyServerMessage} with the
 * same {@link TexturaClientOptions.renderer} you would pass here.
 *
 * Reconnects after disconnect with exponential backoff unless {@link TexturaClientOptions.reconnect} is false.
 *
 * {@link TexturaClient.close} is idempotent: it stops reconnects, removes forwarded DOM listeners, closes the
 * socket, and invokes {@link Renderer.destroy} once — further calls are no-ops.
 */
export function createClient(options: TexturaClientOptions): TexturaClient {
  const url = options.url ?? 'ws://localhost:3100'
  const { renderer, canvas, onError, onFrameMetrics, onData } = options
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
      if (closed) return
      closed = true
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      ws.close()
      cleanup()
    },
  }

  function connect() {
    ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

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
          const bytes = asBinaryFrameBytes(event.data)
          const json = decodeBinaryFrameJson(bytes)
          msg = JSON.parse(json) as ServerMessage
          decodeMeta = {
            decodeMs: performance.now() - parseStart,
            encoding: 'binary',
            bytesReceived: bytes.byteLength,
          }
        }
        applyServerMessage(state, renderer, msg, onError, onFrameMetrics, decodeMeta, onData)
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

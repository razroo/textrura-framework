import type { ComputedLayout } from 'textura'
import type { Renderer, UIElement } from '@geometra/core'

const PROTOCOL_VERSION = 1

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

export interface TexturaClientOptions {
  /** WebSocket URL to connect to. Default: 'ws://localhost:3100'. */
  url?: string
  /** The renderer to paint with. */
  renderer: Renderer
  /** Optional canvas element for forwarding pointer events. */
  canvas?: HTMLCanvasElement
  /** Capture keyboard on canvas/document and forward to server. Default: true when canvas provided. */
  forwardKeyboard?: boolean
  /** Keyboard event target. Default: canvas, else document. */
  keyboardTarget?: HTMLElement | Document
  /** Called on WebSocket or message parsing errors. */
  onError?: (error: unknown) => void
  /** Enable automatic reconnection on disconnect. Default: true. */
  reconnect?: boolean
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

/**
 * Connect to a Geometra server and render received geometry.
 *
 * The client is a thin paint layer — all layout computation happens server-side.
 * Pointer events on the canvas are forwarded to the server for hit-testing.
 * Automatically reconnects on disconnect with exponential backoff.
 */
export function createClient(options: TexturaClientOptions): TexturaClient {
  const url = options.url ?? 'ws://localhost:3100'
  const { renderer, canvas, onError } = options
  const shouldReconnect = options.reconnect !== false

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

    ws.addEventListener('open', () => {
      retryCount = 0
    })

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as ServerMessage
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
          renderer.render(msg.layout, msg.tree)
        } else if (msg.type === 'patch' && state.layout && state.tree) {
          applyPatches(state.layout, msg.patches)
          renderer.render(state.layout, state.tree)
        } else if (msg.type === 'error') {
          onError?.(new Error(msg.message))
        }
      } catch (err) {
        onError?.(err)
      }
    })

    ws.addEventListener('error', (event) => {
      onError?.(event)
    })

    ws.addEventListener('close', () => {
      if (!closed && shouldReconnect) {
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
  if (forwardKeyboard) {
    const target = options.keyboardTarget ?? canvas ?? document
    if (target instanceof HTMLElement && !target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '0')
    }
    const onKeyDown = (e: KeyboardEvent) => sendKeyEvent('onKeyDown', e)
    const onKeyUp = (e: KeyboardEvent) => sendKeyEvent('onKeyUp', e)
    target.addEventListener('keydown', onKeyDown as EventListener)
    target.addEventListener('keyup', onKeyUp as EventListener)
    handlers.push(
      [target, 'keydown', onKeyDown as EventListener],
      [target, 'keyup', onKeyUp as EventListener],
    )
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

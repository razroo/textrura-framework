import type { ComputedLayout } from 'textura'
import type { Renderer, UIElement } from '@geometra/core'

interface ServerFrame {
  type: 'frame'
  layout: ComputedLayout
  tree: UIElement
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
}

type ServerMessage = ServerFrame | ServerPatch

export interface TexturaClientOptions {
  /** WebSocket URL to connect to. Default: 'ws://localhost:3100'. */
  url?: string
  /** The renderer to paint with. */
  renderer: Renderer
  /** Optional canvas element for forwarding pointer events. */
  canvas?: HTMLCanvasElement
}

export interface TexturaClient {
  /** Current layout (if received). */
  layout: ComputedLayout | null
  /** Current tree (if received). */
  tree: UIElement | null
  /** Disconnect from server. */
  close(): void
}

/** Apply patches to a computed layout tree (mutates in place). */
function applyPatches(
  layout: ComputedLayout,
  patches: ServerPatch['patches'],
): void {
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
 * Connect to a Textura server and render received geometry.
 *
 * The client is a thin paint layer — all layout computation happens server-side.
 * Pointer events on the canvas are forwarded to the server for hit-testing.
 */
export function createClient(options: TexturaClientOptions): TexturaClient {
  const url = options.url ?? 'ws://localhost:3100'
  const { renderer, canvas } = options

  const state: TexturaClient = {
    layout: null,
    tree: null,
    close() {
      ws.close()
      cleanup()
    },
  }

  const ws = new WebSocket(url)

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data)) as ServerMessage

    if (msg.type === 'frame') {
      state.layout = msg.layout
      state.tree = msg.tree
      renderer.render(msg.layout, msg.tree)
    } else if (msg.type === 'patch' && state.layout && state.tree) {
      applyPatches(state.layout, msg.patches)
      renderer.render(state.layout, state.tree)
    }
  })

  // Forward pointer events to server
  const sendEvent = (eventType: string, e: MouseEvent) => {
    if (ws.readyState !== WebSocket.OPEN) return
    const rect = canvas?.getBoundingClientRect()
    const x = rect ? e.clientX - rect.left : e.clientX
    const y = rect ? e.clientY - rect.top : e.clientY
    ws.send(JSON.stringify({ type: 'event', eventType, x, y }))
  }

  const handlers: Array<[string, (e: MouseEvent) => void]> = []

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
      ['click', onClick],
      ['pointerdown', onPointerDown],
      ['pointerup', onPointerUp],
      ['pointermove', onPointerMove],
    )
  }

  function cleanup() {
    if (canvas) {
      for (const [event, handler] of handlers) {
        canvas.removeEventListener(event, handler as EventListener)
      }
    }
    renderer.destroy()
  }

  return state
}

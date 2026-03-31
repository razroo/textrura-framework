import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import { init, computeLayout } from 'textura'
import type { ComputedLayout } from 'textura'
import { toLayoutTree, dispatchHit, dispatchKeyboardEvent } from '@geometra/core'
import type { UIElement, EventHandlers } from '@geometra/core'
import { diffLayout, PROTOCOL_VERSION } from './protocol.js'
import type { ServerMessage, ClientMessage } from './protocol.js'

export interface TexturaServerOptions {
  /** Port to listen on. Default: 3100. */
  port?: number
  /** Root width. Default: 800. */
  width?: number
  /** Root height. Default: 600. */
  height?: number
  /** Called on errors during layout computation or broadcasting. */
  onError?: (error: unknown) => void
}

export interface TexturaServer {
  /** Trigger a re-render for all connected clients. */
  update(): void
  /** Shut down the server. */
  close(): void
}

/**
 * Create a Textura server that computes layout and streams geometry to clients.
 *
 * The `view` function produces the UI tree. Call `server.update()` after
 * signal changes to push new frames to all connected clients.
 */
export async function createServer(
  view: () => UIElement,
  options: TexturaServerOptions = {},
): Promise<TexturaServer> {
  await init()

  const port = options.port ?? 3100
  const width = options.width ?? 800
  const height = options.height ?? 600

  const clients = new Set<WebSocket>()
  let prevLayout: ComputedLayout | null = null
  let currentTree: UIElement | null = null

  function computeAndBroadcast(): void {
    try {
    currentTree = view()
    const layoutTree = toLayoutTree(currentTree)
    const layout = computeLayout(layoutTree, { width, height })

    let msg: ServerMessage
    if (prevLayout) {
      const patches = diffLayout(prevLayout, layout)
      if (patches.length === 0) return
      // If patches are more than half the tree, just send full frame
      if (patches.length > 20) {
        msg = { type: 'frame', layout, tree: currentTree, protocolVersion: PROTOCOL_VERSION }
      } else {
        msg = { type: 'patch', patches, protocolVersion: PROTOCOL_VERSION }
      }
    } else {
      msg = { type: 'frame', layout, tree: currentTree, protocolVersion: PROTOCOL_VERSION }
    }

    prevLayout = layout
    const data = JSON.stringify(msg)
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(data)
      }
    }
    } catch (err) {
      if (options.onError) {
        options.onError(err)
      } else {
        console.error('Geometra server error:', err)
      }
      // Send error to clients
      const errorMsg: ServerMessage = { type: 'error', message: String(err), protocolVersion: PROTOCOL_VERSION }
      const data = JSON.stringify(errorMsg)
      for (const client of clients) {
        if (client.readyState === client.OPEN) {
          client.send(data)
        }
      }
    }
  }

  const wss = new WebSocketServer({ port })

  wss.on('connection', (ws) => {
    clients.add(ws)

    // Send current state immediately
    if (prevLayout && currentTree) {
      const msg: ServerMessage = {
        type: 'frame',
        layout: prevLayout,
        tree: currentTree,
        protocolVersion: PROTOCOL_VERSION,
      }
      ws.send(JSON.stringify(msg))
    } else {
      computeAndBroadcast()
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as ClientMessage
        if (msg.protocolVersion && msg.protocolVersion > PROTOCOL_VERSION) {
          const errorMsg: ServerMessage = {
            type: 'error',
            message: `Client protocol ${msg.protocolVersion} is newer than server protocol ${PROTOCOL_VERSION}`,
            protocolVersion: PROTOCOL_VERSION,
          }
          ws.send(JSON.stringify(errorMsg))
          return
        }
        if (msg.type === 'event' && currentTree && prevLayout) {
          dispatchHit(
            currentTree,
            prevLayout,
            msg.eventType as keyof EventHandlers,
            msg.x,
            msg.y,
          )
          // After event handling, signals may have changed — re-render
          computeAndBroadcast()
        } else if (msg.type === 'key' && currentTree && prevLayout) {
          dispatchKeyboardEvent(currentTree, prevLayout, msg.eventType, {
            key: msg.key,
            code: msg.code,
            shiftKey: msg.shiftKey,
            ctrlKey: msg.ctrlKey,
            metaKey: msg.metaKey,
            altKey: msg.altKey,
          })
          computeAndBroadcast()
        }
      } catch {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
    })
  })

  // Initial render
  computeAndBroadcast()

  return {
    update() {
      computeAndBroadcast()
    },
    close() {
      wss.close()
      clients.clear()
    },
  }
}

import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import { init, computeLayout } from 'textura'
import type { ComputedLayout } from 'textura'
import { toLayoutTree, dispatchHit, dispatchKeyboardEvent, dispatchCompositionEvent } from '@geometra/core'
import type { UIElement, EventHandlers } from '@geometra/core'
import { diffLayout, PROTOCOL_VERSION, isProtocolCompatible, CLOSE_AUTH_FAILED, CLOSE_FORBIDDEN } from './protocol.js'
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
  /**
   * Called when a new WebSocket client connects. Receives the HTTP upgrade
   * request (headers, URL, etc.). Return any truthy value to accept the
   * connection — that value becomes the connection context passed to
   * `onMessage` and `onDisconnect`. Return `null` to reject (closes with
   * 4001). Throwing also rejects. Async handlers are supported.
   */
  onConnection?: (request: IncomingMessage) => unknown | Promise<unknown>
  /** Called when an accepted client disconnects. Receives the connection context. */
  onDisconnect?: (context: unknown) => void
  /**
   * Called before processing each client message. Return `false` to reject
   * the message (sends a 4003 error to the client, event is not dispatched).
   */
  onMessage?: (message: ClientMessage, context: unknown) => boolean
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
  let width = options.width ?? 800
  let height = options.height ?? 600

  const clients = new Set<WebSocket>()
  const contexts = new Map<WebSocket, unknown>()
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

  function acceptConnection(ws: WebSocket): void {
    clients.add(ws)

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
        if (!isProtocolCompatible(msg.protocolVersion, PROTOCOL_VERSION)) {
          const errorMsg: ServerMessage = {
            type: 'error',
            message: `Client protocol ${msg.protocolVersion} is newer than server protocol ${PROTOCOL_VERSION}`,
            protocolVersion: PROTOCOL_VERSION,
          }
          ws.send(JSON.stringify(errorMsg))
          return
        }
        if (options.onMessage) {
          const ctx = contexts.get(ws)
          if (!options.onMessage(msg, ctx)) {
            const errorMsg: ServerMessage = {
              type: 'error',
              message: 'Forbidden',
              code: CLOSE_FORBIDDEN,
              protocolVersion: PROTOCOL_VERSION,
            }
            ws.send(JSON.stringify(errorMsg))
            return
          }
        }
        if (msg.type === 'event' && currentTree && prevLayout) {
          dispatchHit(
            currentTree,
            prevLayout,
            msg.eventType as keyof EventHandlers,
            msg.x,
            msg.y,
          )
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
        } else if (msg.type === 'composition' && currentTree && prevLayout) {
          dispatchCompositionEvent(currentTree, prevLayout, msg.eventType, {
            data: msg.data,
          })
          computeAndBroadcast()
        } else if (msg.type === 'resize') {
          width = Math.max(1, msg.width)
          height = Math.max(1, msg.height)
          prevLayout = null
          computeAndBroadcast()
        }
      } catch {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      const ctx = contexts.get(ws)
      clients.delete(ws)
      contexts.delete(ws)
      if (options.onDisconnect && ctx !== undefined) {
        options.onDisconnect(ctx)
      }
    })
  }

  wss.on('connection', (ws, request) => {
    if (options.onConnection) {
      Promise.resolve()
        .then(() => options.onConnection!(request))
        .then((ctx) => {
          if (ctx == null) {
            ws.close(CLOSE_AUTH_FAILED, 'Authentication failed')
            return
          }
          contexts.set(ws, ctx)
          acceptConnection(ws)
        })
        .catch(() => {
          ws.close(CLOSE_AUTH_FAILED, 'Authentication failed')
        })
    } else {
      acceptConnection(ws)
    }
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
      contexts.clear()
    },
  }
}

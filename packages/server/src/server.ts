import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import { init, computeLayout } from 'textura'
import type { ComputedLayout } from 'textura'
import {
  toLayoutTree,
  dispatchHit,
  dispatchKeyboardEvent,
  dispatchCompositionEvent,
} from '@geometra/core'
import type { UIElement, EventHandlers } from '@geometra/core'
import { diffLayout, coalescePatches, PROTOCOL_VERSION, isProtocolCompatible, CLOSE_AUTH_FAILED, CLOSE_FORBIDDEN } from './protocol.js'
import type { ServerMessage, ClientMessage } from './protocol.js'
import { encodeBinaryFrameJson } from './binary-frame.js'

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
  /** Backpressure threshold; clients above this buffered amount are deferred. */
  backpressureBytes?: number
  /** Per-broadcast transport telemetry (backpressure, coalescing, binary outbound). */
  onTransportMetrics?: (metrics: ServerTransportMetrics) => void
}

/** Emitted after each successful broadcast (not on early no-op returns). */
export interface ServerTransportMetrics {
  deferredSends: number
  /** How many raw patches were merged by coalescing (0 when no previous layout). */
  coalescedPatchDelta: number
  /** Count of clients that received a binary WebSocket frame this round. */
  binaryOutboundFrames: number
}

export interface TexturaServer {
  /** Trigger a re-render for all connected clients. */
  update(): void
  /** Shut down the server. */
  close(): void
}

export function shouldDeferClientSend(
  bufferedAmount: number,
  backpressureBytes: number,
): boolean {
  return bufferedAmount > backpressureBytes
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
  const needsResync = new Set<WebSocket>()
  /** Clients that negotiated optional binary JSON envelopes for server→client frames. */
  const clientBinaryFraming = new Map<WebSocket, boolean>()
  const contexts = new Map<WebSocket, unknown>()
  let prevLayout: ComputedLayout | null = null
  let currentTree: UIElement | null = null
  let prevSerializedTree: string | null = null
  const backpressureBytes = Math.max(1024, options.backpressureBytes ?? 512 * 1024)

  function computeAndBroadcast(): void {
    try {
      currentTree = view()
      const serializedTree = JSON.stringify(currentTree)
      const layoutTree = toLayoutTree(currentTree)
      const layout = computeLayout(layoutTree, { width, height })

      let msg: ServerMessage
      let coalescedPatchDelta = 0
      const treeChanged = prevSerializedTree !== serializedTree
      if (prevLayout && !treeChanged) {
        const rawPatches = diffLayout(prevLayout, layout)
        const patches = coalescePatches(rawPatches)
        coalescedPatchDelta = Math.max(0, rawPatches.length - patches.length)
        if (patches.length === 0) return
        // Patch streams are only safe when the render tree is byte-for-byte stable.
        if (patches.length > 20) {
          msg = { type: 'frame', layout, tree: currentTree, protocolVersion: PROTOCOL_VERSION }
        } else {
          msg = { type: 'patch', patches, protocolVersion: PROTOCOL_VERSION }
        }
      } else {
        msg = { type: 'frame', layout, tree: currentTree, protocolVersion: PROTOCOL_VERSION }
      }

      prevLayout = layout
      prevSerializedTree = serializedTree
      let deferredSends = 0
      let binaryOutboundFrames = 0
      for (const client of clients) {
        if (client.readyState === client.OPEN) {
          if (shouldDeferClientSend(client.bufferedAmount, backpressureBytes)) {
            deferredSends++
            needsResync.add(client)
            continue
          }
          const clientMsg: ServerMessage =
            needsResync.has(client)
              ? { type: 'frame', layout, tree: currentTree, protocolVersion: PROTOCOL_VERSION }
              : msg
          if (needsResync.has(client)) needsResync.delete(client)
          const json = JSON.stringify(clientMsg)
          if (clientBinaryFraming.get(client)) {
            binaryOutboundFrames++
            client.send(encodeBinaryFrameJson(json), { binary: true })
          } else {
            client.send(json)
          }
        }
      }
      options.onTransportMetrics?.({
        deferredSends,
        coalescedPatchDelta,
        binaryOutboundFrames,
      })
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
    needsResync.delete(ws)
    clientBinaryFraming.delete(ws)

    if (prevLayout && currentTree) {
      const msg: ServerMessage = {
        type: 'frame',
        layout: prevLayout,
        tree: currentTree,
        protocolVersion: PROTOCOL_VERSION,
      }
      const json = JSON.stringify(msg)
      if (clientBinaryFraming.get(ws)) {
        ws.send(encodeBinaryFrameJson(json), { binary: true })
      } else {
        ws.send(json)
      }
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
          if (msg.capabilities?.binaryFraming) {
            clientBinaryFraming.set(ws, true)
          }
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
      needsResync.delete(ws)
      clientBinaryFraming.delete(ws)
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
      needsResync.clear()
      clientBinaryFraming.clear()
      contexts.clear()
    },
  }
}

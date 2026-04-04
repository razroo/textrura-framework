import type { ComputedLayout } from 'textura'
import type { UIElement } from '@geometra/core'

/** Increment when the wire message shape changes in a non-backward-compatible way. */
export const PROTOCOL_VERSION = 1

/** WebSocket close code: connection rejected by onConnection hook. */
export const CLOSE_AUTH_FAILED = 4001

/** WebSocket close code: message rejected by onMessage hook. */
export const CLOSE_FORBIDDEN = 4003

/**
 * Protocol compatibility rule:
 * - `undefined` means legacy v1 and is accepted.
 * - newer peer versions are rejected explicitly (`peerVersion > currentVersion`).
 * - equal/older finite versions are accepted for backward compatibility.
 *
 * Non-finite numeric `peerVersion` values (`NaN`, `±Infinity`) yield `false` — they are not treated as legacy
 * — so corrupt wire numbers fail closed instead of connecting.
 *
 * Non-number runtime values (e.g. `BigInt` from a malformed decoder) are rejected via the `typeof`
 * check before `Number.isFinite` — we never coerce wire values (global `isFinite` throws on `BigInt`).
 *
 * `currentVersion` is not validated: `NaN` makes `peerVersion <= currentVersion` false for every
 * defined peer (while `undefined` peers still short-circuit to `true`). `±Infinity` follows normal
 * numeric ordering (`finite <= Infinity` is `true`; `finite <= -Infinity` is `false`).
 */
export function isProtocolCompatible(
  peerVersion: number | undefined,
  currentVersion = PROTOCOL_VERSION,
): boolean {
  if (peerVersion === undefined) return true
  if (typeof peerVersion !== 'number' || !Number.isFinite(peerVersion)) return false
  return peerVersion <= currentVersion
}

interface VersionedMessage {
  protocolVersion?: number
}

/**
 * Arbitrary JSON-serializable payload on the same WebSocket as layout frames.
 * Use namespaced `channel` strings (e.g. `geom.tracker.snapshot`) so clients and headless agents
 * can subscribe without a second HTTP API.
 */
export type ServerDataMessage = VersionedMessage & {
  type: 'data'
  /** Non-empty namespaced id (e.g. `geom.tracker.snapshot`). */
  channel: string
  /** Must be JSON-serializable (structured clone / JSON.stringify safe). */
  payload: unknown
}

/** Messages sent from server to client. */
export type ServerMessage =
  | (VersionedMessage & { type: 'frame'; layout: ComputedLayout; tree: UIElement })
  | (VersionedMessage & { type: 'patch'; patches: LayoutPatch[] })
  | (VersionedMessage & { type: 'error'; message: string; code?: number })
  | ServerDataMessage

/**
 * Messages sent from client to server.
 * For `type: 'event'`, `x` and `y` must be finite plain numbers; the server ignores events whose
 * coordinates are null (e.g. JSON-serialized `NaN`), strings, or otherwise non-finite.
 */
export type ClientMessage =
  | (VersionedMessage & { type: 'event'; eventType: string; x: number; y: number })
  | (VersionedMessage & {
      type: 'key'
      eventType: 'onKeyDown' | 'onKeyUp'
      key: string
      code: string
      shiftKey: boolean
      ctrlKey: boolean
      metaKey: boolean
      altKey: boolean
    })
  | (VersionedMessage & {
      type: 'composition'
      eventType: 'onCompositionStart' | 'onCompositionUpdate' | 'onCompositionEnd'
      data: string
    })
  | (VersionedMessage & {
      type: 'resize'
      width: number
      height: number
      /** Optional capability negotiation (v1+). */
      capabilities?: { binaryFraming?: boolean }
    })

/** A patch describing a change to a single node's geometry. */
export interface LayoutPatch {
  path: number[]
  x?: number
  y?: number
  width?: number
  height?: number
}

/**
 * Coalesce multiple patches on the same path (last write wins per field).
 * Paths are keyed by joining indices with `.` (e.g. `[1,23]` → `"1.23"`, `[12,3]` → `"12.3"`) so distinct nodes never alias.
 */
export function coalescePatches(patches: LayoutPatch[]): LayoutPatch[] {
  const byPath = new Map<string, LayoutPatch>()
  const order: string[] = []
  for (const patch of patches) {
    const key = patch.path.join('.')
    if (!byPath.has(key)) {
      byPath.set(key, { path: [...patch.path] })
      order.push(key)
    }
    const next = byPath.get(key)!
    if (patch.x !== undefined) next.x = patch.x
    if (patch.y !== undefined) next.y = patch.y
    if (patch.width !== undefined) next.width = patch.width
    if (patch.height !== undefined) next.height = patch.height
  }
  return order.map(k => byPath.get(k)!)
}

/**
 * Diff two computed layouts and return patches for changed nodes.
 *
 * Only pairs existing children by index: if `prev.children` and `next.children` differ in length,
 * extra slots on either side are ignored (no patches for “added” or “removed” subtrees). The server
 * only uses patches when the UI tree JSON is unchanged (`createServer` sends full `frame` messages
 * whenever the tree changes), so callers should not rely on this function across structural layout
 * mismatches.
 */
export function diffLayout(
  prev: ComputedLayout,
  next: ComputedLayout,
  path: number[] = [],
): LayoutPatch[] {
  const patches: LayoutPatch[] = []

  const patch: LayoutPatch = { path }
  let changed = false

  if (prev.x !== next.x) { patch.x = next.x; changed = true }
  if (prev.y !== next.y) { patch.y = next.y; changed = true }
  if (prev.width !== next.width) { patch.width = next.width; changed = true }
  if (prev.height !== next.height) { patch.height = next.height; changed = true }

  if (changed) patches.push(patch)

  const maxChildren = Math.max(prev.children.length, next.children.length)
  for (let i = 0; i < maxChildren; i++) {
    const prevChild = prev.children[i]
    const nextChild = next.children[i]
    if (prevChild && nextChild) {
      patches.push(...diffLayout(prevChild, nextChild, [...path, i]))
    }
  }

  return patches
}

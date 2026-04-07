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
  /**
   * Attach local file(s) to a file input. Implemented by `@geometra/proxy` (Playwright);
   * the native Textura server responds with `error` — not applicable to DOM-free apps.
   *
   * `paths` are absolute paths on the machine that runs the browser (the proxy process).
   * With `x`/`y`, the proxy clicks first to trigger a native file chooser; without them,
   * it attaches to the first `input[type=file]` in any frame.
   */
  | (VersionedMessage & {
      type: 'file'
      paths: string[]
      x?: number
      y?: number
      strategy?: 'auto' | 'chooser' | 'hidden' | 'drop'
      dropX?: number
      dropY?: number
    })
  /**
   * Choose an option on a native `<select>` after focusing it (click `x`,`y` on the control).
   */
  | (VersionedMessage & {
      type: 'selectOption'
      x: number
      y: number
      value?: string
      label?: string
      index?: number
    })
  /**
   * Set a checkbox/radio by accessible label. Implemented by `@geometra/proxy`.
   */
  | (VersionedMessage & {
      type: 'setChecked'
      label: string
      checked?: boolean
      exact?: boolean
      controlType?: 'checkbox' | 'radio'
    })
  /**
   * Custom dropdown / listbox / searchable combobox. Implemented by `@geometra/proxy`.
   * Can optionally open a control by field label and type a search query before picking.
   */
  | (VersionedMessage & {
      type: 'listboxPick'
      label: string
      exact?: boolean
      openX?: number
      openY?: number
      fieldLabel?: string
      query?: string
    })
  /** Mouse wheel / scroll delta at optional viewport coordinates. */
  | (VersionedMessage & {
      type: 'wheel'
      deltaX?: number
      deltaY?: number
      x?: number
      y?: number
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
 * True when two layout scalars are unchanged for diffing.
 *
 * Uses `===` for ordinary numbers (so `+0` and `-0` still compare equal like `!==` would).
 * Treats `NaN` as equal to `NaN` so corrupt snapshots that repeat non-finite geometry do not emit
 * perpetual patches (`NaN !== NaN` in JS would otherwise always look "changed").
 */
function sameLayoutScalar(a: number, b: number): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true
  return a === b
}

/** Only finite primitive numbers merge; `null`, `NaN`, `±Infinity`, and non-numbers are ignored per field. */
function isFinitePatchNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Finite primitive `number` with `>= 0` for layout width/height (matches GEOM v1 client patch validation). */
function isNonNegativePatchDimension(value: unknown): value is number {
  return isFinitePatchNumber(value) && value >= 0
}

/**
 * Coalesce multiple patches on the same path (last write wins per field).
 * Paths are keyed with `JSON.stringify` so distinct index sequences never alias (e.g. `[0, 1]` vs `[0.1]` would
 * both stringify to `"0.1"` under a naive `join('.')` key).
 * Entries with a missing or non-array `path` (including `null` list slots), or paths that `JSON.stringify`
 * rejects (`BigInt` segments, circular arrays, etc.), are skipped so corrupt hand-built batches cannot throw.
 * `x` / `y` apply when the incoming value is a finite primitive `number`. `width` / `height` additionally require
 * `>= 0` (IEEE `−0` counts as non-negative) so negative sizes from corrupt streams cannot overwrite good dimensions
 * or produce coalesced patches the GEOM v1 client rejects. JSON `null`, `NaN`, `±Infinity`, boxed numbers, and other
 * garbage are ignored per field (last valid write still wins).
 */
export function coalescePatches(patches: LayoutPatch[]): LayoutPatch[] {
  const byPath = new Map<string, LayoutPatch>()
  const order: string[] = []
  for (const patch of patches) {
    if (patch == null || !Array.isArray(patch.path)) continue
    let key: string
    try {
      key = JSON.stringify(patch.path)
    } catch {
      continue
    }
    if (!byPath.has(key)) {
      byPath.set(key, { path: [...patch.path] })
      order.push(key)
    }
    const next = byPath.get(key)!
    if (isFinitePatchNumber(patch.x)) next.x = patch.x
    if (isFinitePatchNumber(patch.y)) next.y = patch.y
    if (isNonNegativePatchDimension(patch.width)) next.width = patch.width
    if (isNonNegativePatchDimension(patch.height)) next.height = patch.height
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
 *
 * When `prev` and `next` are the same object reference (including a shared child subtree), returns
 * `[]` immediately without walking — safe for immutable layout snapshots.
 *
 * Non-array `children` on either side (corrupt snapshots / bad deserialization) is treated as `[]` for
 * subtree pairing so patch generation does not throw; root `x`/`y`/`width`/`height` are still compared.
 *
 * `NaN` on a field compares equal to `NaN` on the same field (no patch) so repeated corrupt geometry
 * does not spam patches; changing a field from `NaN` to a finite number (or vice versa) still diffs.
 */
export function diffLayout(
  prev: ComputedLayout,
  next: ComputedLayout,
  path: number[] = [],
): LayoutPatch[] {
  if (prev === next) return []

  const patches: LayoutPatch[] = []

  const patch: LayoutPatch = { path }
  let changed = false

  if (!sameLayoutScalar(prev.x, next.x)) {
    patch.x = next.x
    changed = true
  }
  if (!sameLayoutScalar(prev.y, next.y)) {
    patch.y = next.y
    changed = true
  }
  if (!sameLayoutScalar(prev.width, next.width)) {
    patch.width = next.width
    changed = true
  }
  if (!sameLayoutScalar(prev.height, next.height)) {
    patch.height = next.height
    changed = true
  }

  if (changed) patches.push(patch)

  const prevChildren = Array.isArray(prev.children) ? prev.children : []
  const nextChildren = Array.isArray(next.children) ? next.children : []
  const maxChildren = Math.max(prevChildren.length, nextChildren.length)
  for (let i = 0; i < maxChildren; i++) {
    const prevChild = prevChildren[i]
    const nextChild = nextChildren[i]
    if (prevChild && nextChild) {
      patches.push(...diffLayout(prevChild, nextChild, [...path, i]))
    }
  }

  return patches
}

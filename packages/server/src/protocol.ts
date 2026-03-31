import type { ComputedLayout } from 'textura'
import type { UIElement } from '@geometra/core'

/** Increment when the wire message shape changes in a non-backward-compatible way. */
export const PROTOCOL_VERSION = 1

interface VersionedMessage {
  protocolVersion?: number
}

/** Messages sent from server to client. */
export type ServerMessage =
  | (VersionedMessage & { type: 'frame'; layout: ComputedLayout; tree: UIElement })
  | (VersionedMessage & { type: 'patch'; patches: LayoutPatch[] })
  | (VersionedMessage & { type: 'error'; message: string })

/** Messages sent from client to server. */
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
  | (VersionedMessage & { type: 'resize'; width: number; height: number })

/** A patch describing a change to a single node's geometry. */
export interface LayoutPatch {
  path: number[]
  x?: number
  y?: number
  width?: number
  height?: number
}

/** Diff two computed layouts and return patches for changed nodes. */
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

import type { LayoutSnapshot } from './types.js'

/** Geometry patch aligned with GEOM v1 `patch.patches`. */
export interface LayoutPatch {
  path: number[]
  x?: number
  y?: number
  width?: number
  height?: number
}

function sameLayoutScalar(a: number, b: number): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true
  return a === b
}

function isFinitePatchNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativePatchDimension(value: unknown): value is number {
  return isFinitePatchNumber(value) && value >= 0
}

/**
 * Stable `Map` key for patch `path` arrays. Plain `JSON.stringify([NaN])` and `JSON.stringify([null])` both
 * yield `"[null]"`, so a replacer tags NaN segments — keep in sync with `packages/server/src/protocol.ts` `coalescePatches`.
 */
function layoutPatchPathKey(path: ReadonlyArray<unknown>): string {
  return JSON.stringify(path, (_key, value) => {
    if (typeof value === 'number' && Number.isNaN(value)) {
      return '\uFFFD__GEOM_PATH_NaN__'
    }
    return value
  })
}

export function coalescePatches(patches: LayoutPatch[]): LayoutPatch[] {
  const byPath = new Map<string, LayoutPatch>()
  const order: string[] = []
  for (const patch of patches) {
    if (patch == null || !Array.isArray(patch.path)) continue
    let key: string
    try {
      key = layoutPatchPathKey(patch.path)
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

export function diffLayout(prev: LayoutSnapshot, next: LayoutSnapshot, path: number[] = []): LayoutPatch[] {
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

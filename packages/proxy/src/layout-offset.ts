import type { LayoutSnapshot } from './types.js'

/** Add (dx,dy) to every node in a layout subtree (in place). */
export function offsetLayoutSubtree(root: LayoutSnapshot, dx: number, dy: number): void {
  root.x += dx
  root.y += dy
  for (const c of root.children) {
    offsetLayoutSubtree(c, dx, dy)
  }
}

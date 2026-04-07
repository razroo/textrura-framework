import type { Frame } from 'playwright'

/**
 * Cumulative offset from this frame's top-left content origin to the **root page** viewport,
 * by walking up the frame chain and summing each iframe element's `getBoundingClientRect()`
 * in its parent document.
 */
export async function frameOriginInRootPage(frame: Frame): Promise<{ x: number; y: number }> {
  let ox = 0
  let oy = 0
  let f: Frame | null = frame
  while (f) {
    const parent = f.parentFrame()
    if (!parent) break
    const handle = await f.frameElement()
    if (!handle) break
    const pt = await parent.evaluate((el: Node) => {
      if (!(el instanceof Element)) return { x: 0, y: 0 }
      const r = el.getBoundingClientRect()
      return { x: r.left, y: r.top }
    }, handle)
    ox += pt.x
    oy += pt.y
    f = parent
  }
  return { x: ox, y: oy }
}

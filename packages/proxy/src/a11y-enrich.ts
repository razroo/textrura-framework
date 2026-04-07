import type { CDPSession, Page } from 'playwright'
import type { GeometrySnapshot, LayoutSnapshot, TreeSnapshot } from './types.js'

interface AxBounds {
  left: number
  top: number
  width: number
  height: number
}

function parseAxBounds(props: unknown[] | undefined): AxBounds | null {
  if (!Array.isArray(props)) return null
  for (const p of props) {
    if (p && typeof p === 'object' && 'name' in p && 'value' in p) {
      const name = (p as { name: unknown }).name
      const value = (p as { value: unknown }).value
      if (name === 'bounds' && value && typeof value === 'object' && value !== null) {
        const v = value as Record<string, unknown>
        const left = Number(v.left)
        const top = Number(v.top)
        const width = Number(v.width)
        const height = Number(v.height)
        if ([left, top, width, height].every(Number.isFinite)) {
          return { left, top, width, height }
        }
      }
    }
  }
  return null
}

function boundsIntersectsViewport(b: AxBounds, root: LayoutSnapshot): boolean {
  return (
    b.left + b.width >= root.x &&
    b.left <= root.x + root.width &&
    b.top + b.height >= root.y &&
    b.top <= root.y + root.height
  )
}

/**
 * Use Chrome DevTools `Accessibility.getFullAXTree` to back-fill `semantic.ariaLabel` on nodes
 * whose center falls inside an AX bounds box (helps closed shadow + custom controls).
 */
export async function enrichSnapshotWithCdpAx(page: Page, snap: GeometrySnapshot): Promise<void> {
  let session: CDPSession | undefined
  try {
    session = await page.context().newCDPSession(page)
    await session.send('Accessibility.enable')
    const res = (await session.send('Accessibility.getFullAXTree')) as {
      nodes?: Array<{
        role?: { value?: string }
        name?: { value?: string }
        properties?: unknown[]
      }>
    }
    const nodes = res.nodes ?? []
    const root = snap.layout
    const candidates: { name: string; role: string; bounds: AxBounds }[] = []
    for (const n of nodes) {
      const name = n.name?.value?.trim()
      const role = n.role?.value ?? ''
      if (!name) continue
      const b = parseAxBounds(n.properties as unknown[] | undefined)
      if (!b || b.width <= 0 || b.height <= 0) continue
      if (!boundsIntersectsViewport(b, root)) continue
      candidates.push({ name, role, bounds: b })
    }

    const visit = (tNode: TreeSnapshot, lNode: LayoutSnapshot): void => {
      const sem = tNode.semantic
      if (sem?.ariaLabel || sem?.a11yEnriched) {
        /* skip */
      } else {
        const cx = lNode.x + lNode.width / 2
        const cy = lNode.y + lNode.height / 2
        for (const c of candidates) {
          const b = c.bounds
          if (cx >= b.left && cx <= b.left + b.width && cy >= b.top && cy <= b.top + b.height) {
            tNode.semantic = {
              ...(sem ?? {}),
              ariaLabel: c.name,
              a11yRoleHint: c.role,
              a11yEnriched: true,
            }
            break
          }
        }
      }
      const tch = tNode.children ?? []
      const lch = lNode.children
      for (let i = 0; i < tch.length; i++) {
        visit(tch[i]!, lch[i]!)
      }
    }
    visit(snap.tree, snap.layout)
  } catch {
    /* optional */
  } finally {
    try {
      await session?.detach()
    } catch {
      /* ignore */
    }
  }
}

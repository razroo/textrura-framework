import { describe, expect, it, vi } from 'vitest'
import { createCdpAxSessionManager, shouldEnrichSnapshotWithCdpAx } from '../a11y-enrich.ts'
import type { GeometrySnapshot, LayoutSnapshot, TreeSnapshot } from '../types.js'

function layoutFor(tree: TreeSnapshot): LayoutSnapshot {
  return {
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    children: (tree.children ?? []).map(layoutFor),
  }
}

function snapshot(tree: TreeSnapshot): GeometrySnapshot {
  return {
    tree,
    layout: layoutFor(tree),
    treeJson: JSON.stringify(tree),
  }
}

describe('shouldEnrichSnapshotWithCdpAx', () => {
  it('skips CDP AX when interactive nodes are already labeled', () => {
    const tree: TreeSnapshot = {
      kind: 'box',
      props: {},
      semantic: { role: 'group' },
      children: [
        {
          kind: 'box',
          props: {},
          semantic: { role: 'textbox', ariaLabel: 'Username' },
          handlers: { onClick: true, onKeyDown: true, onKeyUp: true },
          children: [],
        },
        {
          kind: 'text',
          props: { text: 'Login', font: '16px system-ui', lineHeight: 1.2 },
          semantic: { role: 'button' },
          handlers: { onClick: true, onKeyDown: true, onKeyUp: true },
          children: [],
        },
      ],
    }

    expect(shouldEnrichSnapshotWithCdpAx(snapshot(tree))).toBe(false)
  })

  it('requests CDP AX when DOM extraction is effectively empty', () => {
    const tree: TreeSnapshot = {
      kind: 'box',
      props: {},
      semantic: { role: 'group' },
      children: [],
    }

    expect(shouldEnrichSnapshotWithCdpAx(snapshot(tree))).toBe(true)
  })

  it('requests CDP AX when an interactive node is missing a usable label', () => {
    const tree: TreeSnapshot = {
      kind: 'box',
      props: {},
      semantic: { role: 'group' },
      children: [
        {
          kind: 'box',
          props: {},
          semantic: { role: 'button' },
          handlers: { onClick: true, onKeyDown: true, onKeyUp: true },
          children: [],
        },
      ],
    }

    expect(shouldEnrichSnapshotWithCdpAx(snapshot(tree))).toBe(true)
  })

  it('skips CDP AX when the only unlabeled interactive is one tiny link', () => {
    const tree: TreeSnapshot = {
      kind: 'box',
      props: {},
      semantic: { role: 'group' },
      children: [
        {
          kind: 'box',
          props: {},
          semantic: { role: 'link' },
          handlers: { onClick: true },
          children: [],
        },
        {
          kind: 'text',
          props: { text: 'Checkout', font: '16px system-ui', lineHeight: 1.2 },
          semantic: { role: 'button' },
          handlers: { onClick: true, onKeyDown: true, onKeyUp: true },
          children: [],
        },
      ],
    }
    const snap: GeometrySnapshot = {
      tree,
      layout: {
        x: 0,
        y: 0,
        width: 220,
        height: 48,
        children: [
          { x: 0, y: 0, width: 40, height: 40, children: [] },
          { x: 80, y: 0, width: 120, height: 40, children: [] },
        ],
      },
      treeJson: JSON.stringify(tree),
    }

    expect(shouldEnrichSnapshotWithCdpAx(snap)).toBe(false)
  })
})

describe('createCdpAxSessionManager', () => {
  it('reuses one enabled CDP session until reset', async () => {
    const detach = vi.fn(async () => {})
    const send = vi.fn(async () => undefined)
    const session = { send, detach }
    const newCDPSession = vi.fn(async () => session)
    const page = {
      context: () => ({ newCDPSession }),
    }

    const manager = createCdpAxSessionManager()
    const first = await manager.get(page as never)
    const second = await manager.get(page as never)

    expect(first).toBe(session)
    expect(second).toBe(session)
    expect(newCDPSession).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenNthCalledWith(1, 'Accessibility.enable')
    expect(send).toHaveBeenNthCalledWith(2, 'DOM.enable')

    await manager.reset()
    expect(detach).toHaveBeenCalledTimes(1)

    await manager.get(page as never)
    expect(newCDPSession).toHaveBeenCalledTimes(2)
  })
})

import type { ComputedLayout } from 'textura'
import { describe, expect, it } from 'vitest'
import { agentAction } from '../agent-contracts.js'
import { box, text } from '../elements.js'
import { collectSemanticGeometry, createAgentGeometrySnapshot } from '../semantic-geometry.js'

describe('semantic geometry', () => {
  it('publishes stable ids, exact bounds, semantics, focusability, and action metadata', () => {
    const tree = box({ width: 320, height: 160, semantic: { id: 'root-surface', role: 'main' } }, [
      box(
        {
          width: 140,
          height: 36,
          onClick: () => undefined,
          semantic: agentAction(
            {
              id: 'approve-invoice',
              kind: 'approve',
              title: 'Approve invoice',
              risk: 'write',
            },
            { role: 'button', ariaLabel: 'Approve invoice' },
          ),
        },
        [text({ text: 'Approve', font: '14px Inter', lineHeight: 18, key: 'approve-label' })],
      ),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 320,
      height: 160,
      children: [
        {
          x: 12,
          y: 20,
          width: 140,
          height: 36,
          children: [{ x: 10, y: 8, width: 80, height: 18, children: [] }],
        },
      ],
    }

    expect(collectSemanticGeometry(tree, layout)).toEqual([
      expect.objectContaining({
        id: 'root-surface',
        role: 'main',
        bounds: { x: 0, y: 0, width: 320, height: 160 },
        path: [],
      }),
      expect.objectContaining({
        id: 'approve-invoice',
        role: 'button',
        name: 'Approve invoice',
        bounds: { x: 12, y: 20, width: 140, height: 36 },
        visible: true,
        enabled: true,
        focusable: true,
        interactive: true,
        actionId: 'approve-invoice',
      }),
      expect.objectContaining({
        id: 'approve-label',
        role: 'text',
        name: 'Approve',
        bounds: { x: 22, y: 28, width: 80, height: 18 },
        focusable: false,
      }),
    ])
  })

  it('falls back to path ids, de-duplicates duplicate semantic ids, and applies scroll offsets', () => {
    const tree = box({ scrollX: 10, scrollY: 20 }, [
      text({ text: 'First', font: '14px Inter', lineHeight: 18, semantic: { id: 'duplicate' } }),
      text({ text: 'Second', font: '14px Inter', lineHeight: 18, semantic: { id: 'duplicate' } }),
      text({ text: 'Third', font: '14px Inter', lineHeight: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 50,
      y: 60,
      width: 240,
      height: 100,
      children: [
        { x: 15, y: 8, width: 90, height: 18, children: [] },
        { x: 15, y: 32, width: 90, height: 18, children: [] },
        { x: 15, y: 56, width: 90, height: 18, children: [] },
      ],
    }

    expect(collectSemanticGeometry(tree, layout).map(node => ({ id: node.id, bounds: node.bounds }))).toEqual([
      { id: 'root', bounds: { x: 50, y: 60, width: 240, height: 100 } },
      { id: 'duplicate', bounds: { x: 55, y: 48, width: 90, height: 18 } },
      { id: 'duplicate#2', bounds: { x: 55, y: 72, width: 90, height: 18 } },
      { id: 'node:2', bounds: { x: 55, y: 96, width: 90, height: 18 } },
    ])
  })

  it('creates an auditable frame snapshot with actions and route metadata', () => {
    const tree = box({ semantic: { id: 'surface' } }, [
      box({
        semantic: agentAction({ id: 'export-packet', kind: 'export', title: 'Export packet', risk: 'external' }),
      }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [{ x: 8, y: 8, width: 90, height: 30, children: [] }],
    }

    expect(createAgentGeometrySnapshot(tree, layout, {
      id: 'frame-1',
      route: '/claims',
      createdAt: '2026-04-24T12:00:00.000Z',
    })).toMatchObject({
      id: 'frame-1',
      route: '/claims',
      createdAt: '2026-04-24T12:00:00.000Z',
      rootBounds: { x: 0, y: 0, width: 200, height: 100 },
      nodes: [expect.objectContaining({ id: 'surface' }), expect.objectContaining({ id: 'export-packet' })],
      actions: [expect.objectContaining({ id: 'export-packet', bounds: { x: 8, y: 8, width: 90, height: 30 } })],
    })
  })
})

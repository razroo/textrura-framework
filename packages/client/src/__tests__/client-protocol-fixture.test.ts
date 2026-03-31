import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ComputedLayout } from 'textura'
import type { UIElement, Renderer } from '@geometra/core'
import { applyServerMessage } from '../client.js'

function readJSON(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'))
}

describe('client protocol fixtures', () => {
  it('replays shared v1 fixture messages', () => {
    const frame = readJSON(new URL('../../../../fixtures/protocol/v1/frame.json', import.meta.url).pathname)
    const patch = readJSON(new URL('../../../../fixtures/protocol/v1/patch.json', import.meta.url).pathname)

    let renders = 0
    const renderer: Renderer = {
      render: () => {
        renders++
      },
      destroy: () => undefined,
    }
    const state = {
      layout: null as ComputedLayout | null,
      tree: null as UIElement | null,
    }

    applyServerMessage(state, renderer, frame)
    applyServerMessage(state, renderer, patch)

    expect(state.layout?.width).toBe(120)
    expect(state.layout?.height).toBe(60)
    expect(renders).toBe(2)
  })

  it('preserves direction metadata from server frames', () => {
    let lastTree: UIElement | null = null
    const renderer: Renderer = {
      render: (_layout, tree) => {
        lastTree = tree
      },
      destroy: () => undefined,
    }
    const state = {
      layout: null as ComputedLayout | null,
      tree: null as UIElement | null,
    }

    applyServerMessage(state, renderer, {
      type: 'frame',
      protocolVersion: 1,
      layout: { x: 0, y: 0, width: 100, height: 40, children: [{ x: 0, y: 0, width: 100, height: 20, children: [] }] } as any,
      tree: {
        kind: 'box',
        props: { width: 100, height: 40, dir: 'rtl' },
        children: [
          { kind: 'text', props: { text: 'مرحبا', font: '14px sans-serif', lineHeight: 18, dir: 'rtl' } },
        ],
      } as any,
    })

    expect((state.tree as any)?.props?.dir).toBe('rtl')
    expect((lastTree as any)?.children?.[0]?.props?.dir).toBe('rtl')
  })
})

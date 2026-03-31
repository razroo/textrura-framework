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
})

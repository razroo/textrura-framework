import { describe, it, expect } from 'vitest'
import { decodeBinaryFrameJson, encodeBinaryFrameJson, isBinaryFrameBuffer } from '../binary-frame.js'

describe('binary frame envelope', () => {
  it('roundtrips JSON through GEOM v1 envelope', () => {
    const json = JSON.stringify({ type: 'frame', protocolVersion: 1, layout: { x: 0, y: 0, width: 1, height: 1, children: [] } })
    const buf = encodeBinaryFrameJson(json)
    expect(isBinaryFrameBuffer(buf)).toBe(true)
    expect(decodeBinaryFrameJson(buf)).toBe(json)
  })
})

import { describe, it, expect } from 'vitest'
import { decodeBinaryFrameJson } from '../binary-frame.js'

/** Mirrors server v1 envelope layout (see `packages/server/src/binary-frame.ts`). */
function encodeBinaryFrameJsonV1(jsonUtf8: string): ArrayBuffer {
  const payload = new TextEncoder().encode(jsonUtf8)
  const out = new Uint8Array(9 + payload.length)
  out.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
  new DataView(out.buffer).setUint32(5, payload.length, true)
  out.set(payload, 9)
  return out.buffer
}

describe('client binary frame decode', () => {
  it('decodes v1 GEOM envelopes', () => {
    const json = '{"type":"patch","patches":[],"protocolVersion":1}'
    expect(decodeBinaryFrameJson(encodeBinaryFrameJsonV1(json))).toBe(json)
  })
})

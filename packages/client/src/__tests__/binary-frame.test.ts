import { describe, it, expect } from 'vitest'
import { decodeBinaryFrameJson, isBinaryFrameArrayBuffer } from '../binary-frame.js'

/** Mirrors server v1 envelope layout (see `packages/server/src/binary-frame.ts`). */
function encodeBinaryFrameJsonV1(jsonUtf8: string): ArrayBuffer {
  const payload = new TextEncoder().encode(jsonUtf8)
  const out = new Uint8Array(9 + payload.length)
  out.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
  new DataView(out.buffer).setUint32(5, payload.length, true)
  out.set(payload, 9)
  return out.buffer
}

describe('isBinaryFrameArrayBuffer', () => {
  it('returns false when buffer is shorter than the v1 header', () => {
    expect(isBinaryFrameArrayBuffer(new ArrayBuffer(0))).toBe(false)
    expect(isBinaryFrameArrayBuffer(new ArrayBuffer(8))).toBe(false)
  })

  it('returns false when magic or version does not match v1', () => {
    const badMagic = new Uint8Array(9)
    badMagic.set([0x00, 0x45, 0x4f, 0x4d, 1], 0)
    expect(isBinaryFrameArrayBuffer(badMagic.buffer)).toBe(false)

    const badVersion = new Uint8Array(9)
    badVersion.set([0x47, 0x45, 0x4f, 0x4d, 2], 0)
    expect(isBinaryFrameArrayBuffer(badVersion.buffer)).toBe(false)
  })

  it('returns true for a minimal valid v1 header (payload may still be truncated)', () => {
    const headerOnly = new Uint8Array(9)
    headerOnly.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
    new DataView(headerOnly.buffer).setUint32(5, 0, true)
    expect(isBinaryFrameArrayBuffer(headerOnly.buffer)).toBe(true)
  })
})

describe('client binary frame decode', () => {
  it('decodes v1 GEOM envelopes', () => {
    const json = '{"type":"patch","patches":[],"protocolVersion":1}'
    expect(decodeBinaryFrameJson(encodeBinaryFrameJsonV1(json))).toBe(json)
  })

  it('throws when the buffer is not a GEOM binary frame', () => {
    expect(() => decodeBinaryFrameJson(new ArrayBuffer(0))).toThrow('Not a GEOM binary frame')
    const plain = new TextEncoder().encode('not binary').buffer
    expect(() => decodeBinaryFrameJson(plain)).toThrow('Not a GEOM binary frame')
  })

  it('throws when declared payload length exceeds available bytes', () => {
    const headerOnly = new Uint8Array(9)
    headerOnly.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
    new DataView(headerOnly.buffer).setUint32(5, 4, true)
    expect(() => decodeBinaryFrameJson(headerOnly.buffer)).toThrow('Truncated binary frame payload')
  })

  it('decodes zero-length JSON payload when length field is zero', () => {
    const emptyPayload = new Uint8Array(9)
    emptyPayload.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
    new DataView(emptyPayload.buffer).setUint32(5, 0, true)
    expect(decodeBinaryFrameJson(emptyPayload.buffer)).toBe('')
  })

  it('ignores trailing bytes after the declared payload', () => {
    const json = '{"type":"patch","patches":[]}'
    const base = new Uint8Array(encodeBinaryFrameJsonV1(json))
    const extended = new Uint8Array(base.length + 12)
    extended.set(base)
    for (let i = base.length; i < extended.length; i++) extended[i] = 0xff
    expect(decodeBinaryFrameJson(extended.buffer)).toBe(json)
  })
})

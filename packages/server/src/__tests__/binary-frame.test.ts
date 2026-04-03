import { describe, it, expect } from 'vitest'
import { decodeBinaryFrameJson, encodeBinaryFrameJson, isBinaryFrameBuffer } from '../binary-frame.js'

/** v1 envelope with arbitrary bytes (including invalid UTF-8 for decode policy tests). */
function encodeBinaryFrameRawV1(payload: Uint8Array): Buffer {
  const header = Buffer.alloc(9)
  header.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
  header.writeUInt32LE(payload.length, 5)
  return Buffer.concat([header, Buffer.from(payload)])
}

describe('isBinaryFrameBuffer', () => {
  it('returns false when buffer is shorter than the v1 header', () => {
    expect(isBinaryFrameBuffer(Buffer.alloc(0))).toBe(false)
    expect(isBinaryFrameBuffer(Buffer.alloc(8))).toBe(false)
    expect(isBinaryFrameBuffer(new Uint8Array(0))).toBe(false)
  })

  it('returns false when magic or version does not match v1', () => {
    const badMagic = Buffer.from([0x00, 0x45, 0x4f, 0x4d, 1, 0, 0, 0, 0])
    expect(isBinaryFrameBuffer(badMagic)).toBe(false)

    const badVersion = Buffer.from([0x47, 0x45, 0x4f, 0x4d, 2, 0, 0, 0, 0])
    expect(isBinaryFrameBuffer(badVersion)).toBe(false)
  })

  it('returns true for a minimal valid v1 header (payload may still be truncated)', () => {
    const headerOnly = Buffer.from([0x47, 0x45, 0x4f, 0x4d, 1, 0, 0, 0, 0])
    expect(isBinaryFrameBuffer(headerOnly)).toBe(true)
    expect(isBinaryFrameBuffer(new Uint8Array(headerOnly))).toBe(true)
  })
})

describe('binary frame envelope', () => {
  it('roundtrips JSON through GEOM v1 envelope', () => {
    const json = JSON.stringify({ type: 'frame', protocolVersion: 1, layout: { x: 0, y: 0, width: 1, height: 1, children: [] } })
    const buf = encodeBinaryFrameJson(json)
    expect(isBinaryFrameBuffer(buf)).toBe(true)
    expect(decodeBinaryFrameJson(buf)).toBe(json)
  })

  it('ignores trailing bytes after the declared payload', () => {
    const json = '{"a":1}'
    const buf = encodeBinaryFrameJson(json)
    const extended = Buffer.alloc(buf.length + 8, 0xfe)
    buf.copy(extended, 0)
    expect(decodeBinaryFrameJson(extended)).toBe(json)
  })

  it('throws when the buffer is not a GEOM binary frame', () => {
    expect(() => decodeBinaryFrameJson(Buffer.alloc(0))).toThrow('Not a GEOM binary frame')
    expect(() => decodeBinaryFrameJson(Buffer.from('not binary', 'utf8'))).toThrow('Not a GEOM binary frame')
  })

  it('throws when magic matches but frame version is not v1', () => {
    const wrongVersion = Buffer.from([0x47, 0x45, 0x4f, 0x4d, 2, 0, 0, 0, 0])
    expect(() => decodeBinaryFrameJson(wrongVersion)).toThrow('Not a GEOM binary frame')
  })

  it('throws when declared payload length exceeds available bytes', () => {
    const headerOnly = Buffer.from([0x47, 0x45, 0x4f, 0x4d, 1, 4, 0, 0, 0])
    expect(() => decodeBinaryFrameJson(headerOnly)).toThrow('Truncated binary frame payload')
  })

  it('throws when declared payload length is uint32 max with header-only buffer', () => {
    const headerOnly = Buffer.alloc(9)
    headerOnly.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
    headerOnly.writeUInt32LE(0xffff_ffff, 5)
    expect(() => decodeBinaryFrameJson(headerOnly)).toThrow('Truncated binary frame payload')
  })

  it('decodes zero-length JSON payload when length field is zero', () => {
    const emptyPayload = Buffer.from([0x47, 0x45, 0x4f, 0x4d, 1, 0, 0, 0, 0])
    expect(decodeBinaryFrameJson(emptyPayload)).toBe('')
  })

  it('decodes a Uint8Array view with non-zero byteOffset (frame embedded in a larger buffer)', () => {
    const json = '{"embedded":true}'
    const frame = encodeBinaryFrameJson(json)
    const prefix = 7
    const combined = new Uint8Array(prefix + frame.length + 3)
    combined.set(frame, prefix)
    const view = combined.subarray(prefix, prefix + frame.length)
    expect(decodeBinaryFrameJson(view)).toBe(json)
  })

  it('returns false when GEOM magic is only present before the view offset (Buffer subarray)', () => {
    const json = '{"a":1}'
    const frame = encodeBinaryFrameJson(json)
    const combined = Buffer.alloc(frame.length + 3)
    frame.copy(combined, 3)
    const missesMagic = combined.subarray(0, frame.length)
    expect(isBinaryFrameBuffer(missesMagic)).toBe(false)
    expect(() => decodeBinaryFrameJson(missesMagic)).toThrow('Not a GEOM binary frame')
  })

  it('throws truncated payload when length exceeds the view (not the whole ArrayBuffer)', () => {
    const headerOnly = Buffer.from([0x47, 0x45, 0x4f, 0x4d, 1, 4, 0, 0, 0])
    const padded = new Uint8Array(headerOnly.length + 20)
    padded.set(headerOnly, 0)
    const view = padded.subarray(0, 9)
    expect(() => decodeBinaryFrameJson(view)).toThrow('Truncated binary frame payload')
  })

  it('accepts payload length exactly equal to bytes after header (buffer fits, no slack)', () => {
    const json = 'x'
    const buf = encodeBinaryFrameJson(json)
    expect(buf.length).toBe(10)
    expect(decodeBinaryFrameJson(buf)).toBe(json)
  })

  it('decodes malformed UTF-8 payload with U+FFFD replacements (WHATWG TextDecoder)', () => {
    const raw = new Uint8Array([0xff, 0xfe, 0xfd])
    expect(decodeBinaryFrameJson(encodeBinaryFrameRawV1(raw))).toBe('\uFFFD\uFFFD\uFFFD')
  })

  it('decodes a frame held in a SharedArrayBuffer-backed Uint8Array', () => {
    if (typeof SharedArrayBuffer === 'undefined') return
    const json = '{"sab":true}'
    const buf = encodeBinaryFrameJson(json)
    const sab = new SharedArrayBuffer(buf.length)
    new Uint8Array(sab).set(buf)
    expect(decodeBinaryFrameJson(new Uint8Array(sab))).toBe(json)
  })
})

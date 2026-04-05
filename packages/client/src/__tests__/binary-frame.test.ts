import { describe, it, expect } from 'vitest'
import { decodeBinaryFrameJson, isBinaryFrameArrayBuffer, MAX_V1_PAYLOAD_BYTES } from '../binary-frame.js'

/** Mirrors server v1 envelope layout (see `packages/server/src/binary-frame.ts`). */
function encodeBinaryFrameJsonV1(jsonUtf8: string): ArrayBuffer {
  const payload = new TextEncoder().encode(jsonUtf8)
  const out = new Uint8Array(9 + payload.length)
  out.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
  new DataView(out.buffer).setUint32(5, payload.length, true)
  out.set(payload, 9)
  return out.buffer
}

/** v1 envelope with arbitrary UTF-8 bytes (including invalid sequences for decode policy tests). */
function encodeBinaryFrameRawV1(payload: Uint8Array): ArrayBuffer {
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
  it('exposes the v1 uint32 payload cap (aligned with server encode limits)', () => {
    expect(MAX_V1_PAYLOAD_BYTES).toBe(0xffff_ffff)
  })

  it('decodes v1 GEOM envelopes', () => {
    const json = '{"type":"patch","patches":[],"protocolVersion":1}'
    expect(decodeBinaryFrameJson(encodeBinaryFrameJsonV1(json))).toBe(json)
  })

  it('throws when the buffer is not a GEOM binary frame', () => {
    expect(() => decodeBinaryFrameJson(new ArrayBuffer(0))).toThrow('Not a GEOM binary frame')
    const plain = new TextEncoder().encode('not binary').buffer
    expect(() => decodeBinaryFrameJson(plain)).toThrow('Not a GEOM binary frame')
  })

  it('throws when magic matches but frame version is not v1', () => {
    const wrongVersion = new Uint8Array(9)
    wrongVersion.set([0x47, 0x45, 0x4f, 0x4d, 2], 0)
    new DataView(wrongVersion.buffer).setUint32(5, 0, true)
    expect(() => decodeBinaryFrameJson(wrongVersion.buffer)).toThrow('Not a GEOM binary frame')
  })

  it('throws when declared payload length exceeds available bytes', () => {
    const headerOnly = new Uint8Array(9)
    headerOnly.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
    new DataView(headerOnly.buffer).setUint32(5, 4, true)
    expect(() => decodeBinaryFrameJson(headerOnly.buffer)).toThrow('Truncated binary frame payload')
  })

  it('throws when declared payload length is uint32 max with header-only buffer', () => {
    const headerOnly = new Uint8Array(9)
    headerOnly.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
    new DataView(headerOnly.buffer).setUint32(5, 0xffff_ffff, true)
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

  it('detects a v1 header on a Uint8Array subarray (non-zero byteOffset)', () => {
    const json = '{"type":"patch","patches":[]}'
    const frame = new Uint8Array(encodeBinaryFrameJsonV1(json))
    const prefix = 11
    const combined = new Uint8Array(prefix + frame.length + 5)
    combined.set(frame, prefix)
    const view = combined.subarray(prefix, prefix + frame.length)
    expect(isBinaryFrameArrayBuffer(view)).toBe(true)
    expect(decodeBinaryFrameJson(view)).toBe(json)
  })

  it('accepts a DataView over the whole frame (ArrayBufferView parity)', () => {
    const json = '{"type":"patch","patches":[]}'
    const bytes = new Uint8Array(encodeBinaryFrameJsonV1(json))
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(isBinaryFrameArrayBuffer(dv)).toBe(true)
    expect(decodeBinaryFrameJson(dv)).toBe(json)
  })

  it('decodes a DataView with non-zero byteOffset into a larger ArrayBuffer', () => {
    const json = '{"a":1}'
    const frame = new Uint8Array(encodeBinaryFrameJsonV1(json))
    const prefix = 13
    const combined = new Uint8Array(prefix + frame.length + 4)
    combined.set(frame, prefix)
    const dv = new DataView(combined.buffer, combined.byteOffset + prefix, frame.length)
    expect(isBinaryFrameArrayBuffer(dv)).toBe(true)
    expect(decodeBinaryFrameJson(dv)).toBe(json)
  })

  it('returns false when GEOM magic is only present before the view offset', () => {
    const json = '{"a":1}'
    const frame = new Uint8Array(encodeBinaryFrameJsonV1(json))
    const combined = new Uint8Array(frame.length + 3)
    combined.set(frame, 3)
    const missesMagic = combined.subarray(0, frame.length)
    expect(isBinaryFrameArrayBuffer(missesMagic)).toBe(false)
    expect(() => decodeBinaryFrameJson(missesMagic)).toThrow('Not a GEOM binary frame')
  })

  it('throws truncated payload when length exceeds the view (not the whole ArrayBuffer)', () => {
    const headerOnly = new Uint8Array(9)
    headerOnly.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
    new DataView(headerOnly.buffer).setUint32(5, 4, true)
    const padded = new Uint8Array(headerOnly.length + 20)
    padded.set(headerOnly, 0)
    const view = padded.subarray(0, 9)
    expect(() => decodeBinaryFrameJson(view)).toThrow('Truncated binary frame payload')
  })

  it('accepts payload length exactly equal to bytes after header (buffer fits, no slack)', () => {
    const json = 'x'
    const buf = encodeBinaryFrameJsonV1(json)
    expect(buf.byteLength).toBe(10)
    expect(decodeBinaryFrameJson(buf)).toBe(json)
  })

  it('decodes malformed UTF-8 payload with U+FFFD replacements (WHATWG TextDecoder)', () => {
    const raw = new Uint8Array([0xff, 0xfe, 0xfd])
    expect(decodeBinaryFrameJson(encodeBinaryFrameRawV1(raw))).toBe('\uFFFD\uFFFD\uFFFD')
  })

  it('decodes a v1 frame when the backing store is a root SharedArrayBuffer', () => {
    if (typeof SharedArrayBuffer === 'undefined') return
    const json = '{"sab":true}'
    const enc = new Uint8Array(encodeBinaryFrameJsonV1(json))
    const sab = new SharedArrayBuffer(enc.byteLength)
    new Uint8Array(sab).set(enc)
    expect(isBinaryFrameArrayBuffer(sab)).toBe(true)
    expect(decodeBinaryFrameJson(sab)).toBe(json)
  })

  it('decodes a v1 frame from a Uint8Array subview backed by SharedArrayBuffer (non-zero byteOffset)', () => {
    if (typeof SharedArrayBuffer === 'undefined') return
    const json = '{"sab":"slice"}'
    const frame = new Uint8Array(encodeBinaryFrameJsonV1(json))
    const prefix = 7
    const sab = new SharedArrayBuffer(prefix + frame.byteLength + 6)
    const whole = new Uint8Array(sab)
    whole.set(frame, prefix)
    const view = whole.subarray(prefix, prefix + frame.byteLength)
    expect(isBinaryFrameArrayBuffer(view)).toBe(true)
    expect(decodeBinaryFrameJson(view)).toBe(json)
  })

  it('decodes a v1 frame when the same bytes are exposed as Uint16Array or Uint32Array', () => {
    const json = '{"type":"patch","patches":[]}'
    const frame = new Uint8Array(encodeBinaryFrameJsonV1(json))

    const len16 = Math.ceil(frame.byteLength / 2) * 2
    const buf16 = new ArrayBuffer(len16)
    new Uint8Array(buf16).set(frame)
    const u16 = new Uint16Array(buf16)
    expect(isBinaryFrameArrayBuffer(u16)).toBe(true)
    expect(decodeBinaryFrameJson(u16)).toBe(json)

    const len32 = Math.ceil(frame.byteLength / 4) * 4
    const buf32 = new ArrayBuffer(len32)
    new Uint8Array(buf32).set(frame)
    const u32 = new Uint32Array(buf32)
    expect(isBinaryFrameArrayBuffer(u32)).toBe(true)
    expect(decodeBinaryFrameJson(u32)).toBe(json)
  })

  it('decodes a v1 frame when the same bytes are exposed as Int16Array, Int32Array, or BigUint64Array', () => {
    const json = '{"type":"patch","patches":[]}'
    const frame = new Uint8Array(encodeBinaryFrameJsonV1(json))

    const len16 = Math.ceil(frame.byteLength / 2) * 2
    const buf16 = new ArrayBuffer(len16)
    new Uint8Array(buf16).set(frame)
    const i16 = new Int16Array(buf16)
    expect(isBinaryFrameArrayBuffer(i16)).toBe(true)
    expect(decodeBinaryFrameJson(i16)).toBe(json)

    const len32 = Math.ceil(frame.byteLength / 4) * 4
    const buf32 = new ArrayBuffer(len32)
    new Uint8Array(buf32).set(frame)
    const i32 = new Int32Array(buf32)
    expect(isBinaryFrameArrayBuffer(i32)).toBe(true)
    expect(decodeBinaryFrameJson(i32)).toBe(json)

    const len64 = Math.ceil(frame.byteLength / 8) * 8
    const buf64 = new ArrayBuffer(len64)
    new Uint8Array(buf64).set(frame)
    const u64 = new BigUint64Array(buf64)
    expect(isBinaryFrameArrayBuffer(u64)).toBe(true)
    expect(decodeBinaryFrameJson(u64)).toBe(json)
  })

  it('decodes a v1 frame when the same bytes are exposed as Float64Array or Int8Array', () => {
    const json = '{"type":"patch","patches":[]}'
    const frame = new Uint8Array(encodeBinaryFrameJsonV1(json))

    const len64 = Math.ceil(frame.byteLength / 8) * 8
    const buf64 = new ArrayBuffer(len64)
    new Uint8Array(buf64).set(frame)
    const f64 = new Float64Array(buf64)
    expect(isBinaryFrameArrayBuffer(f64)).toBe(true)
    expect(decodeBinaryFrameJson(f64)).toBe(json)

    const i8 = new Int8Array(frame.buffer, frame.byteOffset, frame.byteLength)
    expect(isBinaryFrameArrayBuffer(i8)).toBe(true)
    expect(decodeBinaryFrameJson(i8)).toBe(json)
  })
})

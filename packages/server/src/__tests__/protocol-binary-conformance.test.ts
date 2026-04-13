import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  decodeBinaryFrameJson as decodeBinaryFrameJsonClient,
  isBinaryFrameArrayBuffer as isBinaryFrameArrayBufferClient,
  MAX_V1_PAYLOAD_BYTES as MAX_V1_PAYLOAD_BYTES_CLIENT,
} from '../../../client/src/binary-frame.js'
import {
  encodeBinaryFrameJson,
  decodeBinaryFrameJson,
  isBinaryFrameBuffer,
  MAX_V1_PAYLOAD_BYTES,
} from '../binary-frame.js'

const V1_FIXTURES = ['frame.json', 'patch.json', 'error.json'] as const

/**
 * Browser-shaped v1 GEOM binary envelope (`TextEncoder` UTF-8 + uint32 LE length). `@geometra/client`
 * intentionally exposes only decode — this mirrors the wire layout embedders use without `Buffer`.
 */
function encodeBinaryFrameJsonBrowserStyle(jsonUtf8: string): Uint8Array {
  const payload = new TextEncoder().encode(jsonUtf8)
  if (payload.length > MAX_V1_PAYLOAD_BYTES) {
    throw new RangeError(`payload length ${payload.length} exceeds v1 cap`)
  }
  const out = new Uint8Array(9 + payload.length)
  out.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
  new DataView(out.buffer).setUint32(5, payload.length, true)
  out.set(payload, 9)
  return out
}

describe('protocol binary conformance', () => {
  it('server and client share the v1 uint32 payload cap (binary-frame.ts comments)', () => {
    expect(MAX_V1_PAYLOAD_BYTES).toBe(MAX_V1_PAYLOAD_BYTES_CLIENT)
    expect(MAX_V1_PAYLOAD_BYTES).toBe(0xffff_ffff)
  })

  it('server isBinaryFrameBuffer and client isBinaryFrameArrayBuffer agree on the same views (header probe parity)', () => {
    const headerOnly = new Uint8Array([0x47, 0x45, 0x4f, 0x4d, 1, 0, 0, 0, 0])
    const encoded = encodeBinaryFrameJson('{}')
    const views: Uint8Array[] = [headerOnly, new Uint8Array(encoded)]
    const badMagic = new Uint8Array([0x00, 0x45, 0x4f, 0x4d, 1, 0, 0, 0, 0])
    const badVersion = new Uint8Array([0x47, 0x45, 0x4f, 0x4d, 2, 0, 0, 0, 0])
    views.push(badMagic, badVersion)
    for (const u8 of views) {
      expect(isBinaryFrameBuffer(u8)).toBe(isBinaryFrameArrayBufferClient(u8))
    }
  })

  it('server encodeBinaryFrameJson matches browser TextEncoder wire layout (byte-for-byte v1 envelope)', () => {
    const literals = ['{}', JSON.stringify({ surf: '🌊', mark: '\u202e' })]
    for (const asText of literals) {
      const server = encodeBinaryFrameJson(asText)
      const browser = encodeBinaryFrameJsonBrowserStyle(asText)
      expect(Buffer.from(browser).equals(server)).toBe(true)
      expect(decodeBinaryFrameJsonClient(browser.buffer)).toBe(asText)
    }
    for (const name of V1_FIXTURES) {
      const frame = JSON.parse(
        readFileSync(new URL(`../../../../fixtures/protocol/v1/${name}`, import.meta.url), 'utf8'),
      )
      const asText = JSON.stringify(frame)
      const server = encodeBinaryFrameJson(asText)
      const browser = encodeBinaryFrameJsonBrowserStyle(asText)
      expect(Buffer.from(browser).equals(server)).toBe(true)
    }
  })

  it.each(V1_FIXTURES)('binary envelope roundtrips v1/%s like text frames', name => {
    const frame = JSON.parse(
      readFileSync(new URL(`../../../../fixtures/protocol/v1/${name}`, import.meta.url), 'utf8'),
    )
    const asText = JSON.stringify(frame)
    const buf = encodeBinaryFrameJson(asText)
    expect(decodeBinaryFrameJson(buf)).toBe(asText)
    // Server (Node Buffer) and client (ArrayBuffer / view) decoders must agree on the v1 envelope.
    expect(decodeBinaryFrameJsonClient(buf)).toBe(asText)
  })

  it('server and client decoders agree on a v1 frame embedded in a larger buffer (non-zero byteOffset)', () => {
    const frame = JSON.parse(
      readFileSync(new URL(`../../../../fixtures/protocol/v1/patch.json`, import.meta.url), 'utf8'),
    )
    const asText = JSON.stringify(frame)
    const buf = encodeBinaryFrameJson(asText)
    const raw = new Uint8Array(buf)
    const prefix = 11
    const combined = new Uint8Array(prefix + raw.byteLength + 9)
    combined.set(raw, prefix)
    const view = combined.subarray(prefix, prefix + raw.byteLength)
    expect(decodeBinaryFrameJson(view)).toBe(asText)
    expect(decodeBinaryFrameJsonClient(view)).toBe(asText)
  })

  it('server and client reject the same truncated v1 header (declared payload longer than the view) with matching errors', () => {
    const headerOnly = new Uint8Array(9)
    headerOnly.set([0x47, 0x45, 0x4f, 0x4d, 1], 0)
    new DataView(headerOnly.buffer).setUint32(5, 1, true)
    expect(() => decodeBinaryFrameJson(headerOnly)).toThrow('Truncated binary frame payload')
    expect(() => decodeBinaryFrameJsonClient(headerOnly)).toThrow('Truncated binary frame payload')
  })
})

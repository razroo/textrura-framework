import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  decodeBinaryFrameJson as decodeBinaryFrameJsonClient,
  MAX_V1_PAYLOAD_BYTES as MAX_V1_PAYLOAD_BYTES_CLIENT,
} from '../../../client/src/binary-frame.js'
import {
  encodeBinaryFrameJson,
  decodeBinaryFrameJson,
  MAX_V1_PAYLOAD_BYTES,
} from '../binary-frame.js'

const V1_FIXTURES = ['frame.json', 'patch.json', 'error.json'] as const

describe('protocol binary conformance', () => {
  it('server and client share the v1 uint32 payload cap (binary-frame.ts comments)', () => {
    expect(MAX_V1_PAYLOAD_BYTES).toBe(MAX_V1_PAYLOAD_BYTES_CLIENT)
    expect(MAX_V1_PAYLOAD_BYTES).toBe(0xffff_ffff)
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
})

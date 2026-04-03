import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { decodeBinaryFrameJson as decodeBinaryFrameJsonClient } from '../../../client/src/binary-frame.js'
import { encodeBinaryFrameJson, decodeBinaryFrameJson } from '../binary-frame.js'

const V1_FIXTURES = ['frame.json', 'patch.json', 'error.json'] as const

describe('protocol binary conformance', () => {
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
})

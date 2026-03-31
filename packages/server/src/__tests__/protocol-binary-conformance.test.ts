import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { encodeBinaryFrameJson, decodeBinaryFrameJson } from '../binary-frame.js'

describe('protocol binary conformance', () => {
  it('binary envelope decodes the same JSON as text fixtures', () => {
    const frame = JSON.parse(
      readFileSync(new URL('../../../../fixtures/protocol/v1/frame.json', import.meta.url), 'utf8'),
    )
    const asText = JSON.stringify(frame)
    const buf = encodeBinaryFrameJson(asText)
    expect(decodeBinaryFrameJson(buf)).toBe(asText)
  })
})

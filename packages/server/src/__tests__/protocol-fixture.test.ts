import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isProtocolCompatible } from '../protocol.js'
import type { ServerMessage } from '../protocol.js'

function readJSON<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

describe('server protocol fixtures', () => {
  it('accepts shared v1 fixture shapes', () => {
    const frame = readJSON<Extract<ServerMessage, { type: 'frame' }>>(new URL('../../../../fixtures/protocol/v1/frame.json', import.meta.url).pathname)
    const patch = readJSON<Extract<ServerMessage, { type: 'patch' }>>(new URL('../../../../fixtures/protocol/v1/patch.json', import.meta.url).pathname)
    const error = readJSON<Extract<ServerMessage, { type: 'error' }>>(new URL('../../../../fixtures/protocol/v1/error.json', import.meta.url).pathname)

    expect(frame.type).toBe('frame')
    expect(patch.type).toBe('patch')
    expect(error.type).toBe('error')
    expect(isProtocolCompatible(frame.protocolVersion, 1)).toBe(true)
    expect(isProtocolCompatible(patch.protocolVersion, 1)).toBe(true)
    expect(isProtocolCompatible(error.protocolVersion, 1)).toBe(true)
  })
})

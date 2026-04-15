import { describe, expect, it } from 'vitest'
import { parseHttpPageUrl } from '../page-url.js'

describe('parseHttpPageUrl', () => {
  it('parses full URLs unchanged', () => {
    expect(parseHttpPageUrl('http://localhost:5173/').href).toBe('http://localhost:5173/')
    expect(parseHttpPageUrl('https://example.com/path').href).toBe('https://example.com/path')
  })

  it('prepends https when the scheme is omitted', () => {
    expect(parseHttpPageUrl('example.com').href).toBe('https://example.com/')
    expect(parseHttpPageUrl('localhost:8080').href).toBe('https://localhost:8080/')
  })

  it('preserves ws(s) URLs for direct WebSocket mode (caller branches on scheme)', () => {
    expect(parseHttpPageUrl('ws://127.0.0.1:9000/geometra-ws').href).toBe('ws://127.0.0.1:9000/geometra-ws')
    expect(parseHttpPageUrl('wss://host/geometra-ws').href).toBe('wss://host/geometra-ws')
  })
})

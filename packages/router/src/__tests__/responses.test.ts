import { describe, expect, it } from 'vitest'
import {
  isRedirectResult,
  isResponseResult,
  json,
  redirect,
  response,
} from '../responses.js'

describe('redirect', () => {
  it('returns a redirect result with replace undefined by default', () => {
    expect(redirect('/a')).toEqual({ kind: 'redirect', to: '/a' })
  })

  it('passes replace when set', () => {
    expect(redirect('/b', { replace: true })).toEqual({
      kind: 'redirect',
      to: '/b',
      replace: true,
    })
  })

  it('includes replace: false when callers pass it explicitly (distinct from omitting replace)', () => {
    expect(redirect('/c', { replace: false })).toEqual({
      kind: 'redirect',
      to: '/c',
      replace: false,
    })
  })
})

describe('response', () => {
  it('wraps data with optional status and headers', () => {
    expect(response({ ok: true })).toEqual({ kind: 'response', data: { ok: true } })
    expect(response(null, { status: 204 })).toEqual({
      kind: 'response',
      status: 204,
      data: null,
    })
    expect(response('x', { headers: { 'x-foo': 'bar' } })).toEqual({
      kind: 'response',
      headers: { 'x-foo': 'bar' },
      data: 'x',
    })
  })
})

describe('json', () => {
  it('sets content-type and merges caller headers', () => {
    expect(json({ a: 1 })).toEqual({
      kind: 'response',
      headers: { 'content-type': 'application/json' },
      data: { a: 1 },
    })
    expect(
      json({ b: 2 }, {
        status: 201,
        headers: { 'cache-control': 'no-store' },
      }),
    ).toEqual({
      kind: 'response',
      status: 201,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
      data: { b: 2 },
    })
  })

  it('lets explicit content-type override the default', () => {
    const r = json({}, { headers: { 'content-type': 'application/json; charset=utf-8' } })
    expect(r.headers?.['content-type']).toBe('application/json; charset=utf-8')
  })
})

describe('isRedirectResult', () => {
  it('narrows redirect-shaped objects', () => {
    expect(isRedirectResult({ kind: 'redirect', to: '/x' })).toBe(true)
    expect(isRedirectResult(null)).toBe(false)
    expect(isRedirectResult(undefined)).toBe(false)
    expect(isRedirectResult('redirect')).toBe(false)
    expect(isRedirectResult({ kind: 'response', data: 1 })).toBe(false)
    expect(isRedirectResult({ kind: 'redirect' })).toBe(true)
  })

  it('returns false when kind is missing or wrong (arrays, functions, primitives, boxed numbers)', () => {
    expect(isRedirectResult([])).toBe(false)
    expect(isRedirectResult(['redirect'])).toBe(false)
    expect(isRedirectResult(() => {})).toBe(false)
    expect(isRedirectResult(0)).toBe(false)
    expect(isRedirectResult(Object(0))).toBe(false)
  })
})

describe('isResponseResult', () => {
  it('narrows response-shaped objects', () => {
    expect(isResponseResult({ kind: 'response', data: 1 })).toBe(true)
    expect(isResponseResult(null)).toBe(false)
    expect(isResponseResult({ kind: 'redirect', to: '/' })).toBe(false)
    expect(isResponseResult({ kind: 'response' })).toBe(true)
  })

  it('returns false when kind is missing or wrong (arrays, functions, primitives, boxed numbers)', () => {
    expect(isResponseResult([])).toBe(false)
    expect(isResponseResult(['response'])).toBe(false)
    expect(isResponseResult(() => {})).toBe(false)
    expect(isResponseResult(0)).toBe(false)
    expect(isResponseResult(Object(0))).toBe(false)
  })
})

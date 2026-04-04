import { describe, expect, it } from 'vitest'
import { comparePatternSpecificity, scorePathPattern } from '../ranking.js'
import { matchRouteTree, type RouteNode } from '../tree.js'

describe('route ranking', () => {
  it('scores static routes higher than dynamic and splat routes', () => {
    expect(scorePathPattern('/users/settings')).toBeGreaterThan(scorePathPattern('/users/:id'))
    expect(scorePathPattern('/users/:id')).toBeGreaterThan(scorePathPattern('/users/*'))
  })

  it('prefers more specific routes in comparisons', () => {
    expect(comparePatternSpecificity('/users/settings', '/users/:id')).toBeLessThan(0)
    expect(comparePatternSpecificity('/users/:id', '/users/*')).toBeLessThan(0)
  })

  it('tie-breaks equal scores by preferring deeper patterns', () => {
    expect(scorePathPattern('/a/:b')).toBe(scorePathPattern('/x?/y?/z?'))
    expect(comparePatternSpecificity('/a/:b', '/x?/y?/z?')).toBeGreaterThan(0)
    expect(comparePatternSpecificity('/x?/y?/z?', '/a/:b')).toBeLessThan(0)
  })

  it('scores optional dynamic and static segments below required counterparts', () => {
    expect(scorePathPattern('/users/:id')).toBeGreaterThan(scorePathPattern('/users/:id?'))
    expect(scorePathPattern('/project/archive/:id')).toBeGreaterThan(
      scorePathPattern('/project/archive?/:id'),
    )
  })

  it('uses deterministic ranking for ambiguous tree matches', () => {
    const routes: RouteNode[] = [
      { id: 'fallback', path: '/users/*' },
      { id: 'dynamic', path: '/users/:id' },
      { id: 'static', path: '/users/settings' },
    ]

    const match = matchRouteTree(routes, '/users/settings')
    expect(match?.matches[0]?.id).toBe('static')
  })

  it('treats doubled slashes as extra static segments (parity with matchPath segment split)', () => {
    expect(scorePathPattern('/foo//bar')).toBeGreaterThan(scorePathPattern('/foo/bar'))
    expect(comparePatternSpecificity('/foo//bar', '/foo/bar')).toBeLessThan(0)
  })

  it('scores empty and slash-only patterns as zero (same trim as buildPath / matchPath)', () => {
    expect(scorePathPattern('')).toBe(0)
    expect(scorePathPattern('/')).toBe(0)
    expect(scorePathPattern('///')).toBe(0)
  })

  it('scores a lone splat segment (anonymous *) as least specific single segment', () => {
    expect(scorePathPattern('*')).toBe(0)
    expect(scorePathPattern('/*')).toBe(0)
    expect(scorePathPattern('/users/:id')).toBeGreaterThan(scorePathPattern('/*'))
  })

  it('returns 0 from comparePatternSpecificity when score and depth tie (e.g. two static peers)', () => {
    expect(comparePatternSpecificity('/a', '/b')).toBe(0)
    expect(comparePatternSpecificity('/x/:id', '/y/:slug')).toBe(0)
  })
})

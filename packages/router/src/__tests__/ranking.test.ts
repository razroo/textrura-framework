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

  it('uses deterministic ranking for ambiguous tree matches', () => {
    const routes: RouteNode[] = [
      { id: 'fallback', path: '/users/*' },
      { id: 'dynamic', path: '/users/:id' },
      { id: 'static', path: '/users/settings' },
    ]

    const match = matchRouteTree(routes, '/users/settings')
    expect(match?.matches[0]?.id).toBe('static')
  })
})

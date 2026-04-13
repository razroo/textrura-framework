import { describe, expect, it } from 'vitest'
import { matchRouteTree, renderMatchedOutlet, type RouteNode } from '../tree.js'

describe('route tree matching', () => {
  it('returns null when the route table is empty', () => {
    expect(matchRouteTree([], '/')).toBeNull()
    expect(matchRouteTree([], '/any/path')).toBeNull()
  })

  it('returns null when no registered pattern matches the pathname', () => {
    const routes: RouteNode<string>[] = [{ id: 'about', path: '/about' }]
    expect(matchRouteTree(routes, '/missing')).toBeNull()
    expect(matchRouteTree(routes, '/about/extra')).toBeNull()
  })

  it('matches nested routes and accumulates params', () => {
    const routes: RouteNode<string>[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users',
            children: [{ id: 'user', path: ':id' }],
          },
        ],
      },
    ]

    const match = matchRouteTree(routes, '/users/42')
    expect(match).not.toBeNull()
    expect(match?.matches.map((route) => route.id)).toEqual(['root', 'users', 'user'])
    expect(match?.params).toEqual({ id: '42' })
  })

  it('supports layout routes with no path', () => {
    const routes: RouteNode<string>[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'layout',
            children: [{ id: 'dashboard', path: 'dashboard' }],
          },
        ],
      },
    ]

    const match = matchRouteTree(routes, '/dashboard')
    expect(match?.matches.map((route) => route.id)).toEqual(['root', 'layout', 'dashboard'])
  })

  it('composes matched outlet from leaf to root render functions', () => {
    const routes: RouteNode<string>[] = [
      {
        id: 'root',
        path: '/',
        render: ({ outlet }) => `root(${outlet ?? ''})`,
        children: [
          {
            id: 'shell',
            render: ({ outlet }) => `shell(${outlet ?? ''})`,
            children: [
              {
                id: 'leaf',
                path: 'team/:teamId',
                render: ({ params }) => `leaf(${params.teamId})`,
              },
            ],
          },
        ],
      },
    ]

    const match = matchRouteTree(routes, '/team/blue')
    expect(match).not.toBeNull()
    const output = renderMatchedOutlet(match!, '/team/blue')
    expect(output).toBe('root(shell(leaf(blue)))')
  })
})

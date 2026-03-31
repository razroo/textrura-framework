import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from '../history.js'
import { createRouter, type RouterState } from '../router.js'
import type { RouteNode } from '../tree.js'

describe('createRouter lifecycle', () => {
  const routes: RouteNode[] = [
    {
      id: 'root',
      path: '/',
      children: [{ id: 'users', path: 'users/:id' }],
    },
  ]

  it('starts and emits initial route state', () => {
    const history = createMemoryHistory({ initialEntries: ['/users/10'] })
    const router = createRouter({ routes, history })

    const seen: RouterState[] = []
    const unsubscribe = router.subscribe((state) => seen.push(state))

    router.start()

    expect(seen.length).toBeGreaterThan(0)
    const latest = seen[seen.length - 1]
    expect(latest?.location.pathname).toBe('/users/10')
    expect(latest?.matches?.params).toEqual({ id: '10' })

    unsubscribe()
    router.dispose()
  })

  it('navigates with push by default', () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routes, history })
    router.start()

    router.navigate('/users/42')

    const state = router.getState()
    expect(state.location.pathname).toBe('/users/42')
    expect(state.matches?.params).toEqual({ id: '42' })
    expect(state.navigation).toBe('idle')
  })

  it('supports replace navigation', () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const router = createRouter({ routes, history })
    router.start()

    router.navigate('/users/2', { replace: true })
    history.go(-1)

    expect(router.getState().location.pathname).toBe('/users/2')
  })

  it('stops reacting after dispose', () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const router = createRouter({ routes, history })
    router.start()
    router.dispose()

    history.push('/users/2')

    expect(router.getState().location.pathname).toBe('/users/1')
  })
})

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

  it('navigates with push by default', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routes, history })
    router.start()

    await router.navigate('/users/42')

    const state = router.getState()
    expect(state.location.pathname).toBe('/users/42')
    expect(state.matches?.params).toEqual({ id: '42' })
    expect(state.navigation).toBe('idle')
  })

  it('supports replace navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const router = createRouter({ routes, history })
    router.start()

    await router.navigate('/users/2', { replace: true })
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

  it('exposes active route helper', () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const router = createRouter({ routes, history })
    router.start()

    expect(router.isActive('/users/1')).toBe(true)
    expect(router.isActive('/users/2')).toBe(false)
  })

  it('exposes pending route helper during in-flight navigation', async () => {
    const pushed: string[] = []
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const realPush = history.push.bind(history)
    history.push = (to: string) => {
      pushed.push(to)
      // Delay actual history update to simulate in-flight navigation.
    }

    const router = createRouter({ routes, history })
    router.start()
    const navigatePromise = router.navigate('/users/9')

    expect(router.isPending('/users/9')).toBe(true)
    expect(router.isPending('/users/1')).toBe(false)

    // Complete pending navigation and ensure pending state clears.
    realPush(pushed[0]!)
    await navigatePromise
    expect(router.isPending('/users/9')).toBe(false)
    expect(router.isActive('/users/9')).toBe(true)
  })

  it('supports blockers that can cancel navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const router = createRouter({ routes, history })
    router.start()

    const unblock = router.addBlocker(({ to }) => to !== '/users/2')
    const blocked = await router.navigate('/users/2')
    const allowed = await router.navigate('/users/3')

    expect(blocked).toBe(false)
    expect(allowed).toBe(true)
    expect(router.getState().location.pathname).toBe('/users/3')

    unblock()
  })

  it('supports async blockers for transition confirmation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const router = createRouter({ routes, history })
    router.start()

    router.addBlocker(async ({ to }) => {
      await Promise.resolve()
      return to === '/users/4'
    })

    const blocked = await router.navigate('/users/5')
    const allowed = await router.navigate('/users/4')

    expect(blocked).toBe(false)
    expect(allowed).toBe(true)
    expect(router.getState().location.pathname).toBe('/users/4')
  })
})

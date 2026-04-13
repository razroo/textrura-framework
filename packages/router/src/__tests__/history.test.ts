import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBrowserHistory, createMemoryHistory, type HistoryUpdate } from '../history.js'

describe('history adapters', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('memory history supports push/replace/go', () => {
    const history = createMemoryHistory({ initialEntries: ['/a'] })

    history.push('/b')
    expect(history.location.pathname).toBe('/b')

    history.replace('/c')
    expect(history.location.pathname).toBe('/c')

    history.go(-1)
    expect(history.location.pathname).toBe('/a')
  })

  it('memory history clamps initialIndex to stack bounds', () => {
    const low = createMemoryHistory({ initialEntries: ['/a', '/b'], initialIndex: -99 })
    expect(low.location.pathname).toBe('/a')

    const high = createMemoryHistory({ initialEntries: ['/a', '/b'], initialIndex: 999 })
    expect(high.location.pathname).toBe('/b')
  })

  it('memory history treats non-finite initialIndex like the default (last entry)', () => {
    const nan = createMemoryHistory({ initialEntries: ['/a', '/b'], initialIndex: Number.NaN })
    expect(nan.location.pathname).toBe('/b')

    const posInf = createMemoryHistory({ initialEntries: ['/a', '/b'], initialIndex: Number.POSITIVE_INFINITY })
    expect(posInf.location.pathname).toBe('/b')

    const negInf = createMemoryHistory({ initialEntries: ['/a', '/b'], initialIndex: Number.NEGATIVE_INFINITY })
    expect(negInf.location.pathname).toBe('/b')
  })

  it('memory history treats non-number initialIndex like the default (last entry)', () => {
    const asStr = createMemoryHistory({ initialEntries: ['/a', '/b'], initialIndex: '1' as never })
    expect(asStr.location.pathname).toBe('/b')

    const asBigInt = createMemoryHistory({ initialEntries: ['/a', '/b'], initialIndex: 0n as never })
    expect(asBigInt.location.pathname).toBe('/b')
  })

  it('memory history treats empty initialEntries as a single "/" entry (documented default)', () => {
    const history = createMemoryHistory({ initialEntries: [] })
    expect(history.location.pathname).toBe('/')
    history.push('/x')
    expect(history.location.pathname).toBe('/x')
    history.go(-1)
    expect(history.location.pathname).toBe('/')
  })

  it('memory history does not notify listeners when go(0) is a no-op', () => {
    const history = createMemoryHistory({ initialEntries: ['/a'] })
    const updates: HistoryUpdate[] = []
    history.listen((u) => updates.push(u))
    history.go(0)
    expect(updates).toEqual([])
  })

  it('memory history treats non-finite delta as a no-op (does not corrupt stack index)', () => {
    const history = createMemoryHistory({ initialEntries: ['/a', '/b'] })
    expect(history.location.pathname).toBe('/b')
    history.go(Number.NaN)
    expect(history.location.pathname).toBe('/b')
    history.go(Number.POSITIVE_INFINITY)
    expect(history.location.pathname).toBe('/b')
    history.go(Number.NEGATIVE_INFINITY)
    expect(history.location.pathname).toBe('/b')
    history.go(-1)
    expect(history.location.pathname).toBe('/a')
  })

  it('memory history treats bigint and string delta as no-ops (Number.isFinite guard; no BigInt + number)', () => {
    const history = createMemoryHistory({ initialEntries: ['/a', '/b'] })
    expect(history.location.pathname).toBe('/b')
    expect(() => history.go(0n as never)).not.toThrow()
    expect(history.location.pathname).toBe('/b')
    expect(() => history.go(1n as never)).not.toThrow()
    expect(history.location.pathname).toBe('/b')
    expect(() => history.go('1' as never)).not.toThrow()
    expect(history.location.pathname).toBe('/b')
    history.go(-1)
    expect(history.location.pathname).toBe('/a')
  })

  it('memory history treats boxed number delta as no-op (Number.isFinite is false for boxed numbers)', () => {
    const history = createMemoryHistory({ initialEntries: ['/a', '/b'] })
    expect(history.location.pathname).toBe('/b')
    expect(() => history.go(Object(1) as never)).not.toThrow()
    expect(history.location.pathname).toBe('/b')
    history.go(-1)
    expect(history.location.pathname).toBe('/a')
  })

  it('memory history notifies listeners with correct action for push, replace, and go', () => {
    const history = createMemoryHistory({ initialEntries: ['/a'] })
    const updates: HistoryUpdate[] = []
    history.listen((u) => updates.push(u))

    history.push('/b')
    expect(updates.at(-1)).toMatchObject({ action: 'push', location: { pathname: '/b' } })

    history.replace('/c')
    expect(updates.at(-1)).toMatchObject({ action: 'replace', location: { pathname: '/c' } })

    history.go(-1)
    expect(updates.at(-1)).toMatchObject({ action: 'pop', location: { pathname: '/a' } })
  })

  it('memory history delivers updates to multiple listeners until each unsubscribes', () => {
    const history = createMemoryHistory({ initialEntries: ['/a'] })
    const first: HistoryUpdate[] = []
    const second: HistoryUpdate[] = []
    const off1 = history.listen((u) => first.push(u))
    const off2 = history.listen((u) => second.push(u))

    history.push('/b')
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)

    off1()
    history.push('/c')
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(2)

    off2()
    history.push('/d')
    expect(second).toHaveLength(2)
  })

  it('throws when createBrowserHistory has no injected window and global window is missing', () => {
    vi.stubGlobal('window', undefined)
    expect(() => createBrowserHistory()).toThrow('createBrowserHistory requires a browser window')
  })

  it('browser history uses pushState/replaceState and popstate listener', () => {
    let pathname = '/start'
    let search = ''
    let hash = ''
    const popListeners = new Set<() => void>()
    const updates: HistoryUpdate[] = []
    const goCalls: number[] = []

    const windowStub = {
      location: {
        get pathname() {
          return pathname
        },
        get search() {
          return search
        },
        get hash() {
          return hash
        },
      },
      history: {
        pushState(_state: unknown, _title: string, href: string) {
          const url = new URL(href, 'https://geometra.local')
          pathname = url.pathname
          search = url.search
          hash = url.hash
        },
        replaceState(_state: unknown, _title: string, href: string) {
          const url = new URL(href, 'https://geometra.local')
          pathname = url.pathname
          search = url.search
          hash = url.hash
        },
        go(delta: number) {
          goCalls.push(delta)
        },
      },
      addEventListener(event: string, handler: () => void) {
        if (event === 'popstate') popListeners.add(handler)
      },
      removeEventListener(event: string, handler: () => void) {
        if (event === 'popstate') popListeners.delete(handler)
      },
    } as unknown as Pick<Window, 'location' | 'history' | 'addEventListener' | 'removeEventListener'>

    const history = createBrowserHistory({ window: windowStub })
    const unsubscribe = history.listen((update) => updates.push(update))

    history.push('/users/1?tab=profile#top')
    expect(history.location).toEqual({ pathname: '/users/1', search: '?tab=profile', hash: '#top' })

    history.replace('/users/2')
    expect(history.location).toEqual({ pathname: '/users/2', search: '', hash: '' })

    history.go(-1)
    expect(goCalls).toEqual([-1])

    history.go(Number.POSITIVE_INFINITY)
    history.go(Number.NaN)
    expect(goCalls).toEqual([-1])

    for (const listener of popListeners) listener()
    expect(updates.at(-1)?.action).toBe('pop')
    expect(updates.at(-1)?.location.pathname).toBe('/users/2')

    unsubscribe()
    expect(popListeners.size).toBe(0)
  })
})

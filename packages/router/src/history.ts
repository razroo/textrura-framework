/** Parsed location slice used by {@link HistoryAdapter} (pathname, query string, fragment). */
export type RouterLocation = {
  pathname: string
  search: string
  hash: string
}

/**
 * Emitted by {@link HistoryAdapter.listen} after navigation.
 * Browser history uses `'pop'` for both `history.go` and the `popstate` event; memory history uses `'pop'` for `go` only.
 */
export type HistoryUpdate = {
  location: RouterLocation
  action: 'push' | 'replace' | 'pop'
}

/** Returned from {@link HistoryAdapter.listen}; call to stop receiving updates. */
export type Unsubscribe = () => void

/**
 * Minimal history surface for the router: imperative navigation plus subscription.
 * String arguments to {@link HistoryAdapter.push} / {@link HistoryAdapter.replace} are parsed with `new URL(to, base)`
 * (relative paths resolve against an internal base); results normalize empty pathname to `'/'`.
 */
export interface HistoryAdapter {
  readonly location: RouterLocation
  push(to: string): void
  replace(to: string): void
  go(delta: number): void
  listen(listener: (update: HistoryUpdate) => void): Unsubscribe
}

/** Optional injection of a browser-like `window` (tests, non-DOM hosts). */
export type BrowserHistoryOptions = {
  window?: Pick<Window, 'location' | 'history' | 'addEventListener' | 'removeEventListener'>
}

function parseToLocation(to: string): RouterLocation {
  const url = new URL(to, 'https://geometra.local')
  return {
    pathname: url.pathname || '/',
    search: url.search,
    hash: url.hash,
  }
}

function locationFromWindow(windowLike: Pick<Window, 'location'>): RouterLocation {
  return {
    pathname: windowLike.location.pathname || '/',
    search: windowLike.location.search || '',
    hash: windowLike.location.hash || '',
  }
}

type MemoryHistoryOptions = {
  initialEntries?: string[]
  initialIndex?: number
}

/**
 * In-memory stack for tests, SSR previews, and non-browser environments.
 *
 * - Empty `initialEntries` becomes a single `"/"` entry.
 * - `initialIndex` is clamped to the stack; default is the last entry.
 * - `go(0)` does not notify listeners.
 * - Non-finite `delta` (`NaN`, `±Infinity`) is a no-op (does not move the index or notify).
 * - Values that are not primitive finite numbers (`bigint`, strings, objects, etc.) are also no-ops so
 *   `index + delta` never mixes types (BigInt + number throws).
 */
export function createMemoryHistory(options: MemoryHistoryOptions = {}): HistoryAdapter {
  const entries = (options.initialEntries ?? ['/']).map(parseToLocation)
  let index = Math.min(
    Math.max(options.initialIndex ?? entries.length - 1, 0),
    Math.max(entries.length - 1, 0),
  )
  if (entries.length === 0) {
    entries.push(parseToLocation('/'))
    index = 0
  }

  const listeners = new Set<(update: HistoryUpdate) => void>()
  const notify = (action: HistoryUpdate['action']): void => {
    const location = entries[index]
    if (!location) return
    const update: HistoryUpdate = { location, action }
    for (const listener of listeners) listener(update)
  }

  return {
    get location() {
      return entries[index] ?? parseToLocation('/')
    },
    push(to: string) {
      const next = parseToLocation(to)
      entries.splice(index + 1)
      entries.push(next)
      index = entries.length - 1
      notify('push')
    },
    replace(to: string) {
      entries[index] = parseToLocation(to)
      notify('replace')
    },
    go(delta: number) {
      if (!Number.isFinite(delta)) return
      const sum = index + delta
      if (!Number.isFinite(sum)) return
      const nextIndex = Math.max(0, Math.min(sum, entries.length - 1))
      if (nextIndex === index) return
      index = nextIndex
      notify('pop')
    },
    listen(listener: (update: HistoryUpdate) => void): Unsubscribe {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/**
 * Wraps the real (or injected) `window.history` and `popstate`.
 *
 * `push` / `replace` update `history` state and notify listeners; `go` delegates to `history.go` (async relative to `popstate`).
 * Non-finite `delta` is ignored so corrupt host data never reaches the native history API.
 * Throws if no `window` is available unless {@link BrowserHistoryOptions.window} is provided.
 */
export function createBrowserHistory(options: BrowserHistoryOptions = {}): HistoryAdapter {
  const windowLike =
    options.window ??
    (typeof window !== 'undefined'
      ? window
      : null)

  if (!windowLike) {
    throw new Error('createBrowserHistory requires a browser window')
  }

  const listeners = new Set<(update: HistoryUpdate) => void>()
  const notify = (action: HistoryUpdate['action']): void => {
    const update: HistoryUpdate = {
      location: locationFromWindow(windowLike),
      action,
    }
    for (const listener of listeners) listener(update)
  }

  const onPopState = (): void => notify('pop')

  return {
    get location() {
      return locationFromWindow(windowLike)
    },
    push(to: string) {
      const next = parseToLocation(to)
      const href = `${next.pathname}${next.search}${next.hash}`
      windowLike.history.pushState(null, '', href)
      notify('push')
    },
    replace(to: string) {
      const next = parseToLocation(to)
      const href = `${next.pathname}${next.search}${next.hash}`
      windowLike.history.replaceState(null, '', href)
      notify('replace')
    },
    go(delta: number) {
      if (!Number.isFinite(delta)) return
      windowLike.history.go(delta)
    },
    listen(listener: (update: HistoryUpdate) => void): Unsubscribe {
      if (listeners.size === 0) {
        windowLike.addEventListener('popstate', onPopState)
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          windowLike.removeEventListener('popstate', onPopState)
        }
      }
    },
  }
}

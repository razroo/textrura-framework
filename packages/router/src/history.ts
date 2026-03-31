export type RouterLocation = {
  pathname: string
  search: string
  hash: string
}

export type HistoryUpdate = {
  location: RouterLocation
  action: 'push' | 'replace' | 'pop'
}

export type Unsubscribe = () => void

export interface HistoryAdapter {
  readonly location: RouterLocation
  push(to: string): void
  replace(to: string): void
  go(delta: number): void
  listen(listener: (update: HistoryUpdate) => void): Unsubscribe
}

function parseToLocation(to: string): RouterLocation {
  const url = new URL(to, 'https://geometra.local')
  return {
    pathname: url.pathname || '/',
    search: url.search,
    hash: url.hash,
  }
}

type MemoryHistoryOptions = {
  initialEntries?: string[]
  initialIndex?: number
}

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
      const nextIndex = Math.max(0, Math.min(index + delta, entries.length - 1))
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

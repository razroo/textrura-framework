/** Minimal signals-based reactivity system. */

type Subscriber = () => void

let currentSubscriber: Subscriber | null = null
const batchQueue = new Set<Subscriber>()
let batchDepth = 0

/** Per-subscriber cleanups so re-runs drop stale signal/computed edges (conditional reads). */
const subscriberCleanups = new WeakMap<Subscriber, Set<() => void>>()

function trackDependency(cleanup: () => void): void {
  if (!currentSubscriber) return
  let set = subscriberCleanups.get(currentSubscriber)
  if (!set) {
    set = new Set()
    subscriberCleanups.set(currentSubscriber, set)
  }
  set.add(cleanup)
}

function releaseSubscriber(sub: Subscriber): void {
  const cleanups = subscriberCleanups.get(sub)
  if (!cleanups || cleanups.size === 0) return
  for (const c of cleanups) c()
  cleanups.clear()
}

/** Batch multiple signal updates into a single flush. */
export function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) {
      const queued = [...batchQueue]
      batchQueue.clear()
      for (const sub of queued) sub()
    }
  }
}

export interface Signal<T> {
  readonly value: T
  set(value: T): void
  peek(): T
}

/** Create a reactive signal. */
export function signal<T>(initial: T): Signal<T> {
  let value = initial
  const subscribers = new Set<Subscriber>()

  return {
    get value(): T {
      if (currentSubscriber) {
        const sub = currentSubscriber
        subscribers.add(sub)
        trackDependency(() => {
          subscribers.delete(sub)
        })
      }
      return value
    },
    set(next: T) {
      if (Object.is(value, next)) return
      value = next
      for (const sub of subscribers) {
        if (batchDepth > 0) {
          batchQueue.add(sub)
        } else {
          sub()
        }
      }
    },
    peek(): T {
      return value
    },
  }
}

export interface Computed<T> {
  readonly value: T
}

/** Create a derived computation that re-runs when dependencies change. */
export function computed<T>(fn: () => T): Computed<T> {
  let cached: T
  let dirty = true
  const subscribers = new Set<Subscriber>()

  const recompute: Subscriber = () => {
    dirty = true
    for (const sub of subscribers) {
      if (batchDepth > 0) {
        batchQueue.add(sub)
      } else {
        sub()
      }
    }
  }

  return {
    get value(): T {
      if (dirty) {
        releaseSubscriber(recompute)
        const prev = currentSubscriber
        currentSubscriber = recompute
        try {
          cached = fn()
        } finally {
          currentSubscriber = prev
        }
        dirty = false
      }
      if (currentSubscriber) {
        const sub = currentSubscriber
        subscribers.add(sub)
        trackDependency(() => {
          subscribers.delete(sub)
        })
      }
      return cached
    },
  }
}

/** Run a side effect whenever its signal dependencies change. Returns a dispose function. */
export function effect(fn: () => void): () => void {
  let disposed = false

  const run: Subscriber = () => {
    if (disposed) return
    releaseSubscriber(run)
    const prev = currentSubscriber
    currentSubscriber = run
    try {
      fn()
    } finally {
      currentSubscriber = prev
    }
  }

  run()
  return () => {
    disposed = true
    releaseSubscriber(run)
  }
}

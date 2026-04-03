/**
 * Minimal signals-based reactivity for Geometra trees and apps.
 *
 * Reading `signal` / `computed` `.value` inside an active `effect` or `computed`
 * registers a dependency; `peek()` reads without subscribing. `batch` defers
 * subscriber flushes so multiple writes coalesce into one downstream pass.
 */

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

/**
 * Run `fn` while deferring subscriber notifications. Updates flush once the
 * outermost `batch` ends (including after `fn` throws). Nested `batch` calls
 * share the same deferral depth.
 */
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

/** Writable reactive cell. */
export interface Signal<T> {
  /** Current value; subscribes the active `effect` / `computed` when read. */
  readonly value: T
  /**
   * Replace the stored value. Notifies dependents when the next value is not
   * `Object.is`-equal to the current one (so `NaN` is stable; `+0` and `-0` differ).
   */
  set(value: T): void
  /** Read the value without registering a dependency. */
  peek(): T
}

/**
 * Create a signal with initial value `initial`.
 */
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
      // Notify a stable snapshot so unsubscribe/resubscribe during a run
      // cannot perturb the current flush.
      for (const sub of [...subscribers]) {
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

/** Read-only derived value; recomputes when dependencies used in the last run change. */
export interface Computed<T> {
  /**
   * Current derived value. Recomputes lazily when dirty; subscribes the active
   * subscriber when read (except while the computed body is running).
   */
  readonly value: T
}

/**
 * Create a memoized computation from `fn`. Dependencies are the signals and
 * computeds read while `fn` ran on the last evaluation; conditional reads drop
 * stale edges on the next run.
 */
export function computed<T>(fn: () => T): Computed<T> {
  let cached: T
  let dirty = true
  const subscribers = new Set<Subscriber>()

  const recompute: Subscriber = () => {
    dirty = true
    for (const sub of [...subscribers]) {
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

/**
 * Run a side effect whenever its signal dependencies change. Returns a dispose function.
 * If `fn` throws on the **first** run, the error propagates and no dispose function is returned.
 * If `fn` throws on a later run (after a dependency update), the error propagates to the code
 * that triggered the flush (e.g. `signal.set`); remaining subscribers in the same flush are skipped.
 */
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

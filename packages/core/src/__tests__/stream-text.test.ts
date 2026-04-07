import { describe, it, expect } from 'vitest'
import { streamText } from '../stream-text.js'
import { batch, effect } from '../signals.js'

describe('streamText', () => {
  it('starts with initial value', () => {
    const s = streamText('hello')
    expect(s.value).toBe('hello')
  })

  it('starts empty by default', () => {
    const s = streamText()
    expect(s.value).toBe('')
  })

  it('treats non-string initial as empty (mistyped / hostile host data)', () => {
    expect(streamText(null as unknown as string).value).toBe('')
    expect(streamText(undefined as unknown as string).value).toBe('')
    expect(streamText(0 as unknown as string).value).toBe('')
    expect(streamText({} as unknown as string).value).toBe('')
    expect(streamText(1n as unknown as string).value).toBe('')
    expect(streamText(Symbol('seed') as unknown as string).value).toBe('')
  })

  it('treats boxed String initial as empty (typeof is object, not string)', () => {
    expect(streamText(Object('hello') as unknown as string).value).toBe('')
  })

  it('append accumulates text after microtask flush', async () => {
    const s = streamText()
    s.append('Hello ')
    s.append('world')
    // Before microtask, signal still has old value
    expect(s.signal.peek()).toBe('')
    // After microtask, coalesced update fires
    await Promise.resolve()
    expect(s.value).toBe('Hello world')
  })

  it('set replaces text synchronously', () => {
    const s = streamText('old')
    s.set('new')
    expect(s.value).toBe('new')
  })

  it('set() with an Object.is-equal string does not notify subscribers again', () => {
    const s = streamText('same')
    let runs = 0
    effect(() => {
      void s.signal.value
      runs++
    })
    expect(runs).toBe(1)
    s.set('same')
    expect(runs).toBe(1)
    expect(s.value).toBe('same')
  })

  it('clear resets to empty', () => {
    const s = streamText('some text')
    s.clear()
    expect(s.value).toBe('')
  })

  it('done flushes remaining buffer synchronously', async () => {
    const s = streamText()
    s.append('final')
    s.done()
    // done() flushes synchronously, no need to wait
    expect(s.value).toBe('final')
    expect(s.streaming).toBe(false)
  })

  it('done() after append does not double-notify the signal when the coalescing microtask runs', async () => {
    const s = streamText()
    let runs = 0
    effect(() => {
      void s.signal.value
      runs++
    })
    expect(runs).toBe(1)
    s.append('x')
    expect(s.signal.peek()).toBe('')
    s.done()
    expect(s.value).toBe('x')
    expect(s.streaming).toBe(false)
    // One notification from done()'s synchronous s.set(buffer); pending microtask must not flush a second
    // identical value (signal.set uses Object.is dedupe).
    expect(runs).toBe(2)
    await Promise.resolve()
    expect(s.value).toBe('x')
    expect(runs).toBe(2)
  })

  it('streaming is true initially and false after done()', () => {
    const s = streamText()
    expect(s.streaming).toBe(true)
    s.done()
    expect(s.streaming).toBe(false)
  })

  it('clear resets streaming to true', () => {
    const s = streamText()
    s.done()
    expect(s.streaming).toBe(false)
    s.clear()
    expect(s.streaming).toBe(true)
  })

  it('coalesces rapid appends into one signal update', async () => {
    const s = streamText()
    let updateCount = 0
    effect(() => {
      void s.value
      updateCount++
    })
    // effect runs once on creation
    expect(updateCount).toBe(1)

    // Rapid appends
    s.append('a')
    s.append('b')
    s.append('c')

    await Promise.resolve()
    // Should have coalesced into one signal update
    expect(updateCount).toBe(2)
    expect(s.value).toBe('abc')
  })

  it('appends inside a root batch still notify only after the microtask (buffer grows sync; signal deferred)', async () => {
    const s = streamText()
    let runs = 0
    effect(() => {
      void s.value
      runs++
    })
    expect(runs).toBe(1)
    batch(() => {
      s.append('a')
      s.append('b')
      expect(s.signal.peek()).toBe('')
    })
    expect(runs).toBe(1)
    await Promise.resolve()
    expect(runs).toBe(2)
    expect(s.value).toBe('ab')
  })

  it('ignores empty append', async () => {
    const s = streamText('x')
    s.append('')
    await Promise.resolve()
    expect(s.value).toBe('x')
  })

  it('ignores non-string append without throwing (hostile / mistyped chunks)', async () => {
    const s = streamText('x')
    s.append(null as unknown as string)
    s.append(undefined as unknown as string)
    s.append(42 as unknown as string)
    s.append({} as unknown as string)
    s.append(Object('y') as unknown as string)
    await Promise.resolve()
    expect(s.value).toBe('x')
  })

  it('ignores bigint and symbol append/set without throwing (typeof string guard; no ToString coercion)', async () => {
    const s = streamText('keep')
    expect(() => s.append(0n as unknown as string)).not.toThrow()
    expect(() => s.append(Symbol('chunk') as unknown as string)).not.toThrow()
    await Promise.resolve()
    expect(s.value).toBe('keep')
    expect(() => s.set(1n as unknown as string)).not.toThrow()
    expect(s.value).toBe('keep')
    expect(s.signal.peek()).toBe('keep')
    expect(() => s.set(Symbol('v') as unknown as string)).not.toThrow()
    expect(s.value).toBe('keep')
  })

  it('ignores non-string set without mutating value or signal (parity with append guard)', () => {
    const s = streamText('keep')
    s.set(null as unknown as string)
    s.set(undefined as unknown as string)
    s.set(99 as unknown as string)
    s.set({} as unknown as string)
    s.set(Object('new') as unknown as string)
    expect(s.value).toBe('keep')
    expect(s.signal.peek()).toBe('keep')
  })

  it('ignores non-string set after append without clearing the pending buffer (microtask flush still runs)', async () => {
    const s = streamText()
    s.append('queued')
    s.set(null as unknown as string)
    s.set(0n as unknown as string)
    expect(s.signal.peek()).toBe('')
    await Promise.resolve()
    expect(s.value).toBe('queued')
    expect(s.signal.peek()).toBe('queued')
  })

  it('clear before pending microtask flush leaves empty value (buffer and signal stay aligned)', async () => {
    const s = streamText()
    s.append('gone')
    s.clear()
    await Promise.resolve()
    expect(s.value).toBe('')
  })

  it('clear() drops a pending coalesce microtask so a later append can schedule a fresh flush', async () => {
    const s = streamText()
    s.append('gone')
    s.clear()
    s.append('kept')
    await Promise.resolve()
    expect(s.value).toBe('kept')
  })

  it('done() then synchronous append still flushes; pre-done coalesce microtask must not block scheduling', async () => {
    const s = streamText()
    s.append('a')
    s.done()
    expect(s.value).toBe('a')
    s.append('b')
    await Promise.resolve()
    expect(s.value).toBe('ab')
  })

  it('done() on an empty stream sets streaming false without changing value', () => {
    const s = streamText()
    s.done()
    expect(s.value).toBe('')
    expect(s.streaming).toBe(false)
  })

  it('done() when the buffer already matches the signal skips redundant set (initial string in sync)', () => {
    const s = streamText('ready')
    expect(s.signal.peek()).toBe('ready')
    s.done()
    expect(s.value).toBe('ready')
    expect(s.streaming).toBe(false)
    expect(s.signal.peek()).toBe('ready')
  })

  it('clear() after done() empties text and turns streaming back on for a new session', () => {
    const s = streamText()
    s.append('x')
    s.done()
    expect(s.value).toBe('x')
    expect(s.streaming).toBe(false)
    s.clear()
    expect(s.value).toBe('')
    expect(s.streaming).toBe(true)
  })

  it('after done() then clear(), coalesced append flushes into the new session with streaming true', async () => {
    const s = streamText()
    s.append('first')
    s.done()
    expect(s.streaming).toBe(false)
    s.clear()
    expect(s.streaming).toBe(true)
    s.append('second')
    await Promise.resolve()
    expect(s.value).toBe('second')
    expect(s.streaming).toBe(true)
  })

  it('idempotent done() leaves value and streaming false', () => {
    const s = streamText()
    s.append('x')
    s.done()
    expect(s.value).toBe('x')
    expect(s.streaming).toBe(false)
    s.done()
    expect(s.value).toBe('x')
    expect(s.streaming).toBe(false)
  })

  it('second consecutive done() does not notify streamingSignal subscribers again', () => {
    const s = streamText()
    const streamingRuns: boolean[] = []
    effect(() => {
      streamingRuns.push(s.streamingSignal.value)
    })
    expect(streamingRuns).toEqual([true])
    s.done()
    expect(streamingRuns).toEqual([true, false])
    s.done()
    expect(streamingRuns).toEqual([true, false])
  })

  it('set() then append() coalesces the combined buffer in one microtask update', async () => {
    const s = streamText()
    s.set('hello ')
    s.append('world')
    expect(s.signal.peek()).toBe('hello ')
    await Promise.resolve()
    expect(s.value).toBe('hello world')
  })

  it('set("") clears synchronously and keeps streaming true (distinct from clear() which resets streaming)', () => {
    const s = streamText('hello')
    expect(s.streaming).toBe(true)
    s.set('')
    expect(s.value).toBe('')
    expect(s.signal.peek()).toBe('')
    expect(s.streaming).toBe(true)
  })

  it('append then set("") before microtask clears the pending buffer so the flush cannot resurrect chunks', async () => {
    const s = streamText()
    s.append('gone')
    s.set('')
    expect(s.signal.peek()).toBe('')
    await Promise.resolve()
    expect(s.value).toBe('')
    expect(s.signal.peek()).toBe('')
  })

  it('append() then set() before microtask replaces buffer and drops pending chunks from the signal', async () => {
    const s = streamText()
    s.append('gone')
    s.set('replaced')
    expect(s.signal.peek()).toBe('replaced')
    await Promise.resolve()
    expect(s.value).toBe('replaced')
  })

  it('append after done() still updates text (callers may clear() to start a new stream)', async () => {
    const s = streamText()
    s.done()
    expect(s.streaming).toBe(false)
    expect(s.streamingSignal.peek()).toBe(false)
    s.append('late')
    await Promise.resolve()
    expect(s.value).toBe('late')
    expect(s.streaming).toBe(false)
    expect(s.streamingSignal.peek()).toBe(false)
  })

  it('multiple appends after done() coalesce into one microtask (streaming stays false)', async () => {
    const s = streamText()
    s.done()
    s.append('a')
    s.append('b')
    s.append('c')
    expect(s.signal.peek()).toBe('')
    await Promise.resolve()
    expect(s.value).toBe('abc')
    expect(s.streaming).toBe(false)
    expect(s.streamingSignal.peek()).toBe(false)
  })

  it('set() after done() replaces text synchronously while streaming stays false', () => {
    const s = streamText()
    s.append('a')
    s.done()
    expect(s.streaming).toBe(false)
    expect(s.value).toBe('a')
    s.set('replaced')
    expect(s.value).toBe('replaced')
    expect(s.signal.peek()).toBe('replaced')
    expect(s.streaming).toBe(false)
  })
})

describe('streamText.streamingSignal', () => {
  it('starts true and mirrors streaming until done()', () => {
    const s = streamText()
    expect(s.streamingSignal.peek()).toBe(true)
    s.done()
    expect(s.streamingSignal.peek()).toBe(false)
    expect(s.streaming).toBe(false)
  })

  it('returns to true after clear() even when done() was called first', () => {
    const s = streamText()
    s.done()
    expect(s.streamingSignal.peek()).toBe(false)
    s.clear()
    expect(s.streamingSignal.peek()).toBe(true)
    expect(s.streaming).toBe(true)
  })

  it('notifies subscribers when streaming flips (done then clear)', () => {
    const s = streamText()
    const flags: boolean[] = []
    effect(() => {
      flags.push(s.streamingSignal.value)
    })
    expect(flags).toEqual([true])
    flags.length = 0
    s.done()
    expect(flags).toEqual([false])
    flags.length = 0
    s.clear()
    expect(flags).toEqual([true])
  })
})

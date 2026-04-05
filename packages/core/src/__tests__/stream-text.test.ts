import { describe, it, expect } from 'vitest'
import { streamText } from '../stream-text.js'
import { effect } from '../signals.js'

describe('streamText', () => {
  it('starts with initial value', () => {
    const s = streamText('hello')
    expect(s.value).toBe('hello')
  })

  it('starts empty by default', () => {
    const s = streamText()
    expect(s.value).toBe('')
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
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      s.value
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

  it('ignores empty append', async () => {
    const s = streamText('x')
    s.append('')
    await Promise.resolve()
    expect(s.value).toBe('x')
  })

  it('done() on an empty stream sets streaming false without changing value', () => {
    const s = streamText()
    s.done()
    expect(s.value).toBe('')
    expect(s.streaming).toBe(false)
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

  it('set() then append() coalesces the combined buffer in one microtask update', async () => {
    const s = streamText()
    s.set('hello ')
    s.append('world')
    expect(s.signal.peek()).toBe('hello ')
    await Promise.resolve()
    expect(s.value).toBe('hello world')
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
    s.append('late')
    await Promise.resolve()
    expect(s.value).toBe('late')
    expect(s.streaming).toBe(false)
  })
})

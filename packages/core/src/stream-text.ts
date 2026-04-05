/**
 * Streaming text primitive for efficient token-by-token updates.
 *
 * Wraps a signal with `append()` / `clear()` / `done()` helpers and
 * microtask-level coalescing so bursts of rapid appends (e.g. LLM tokens)
 * produce a single signal notification per microtask rather than one per token.
 */

import { signal, batch } from './signals.js'
import type { Signal } from './signals.js'

export interface StreamText {
  /** Current accumulated text (reactive — subscribes the active effect/computed). */
  readonly value: string
  /** Underlying signal for direct use in view functions. */
  readonly signal: Signal<string>
  /**
   * Append text. Coalesces rapid calls into a single signal update per microtask.
   * Non-string values are ignored so corrupt host data cannot stringify as `[object Object]`.
   */
  append(chunk: string): void
  /**
   * Replace the entire text content synchronously.
   * Non-string values are ignored (same guard as `append`) so the buffer and signal stay strings.
   */
  set(text: string): void
  /** Reset to empty string. */
  clear(): void
  /** Mark the stream as finished. Sets `streaming` to `false`. */
  done(): void
  /** Whether the stream is still receiving chunks. */
  readonly streaming: boolean
  /** Underlying streaming signal. */
  readonly streamingSignal: Signal<boolean>
}

/**
 * Create a streaming text container. Tokens appended via `append()` are
 * coalesced within a microtask so downstream signal subscribers (layout,
 * render) see at most one update per event-loop tick.
 *
 * @param initial — Optional initial text content (default `''`). Non-string values are treated as empty so corrupt host data cannot poison the buffer.
 */
export function streamText(initial = ''): StreamText {
  const seed = typeof initial === 'string' ? initial : ''
  const s = signal(seed)
  const streamingState = signal(true)
  let buffer = seed
  let flushScheduled = false

  function scheduleFlush(): void {
    if (flushScheduled) return
    flushScheduled = true
    queueMicrotask(() => {
      flushScheduled = false
      batch(() => {
        s.set(buffer)
      })
    })
  }

  return {
    get value(): string {
      return s.value
    },
    signal: s,
    append(chunk: string): void {
      if (typeof chunk !== 'string' || chunk.length === 0) return
      buffer += chunk
      scheduleFlush()
    },
    set(text: string): void {
      if (typeof text !== 'string') return
      buffer = text
      s.set(text)
    },
    clear(): void {
      buffer = ''
      s.set('')
      streamingState.set(true)
    },
    done(): void {
      // Flush any remaining buffered text synchronously
      if (buffer !== s.peek()) {
        s.set(buffer)
      }
      streamingState.set(false)
    },
    get streaming(): boolean {
      return streamingState.value
    },
    streamingSignal: streamingState,
  }
}

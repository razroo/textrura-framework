import type { PointerSample } from '@geometra/core'

/**
 * Host-agnostic surface that every gesture recognizer in `@geometra/core`
 * implements. We redeclare it here rather than importing each recognizer type
 * so callers can pass any array of compatible recognizers (including user-built
 * ones) without having to list every union member.
 */
export interface CanvasGestureRecognizerLike {
  pointerDown(sample: PointerSample): void
  pointerMove(sample: PointerSample): void
  pointerUp(sample: PointerSample): void
  pointerCancel(pointerId: number): void
}

export interface AttachGestureRecognizersOptions {
  /**
   * When true (default), `pointermove` / `pointerup` / `pointercancel` are
   * attached to `document` so drags continue if the pointer leaves the canvas.
   * Set false to clamp all events to the canvas bounds (useful in test
   * environments without `document`).
   */
  trackOutsideCanvas?: boolean
  /**
   * High-resolution timestamp source. Defaults to `performance.now()` — or a
   * frozen `0` when `performance` is unavailable (SSR/Node test envs).
   */
  now?: () => number
  /**
   * Optional override for the document-like target used for outside-canvas
   * tracking. Primarily for tests that can't rely on a global `document`.
   */
  documentTarget?: {
    addEventListener: Document['addEventListener']
    removeEventListener: Document['removeEventListener']
  }
}

/**
 * Convert browser `PointerEvent`s into {@link PointerSample}s and fan them out
 * to one or more `@geometra/core` gesture recognizers (pan / swipe / pinch or
 * user-built state machines). Returns a cleanup function.
 *
 * Typical integration:
 *
 * ```ts
 * import { createPanRecognizer } from '@geometra/core'
 * import { attachGestureRecognizers } from '@geometra/renderer-canvas'
 *
 * const pan = createPanRecognizer({ onMove: e => setOffset(e.deltaX, e.deltaY) })
 * const stop = attachGestureRecognizers(canvas, [pan])
 * // ...later: stop()
 * ```
 *
 * `pointerdown` is always attached to the canvas. `pointermove` /
 * `pointerup` / `pointercancel` are attached to `document` by default so drags
 * continue after the pointer leaves the canvas — the sample coordinates stay
 * relative to the canvas because we subtract `getBoundingClientRect()` on every
 * event. Set `trackOutsideCanvas: false` to clamp to the canvas.
 *
 * We track which pointer IDs have been seen via `pointerdown` on this canvas so
 * stray moves/ups from unrelated elements can't accidentally drive recognizer
 * state.
 */
export function attachGestureRecognizers(
  canvas: HTMLCanvasElement,
  recognizers: ReadonlyArray<CanvasGestureRecognizerLike>,
  options: AttachGestureRecognizersOptions = {},
): () => void {
  const trackOutsideCanvas = options.trackOutsideCanvas !== false
  const now = options.now ?? fallbackNow()
  const activePointers = new Set<number>()

  function toSample(e: PointerEvent): PointerSample {
    const rect = canvas.getBoundingClientRect()
    return {
      id: e.pointerId,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      timestampMs: now(),
    }
  }

  function onPointerDown(e: PointerEvent): void {
    activePointers.add(e.pointerId)
    const sample = toSample(e)
    for (const r of recognizers) r.pointerDown(sample)
  }

  function onPointerMove(e: PointerEvent): void {
    if (!activePointers.has(e.pointerId)) return
    const sample = toSample(e)
    for (const r of recognizers) r.pointerMove(sample)
  }

  function onPointerUp(e: PointerEvent): void {
    if (!activePointers.has(e.pointerId)) return
    activePointers.delete(e.pointerId)
    const sample = toSample(e)
    for (const r of recognizers) r.pointerUp(sample)
  }

  function onPointerCancel(e: PointerEvent): void {
    if (!activePointers.has(e.pointerId)) return
    activePointers.delete(e.pointerId)
    for (const r of recognizers) r.pointerCancel(e.pointerId)
  }

  canvas.addEventListener('pointerdown', onPointerDown)

  const moveTarget: {
    addEventListener: (type: string, listener: EventListener) => void
    removeEventListener: (type: string, listener: EventListener) => void
  } = trackOutsideCanvas
    ? (options.documentTarget ?? (typeof document !== 'undefined' ? document : canvas))
    : canvas

  moveTarget.addEventListener('pointermove', onPointerMove as EventListener)
  moveTarget.addEventListener('pointerup', onPointerUp as EventListener)
  moveTarget.addEventListener('pointercancel', onPointerCancel as EventListener)

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown)
    moveTarget.removeEventListener('pointermove', onPointerMove as EventListener)
    moveTarget.removeEventListener('pointerup', onPointerUp as EventListener)
    moveTarget.removeEventListener('pointercancel', onPointerCancel as EventListener)
  }
}

function fallbackNow(): () => number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return () => performance.now()
  }
  return () => 0
}

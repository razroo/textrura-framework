# Release notes — 1.53.0 (animation choreography + MCP submit_form + transparent click fallback)

## Summary

Three deferred roadmap items land in 1.53.0:

- **`@geometra/core`** gains declarative animation choreography (`sequence`, `parallel`, `stagger`), a scrubbable `createKeyframeTimeline`, and renderer-agnostic pointer gesture recognizers (`createPanRecognizer`, `createSwipeRecognizer`, `createPinchRecognizer`).
- **`@geometra/mcp`** gains `geometra_submit_form`, a one-call fill → submit-click → post-submit wait tool that collapses the canonical ATS/sign-in flow into a single MCP round-trip.
- **`@geometra/mcp` click fallback**: `geometra_click` and `geometra_run_actions` click steps now retry semantic resolution transparently — once after a UI-revision tick (for post-navigation races) and once with relaxed visibility (for sticky headers / very tall inputs). Results surface `fallback: { used, reason, attempts }` so operators can prioritize native fixes.

## @geometra/core — animation choreography

New composable timeline primitives. Any object matching `Choreographable` (`TweenTimeline`, `PropertyTimeline`, or your own) composes:

```ts
import {
  createTweenTimeline,
  sequence,
  parallel,
  stagger,
  createKeyframeTimeline,
  easing,
} from '@geometra/core'

const fadeIn = createTweenTimeline(0)
const slide = createTweenTimeline(-40)
fadeIn.to(1, 240, easing.easeOut)
slide.to(0, 240, easing.easeOut)

// Run fade-in + slide together, then a follow-up; step deterministically.
const intro = sequence([
  parallel([fadeIn, slide]),
  stagger(listItemTimelines, 40),
])
intro.step(16)
```

`createKeyframeTimeline` supports timeline scrubbing (useful for media timelines, review UIs, screencaster-style scrubbers):

```ts
const tl = createKeyframeTimeline([
  { at: 0,   values: { x: 0,   opacity: 0 } },
  { at: 150, values: { x: 120, opacity: 1 } },
  { at: 300, values: { x: 0,   opacity: 1 } },
])
tl.scrubTo(0.5)        // jump to 50% progress without changing play state
tl.step(16)            // normal frame advance after scrubbing
tl.values.x.value      // live signal, ready to feed into a box() prop
```

All choreography respects the existing `setMotionPreference('reduced')` policy and normalizes non-finite `deltaMs` / keyframe values to `0` — same invariants as `createTweenTimeline`.

## @geometra/core — gesture recognizers

Pure pointer-event state machines. No DOM, no `requestAnimationFrame`. Host code (canvas hit-test, terminal pointer, native bridge, tests) feeds `pointerDown`/`pointerMove`/`pointerUp`/`pointerCancel`; recognizers fire typed callbacks when thresholds are crossed.

```ts
import { createPanRecognizer, createSwipeRecognizer, createPinchRecognizer } from '@geometra/core'

const pan = createPanRecognizer({
  minDistance: 4,
  onStart: e => console.log('pan start', e.deltaX, e.deltaY),
  onMove:  e => console.log('pan', e.deltaX, e.deltaY),
  onEnd:   e => console.log('pan end', e.deltaX, e.deltaY),
})

const swipe = createSwipeRecognizer({
  minDistance: 24,      // px
  minVelocity: 0.3,     // px/ms over trailing 100ms
  maxDurationMs: 600,
  onSwipe: e => console.log(e.direction, e.velocity),
})

const pinch = createPinchRecognizer({
  minDeltaDistance: 4,
  onMove: e => console.log('scale', e.scale, 'around', e.centerX, e.centerY),
})
```

Integration is intentionally host-agnostic — canvas hit-test adapters can wire pointer events to recognizers without reaching into `@geometra/core` internals. Wiring recipes will ship in a future `INTEGRATION_COOKBOOK.md` update.

## @geometra/mcp — geometra_submit_form

One call, one consolidated result for the canonical form-submission flow:

```json
{
  "tool": "geometra_submit_form",
  "arguments": {
    "pageUrl": "https://jobs.example.com/apply",
    "isolated": true,
    "valuesByLabel": {
      "Full name": "Taylor Applicant",
      "Email": "taylor@example.com"
    },
    "submit": { "role": "button", "name": "Submit application" },
    "waitFor": { "role": "dialog", "name": "Application submitted", "timeoutMs": 15000 }
  }
}
```

Result payload:

```json
{
  "autoConnected": true,
  "completed": true,
  "fill":   { "formId": "fm:0", "fieldCount": 12, "invalidCount": 0 },
  "submit": { "at": { "x": 320, "y": 480 }, "target": { "role": "button", "name": "Submit application" } },
  "waitFor": { "present": true, "matchCount": 1 },
  "navigated": true,
  "afterUrl": "https://jobs.example.com/confirm",
  "final":  { "invalidCount": 0, "alertCount": 0, ... }
}
```

Shape notes:

- `submit` defaults to `{ role: 'button', name: 'Submit' }` when omitted.
- `waitFor` is optional; omit to skip the post-click wait.
- `skipFill: true` jumps straight to submit + wait (for resume-capable flows where values were already filled).
- Navigation is detected automatically via `pageUrl` change and surfaced as `navigated: true` + `afterUrl`.
- `failOnInvalid: true` turns any residual `invalidCount` into an error result.

This reuses `@geometra/mcp`'s existing form-schema resolver and batched `sendFillFields` path, so parity with `geometra_fill_form` is guaranteed for the fill phase.

## @geometra/mcp — transparent click fallback

`geometra_click` and `geometra_run_actions` (click steps) now run semantic resolution through a two-phase fallback:

1. **`revision-retry`** — if the initial resolve fails, wait up to 600ms for `session.updateRevision` to tick (common when an agent clicks during a post-navigation re-render), then re-resolve with the original filter.
2. **`relaxed-visibility`** — if the caller required `fullyVisible: true`, retry with intersection-only visibility and an expanded reveal budget. Handles sticky headers, fixed overlays, and very tall inputs.

When a fallback succeeds, the compact result includes:

```json
{
  "fallback": { "used": true, "reason": "relaxed-visibility", "attempts": 2 }
}
```

Agents don't have to branch on this — the click still succeeds — but operators can aggregate these counters to prioritize native fixes (the Phase 4 goal from `MCP_PERFORMANCE_ROADMAP.md`).

## Migration notes

All additions are additive. Existing call sites keep the same result shape; the new `fallback` field only appears when a recovery phase was needed. New exports from `@geometra/core`:

- Functions: `sequence`, `parallel`, `stagger`, `createKeyframeTimeline`, `createPanRecognizer`, `createSwipeRecognizer`, `createPinchRecognizer`
- Types: `Choreographable`, `Choreography`, `Keyframe`, `KeyframeTimeline`, `KeyframeTimelinePlaybackState`, `PointerSample`, `PanEvent`, `PanRecognizer`, `PanRecognizerOptions`, `SwipeDirection`, `SwipeEvent`, `SwipeRecognizer`, `SwipeRecognizerOptions`, `PinchEvent`, `PinchRecognizer`, `PinchRecognizerOptions`

No protocol changes. GEOM v1 stays fully compatible.

## Performance notes

- Gesture recognizers are pure synchronous state machines — no per-frame work when idle.
- Choreography primitives are step-only (no `raf`) so they can drive deterministic tests and frame-stepped integrations without timing flake.
- MCP click fallback adds at most 600ms on the failure path (`revision-retry` wait). Happy-path clicks are unchanged: `resolveClickLocationWithFallback` calls through to `resolveClickLocation` and returns immediately on success.

## Verification

- Full suite: 1,765 / 1,765 passing across 50 test files.
- New tests: 29 for animation choreography + gestures (`animation-choreography.test.ts`, `gestures.test.ts`), 4 for MCP submit_form + click fallback (`server-batch-results.test.ts`).

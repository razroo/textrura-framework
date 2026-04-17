# Release notes — 1.54.0 (swipeableList + gesture canvas adapter + fallback telemetry v2)

## Summary

1.54.0 rounds out the 1.53.0 gesture + transparent-fallback story with a first real consumer and a complete telemetry shape:

- **`@geometra/ui`** ships `swipeableList`, the first UI primitive driven by a `@geometra/core` gesture recognizer. Signal-backed, velocity-aware, composable with `attachGestureRecognizers`.
- **`@geometra/renderer-canvas`** exports `attachGestureRecognizers` — the canvas adapter that turns `PointerEvent`s into `PointerSample`s for core gesture state machines. Tracks drags past the canvas edge by default.
- **`@geometra/mcp`** extends the transparent-fallback telemetry shape. Successful recoveries now carry `{ attempted: true, used: true, reason, attempts }`; click failures after fallback attempts return structured JSON with `fallback: { attempted: true, used: false, reasonsTried, attempts }`. Run-actions aggregates step-level fallbacks into a top-level `fallbacks[]` array regardless of `includeSteps`.
- **Demos** — `demos/local-canvas` gains a runnable gesture playground (pan / pinch / swipe drive signal-backed puck state) so the new primitives have a reference integration.
- **Cookbooks** — `INTEGRATION_COOKBOOK.md` and `MCP_COOKBOOK.md` updated with gesture wiring and the v2 fallback shape.

## @geometra/ui — swipeableList

```ts
import { swipeableList } from '@geometra/ui'
import { attachGestureRecognizers } from '@geometra/renderer-canvas'

const list = swipeableList({
  items: slides,
  width: 320,
  height: 200,
  flickVelocity: 0.3,
  renderItem: (item, i) => slideView(item, i),
  onIndexChange: i => console.log('now on', i),
})

attachGestureRecognizers(canvas, list.recognizers)

// Inside your root `view()`:
return box({ padding: 16 }, [list.view(), ...pagerDots(list.currentIndex)])
```

Returned bundle:

- **`view()`** — signal-backed `UIElement`. Re-runs each frame via the usual signals graph; the track shifts via a `position: relative; left: shift` offset, so the renderer only paints visible pixels under an `overflow: hidden` parent.
- **`recognizers`** — array of `PanRecognizer`s ready for `attachGestureRecognizers`.
- **`currentIndex`** — live `Signal<number>` you can read for pagination dots, keyboard nav, etc.
- **`goTo(i)` / `next()` / `prev()`** — imperative controls, clamped to `[0, items.length - 1]`.

Velocity-aware snapping: release with velocity above `flickVelocity` (default `0.3 px/ms`) advances one extra item in the flick direction, so fast flicks don't require a full half-width drag. Set `flickVelocity: Infinity` to disable.

## @geometra/renderer-canvas — attachGestureRecognizers

```ts
import { createPanRecognizer, createPinchRecognizer, createSwipeRecognizer } from '@geometra/core'
import { attachGestureRecognizers } from '@geometra/renderer-canvas'

const pan = createPanRecognizer({ onMove: e => setOffset(e.deltaX, e.deltaY) })
const pinch = createPinchRecognizer({ onMove: e => setScale(e.scale) })
const swipe = createSwipeRecognizer({ onSwipe: e => console.log(e.direction) })

const stop = attachGestureRecognizers(canvas, [pan, pinch, swipe])
// …on teardown:
stop()
```

Defaults:

- `pointerdown` attaches to the canvas.
- `pointermove` / `pointerup` / `pointercancel` attach to `document` so drags continue past the canvas edge. Sample coordinates stay canvas-relative (we subtract `getBoundingClientRect()` on every event). Pass `{ trackOutsideCanvas: false }` to clamp to the canvas.
- Unknown pointer IDs are filtered so stray moves from unrelated elements can't drive recognizer state.

## @geometra/mcp — fallback telemetry v2

### Success shape (all tools)

```json
{
  "fallback": { "attempted": true, "used": true, "reason": "revision-retry", "attempts": 2 }
}
```

`attempted: true` is new. Old consumers reading `fallback.used` / `fallback.reason` / `fallback.attempts` keep working unchanged.

### Click failure shape (new)

When every fallback phase was tried but none recovered the target, `geometra_click` returns a structured JSON error:

```json
{
  "error": "No elements found matching { \"role\": \"button\", \"name\": \"Submit\" }",
  "fallback": {
    "attempted": true,
    "used": false,
    "reasonsTried": ["revision-retry", "relaxed-visibility"],
    "attempts": 3
  }
}
```

Parse the error text as JSON when you want the telemetry. Plain-text errors are preserved for the no-fallback case (explicit coordinates, empty filter) to avoid churning that contract.

### Aggregate shape (`geometra_run_actions`)

Step-level fallbacks bubble up into a top-level `fallbacks[]` array regardless of `includeSteps`:

```json
{
  "completed": true,
  "stepCount": 3,
  "successCount": 3,
  "fallbacks": [
    { "stepIndex": 0, "type": "fill_fields", "attempted": true, "used": true, "reason": "batched-unavailable", "attempts": 2 },
    { "stepIndex": 2, "type": "click", "attempted": true, "used": true, "reason": "revision-retry", "attempts": 2 }
  ]
}
```

### How to use it

- **Agents:** ignore `fallback` for flow control. The action succeeded; don't branch, don't retry. A spike of fallbacks across a session is a hint that the page might need a different strategy (`isolated: true` on the next connect, `waitFor` on a slower condition).
- **Operators:** aggregate `fallback.reason` and `reasonsTried` counts in logs to prioritize native fixes — a burst of `batched-invalid-readback` means the batched proxy path needs tightening; a burst of `relaxed-visibility` means a sticky element wants native reveal support.

## Migration notes

All telemetry changes are additive. `fallback.attempted` is a new key; old consumers reading `fallback.used` continue to work. The click error shape change only affects the "fallback attempted but failed" case — every prior error path returns the same plain-text string.

New exports:

- `@geometra/ui`: `swipeableList`, `SwipeableList`, `SwipeableListOptions`
- `@geometra/renderer-canvas`: `attachGestureRecognizers`, `AttachGestureRecognizersOptions`, `CanvasGestureRecognizerLike` (shipped in 1.53.0 source but first released here)

No protocol changes. GEOM v1 stays fully compatible.

## Performance notes

- `swipeableList.view()` is a plain render function — no extra reconciler state, no raf. The track's `position: relative` + `left` shift means only visible pixels paint under `overflow: hidden`.
- `attachGestureRecognizers` is a single listener pair + per-event rect lookup. No work when the pointer is outside a tracked session.
- MCP click fallback still adds at most ~600ms on the failure path (revision-retry wait). Happy-path clicks are unchanged.

## Verification

- Full fast suite: 2,438 / 2,438 passing across 85 test files.
- New tests: 6 for `swipeableList` (`packages/ui/src/__tests__/swipeable-list.test.ts`), 5 for the canvas gesture adapter, 3 for the extended fallback telemetry shape.

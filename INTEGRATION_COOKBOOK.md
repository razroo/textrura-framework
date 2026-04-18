# Integration cookbook (1.5+)

Short recipes for common stacks. All paths assume a Geometra workspace install.

## Local canvas app

1. Build layout with `@geometra/core` (`box`, `text`, signals) and optional `@geometra/ui` primitives.
2. Run Yoga via `textura` (`computeLayout`) or use `createApp` from core for local loop.
3. Paint with `CanvasRenderer` from `@geometra/renderer-canvas`.
4. **Inspector**: `new CanvasRenderer({ canvas, layoutInspector: true })`. With **`createApp`**, the HUD shows **`layout`** ms (Yoga) and **`render`** ms (canvas). Optionally set `renderer.inspectorProbe = { x, y }` on pointer move for `hitPathAtPoint`. Custom hosts can implement **`Renderer.setFrameTimings`** themselves before calling `render`.

## Gesture recognizers

Pan / swipe / pinch ship as host-agnostic state machines in `@geometra/core`.
`attachGestureRecognizers` from `@geometra/renderer-canvas` is the canvas adapter
— it converts browser `PointerEvent`s to `PointerSample`s and fans them out to
every recognizer you pass in.

```ts
import { createPanRecognizer, createSwipeRecognizer, createPinchRecognizer, signal } from '@geometra/core'
import { attachGestureRecognizers } from '@geometra/renderer-canvas'

const offsetX = signal(0)
const scale = signal(1)

const pan = createPanRecognizer({
  minDistance: 4,
  onMove: e => offsetX.set(e.deltaX),
})
const swipe = createSwipeRecognizer({
  minVelocity: 0.4,
  onSwipe: e => console.log('swipe', e.direction),
})
const pinch = createPinchRecognizer({
  onMove: e => scale.set(e.scale),
})

const stop = attachGestureRecognizers(canvas, [pan, swipe, pinch])
// …on teardown:
stop()
```

Notes:

- Coordinates on `PanEvent` / `SwipeEvent` / `PinchEvent` are in canvas CSS pixels
  (same space as `HitEvent.x/y`). Use them directly to update signals driving
  `box({ translateX: offsetX.value })` etc.
- By default `pointermove` / `pointerup` / `pointercancel` bind to `document` so
  drags continue past the canvas edge. Pass `{ trackOutsideCanvas: false }` to
  clamp to the canvas bounds.
- Gestures compose with `enableInputForwarding` / `enableSelection` — they use
  their own listeners and don't stop the regular hit-test pipeline from firing.

## Modal focus policy (dialog / sheet / overlay)

`animatedDialog` captures and restores `focusedElement` on its own, but moving
focus **into** the dialog on open and containing Tab inside it while it's open
are tree-aware concerns that belong in the app. The two pieces:

- `focusFirstInside(tree, layout, scopePath)` — seed focus to the first
  focusable box inside a subtree. Call when the dialog becomes fully open.
- `trapFocusStep(tree, layout, scopePath, direction)` — cycle focus within the
  subtree on Tab / Shift+Tab. Returns `true` when it moved focus.

Both live in `@geometra/core`. `scopePath` is the index path from your root
`view()` element to the dialog's root box — the same structure `dispatchHit`
and layout walks use.

```ts
import { effect, focusFirstInside, trapFocusStep } from '@geometra/core'
import { animatedDialog } from '@geometra/ui'

const dlg = animatedDialog({ title: 'Sign in', body: '…' })
const DIALOG_PATH = [2] // wherever dlg.view() sits in your tree

// 1. Seed focus when the dialog becomes fully open. `effect` re-runs whenever
//    the signals it reads change (here: `dlg.isOpen`).
let hasSeededFocus = false
effect(() => {
  const open = dlg.isOpen.value
  if (!open) { hasSeededFocus = false; return }
  // Defer to next frame so layout is computed before we seed focus.
  queueMicrotask(() => {
    if (!hasSeededFocus && app.tree && app.layout) {
      focusFirstInside(app.tree, app.layout, DIALOG_PATH)
      hasSeededFocus = true
    }
  })
})

// 2. Contain Tab while the dialog is open.
canvas.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || !dlg.isOpen.peek()) return
  if (!app.tree || !app.layout) return
  const moved = trapFocusStep(app.tree, app.layout, DIALOG_PATH, e.shiftKey ? 'prev' : 'next')
  if (moved) e.preventDefault()
})

// 3. On close, animatedDialog restores focus to the pre-open element.
//    Nothing else to do — `restoreFocusOnClose` defaults to `true`.
```

Opt out of focus restoration (tooltips, hover popovers, toasts that should
never steal focus) with `restoreFocusOnClose: false` on the `animatedDialog`
options.

## Thin client + server

1. Server: `createServer` from `@geometra/server` — layout and diffs stay on the server.
2. Client: `createClient` from `@geometra/client` with a `CanvasRenderer`; forward resize for correct viewport.
3. Optional: negotiate `binaryFraming` and watch `onFrameMetrics` / server `onTransportMetrics` (see `TRANSPORT_1_4.md`).
4. For the official full-stack path that also uses `@geometra/ui` and `@geometra/router`, run `npm run create:app -- ./my-geometra-app` or pick another template with `npm run create:app -- --list`.

## Production auth (`@geometra/auth` + token registry)

Auth belongs on the **WebSocket upgrade** and optional **per-message** policy hooks — not inside `@geometra/core`.

- Use **`@geometra/auth`** `createAuth()` and spread its hooks into `createServer()` (token verify + role policies).
- Use **`@geometra/token-registry`** as the HTTP backend for `remoteVerifier()`, or any compatible verify endpoint.
- Wire semantics, close codes **4001** / **4003**, refresh, and “what not to put in core” are documented in **`PLATFORM_AUTH.md`**.
- End-to-end sample: **`demos/auth-registry-server-client/`** (registry + `remoteVerifier` + `connectWithAuth`).

## DOM-free migration

- Replace DOM measurement with Textura layout + core text metrics; avoid `window.getComputedStyle` in hot paths.
- Pointer: use hit events (`localX` / `localY`) from Geometra hit tests, not DOM `target`.
- Focus: use `focusedElement`, `focusNext` / `focusPrev`, and `collectFocusOrder` when building custom focus or inspector UX.

## Related docs

- `PLATFORM_AUTH.md` — `@geometra/auth`, `@geometra/token-registry`, WS contract, refresh/reconnect.
- `FONTS_AND_METRICS.md` — `font` strings, `waitForFonts`, server/client metric parity.
- `PROTOCOL_COMPATIBILITY.md` — wire format and optional binary frames.
- `PROTOCOL_EVOLUTION.md` — versioning and future transport changes.
- `TRANSPORT_1_4.md` — backpressure and CI transport baselines.
- `FRAMEWORK_NORTH_STAR.md` — invariants and quality bar.
- `GEOMETRY_SNAPSHOT_TESTING.md` — snapshot `ComputedLayout` and draw-op traces in tests.

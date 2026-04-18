# Release notes — 1.55.0 (swipeableList keyboard + overlay transition primitives)

## Summary

1.55.0 extends the UI primitives that composed the 1.53.0 choreography + gesture surface:

- **`@geometra/ui`** — `swipeableList` gains full keyboard navigation.
- **`@geometra/ui`** — new **`createOverlayTransition`** helper factors out the keyframe-driven enter/exit state machine that powers `animatedDialog`. `animatedSheet` and `animatedToast` land on the same foundation.
- **`animatedDialog`** now captures `focusedElement` on `open()` and restores it when the exit transition completes. Opt out with `restoreFocusOnClose: false`.

## @geometra/ui — swipeableList keyboard

The outer `swipeableList` container now handles:

- **ArrowLeft / PageUp** → `prev()`
- **ArrowRight / PageDown** → `next()`
- **Home** → `goTo(0)`
- **End** → `goTo(items.length - 1)`

Because the container declares an `onKeyDown` handler it automatically enters Tab order via `collectFocusOrder` from `@geometra/core`. No extra wiring required — the list is reachable through existing keyboard traversal.

## @geometra/ui — createOverlayTransition

The shared helper the other overlay primitives compose:

```ts
import { createOverlayTransition } from '@geometra/ui'

const t = createOverlayTransition({
  keyframes: [
    { at: 0,   values: { opacity: 0, top: 12 } },
    { at: 180, values: { opacity: 1, top: 0 } },
  ],
  restoreFocusOnClose: true,
})

t.open()
app.step((dt) => t.step(dt * 1000))
// ...later
t.close()
// When exit completes:
t.isMounted.value === false
// focusedElement has been set back to its pre-open value
```

Guarantees:

- Mount / unmount via signals (`isMounted`, `isOpen`) — `isOpen` flips the moment user intent changes; `isMounted` spans the entire mounted lifetime including both transitions.
- Respects `setMotionPreference('reduced')` — `open()` jumps straight to the final pose and `close()` unmounts immediately, no frame loop required.
- Non-finite / negative `deltaMs` clamps to `0` (matches `createKeyframeTimeline`).
- Interrupting a partial transition reverses cleanly; progress never snaps.

## @geometra/ui — animatedSheet

Slide-from-edge overlay. Side-aware keyframes:

```ts
const sheet = animatedSheet({
  content: settingsPanel,
  side: 'right',     // 'left' | 'right' | 'top' | 'bottom'
  size: 320,         // px along slide axis
  durationMs: 220,
})

sheet.open()
app.step((dt) => sheet.step(dt * 1000))
return box({ position: 'absolute', right: 0, top: 0, bottom: 0 }, [sheet.view()])
```

Panel pins the cross-axis dimension via the caller's container and animates only the slide-axis offset + opacity.

## @geometra/ui — animatedToast

Fade + slide-up notification with optional auto-close:

```ts
const toast = animatedToast({
  message: 'Saved',
  variant: 'success',
  autoCloseMs: 3000,
})

toast.open()
app.step((dt) => toast.step(dt * 1000))
```

`autoCloseMs` is driven off the same `step` time source as the transition itself — tests stay deterministic because there's no wall-clock timer. Variants: `info` (default), `success`, `warning`, `error`.

## @geometra/ui — animatedDialog focus restoration

`animatedDialog` now captures `focusedElement` on `open()` and re-applies it when the exit transition completes. Default on — opt out with `restoreFocusOnClose: false` (toasts and tooltips that never take focus).

```ts
const dlg = animatedDialog({ title: 'Signed in', body: 'Welcome back.' })
// pretend the Sign In button was focused before this:
dlg.open()      // captured
// focus moves into the dialog (app-level concern)
dlg.close()
dlg.step(300)
// focusedElement is now back to the Sign In button
```

Focus-in on open (moving focus *into* the dialog when it mounts) remains an app-level concern because it requires tree + layout context the primitive doesn't own. Tab containment inside the dialog can be wired via `trapFocusStep` from `@geometra/core` — pass the current tree + layout + dialog's scope path on each `onKeyDown`.

## Migration notes

All additions are additive. The refactor of `animatedDialog` onto `createOverlayTransition` preserves every public field (`view`, `open`, `close`, `step`, `isMounted`, `isOpen`, `timeline`). The only behavior change: `restoreFocusOnClose` now defaults to `true`. If your app was assigning `focusedElement` while a dialog was open and expecting that value to survive past the close, pass `restoreFocusOnClose: false` explicitly.

New exports:

- `@geometra/ui`: `createOverlayTransition`, `OverlayTransition`, `OverlayTransitionOptions`, `animatedSheet`, `AnimatedSheet`, `AnimatedSheetOptions`, `SheetSideValue`, `animatedToast`, `AnimatedToast`, `AnimatedToastOptions`

No protocol changes. GEOM v1 stays fully compatible.

## Performance notes

- The overlay transition state machine has zero per-frame cost when idle — `step()` returns immediately if no direction is active.
- Toast auto-close piggybacks on the same `step` time source; no wall-clock timer wakeups.
- `swipeableList` keyboard path is a switch — no extra allocations during navigation.

## Verification

- Full fast suite: 2,460 / 2,460 passing across 87 test files.
- New tests: 14 for `createOverlayTransition` / `animatedDialog` focus restoration / `animatedSheet` / `animatedToast`, 2 for `swipeableList` keyboard.

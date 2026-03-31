# Animation v2 baseline guide

This guide documents the deterministic animation APIs shipped in the 1.2 baseline.

## Exports

- `createTweenTimeline(initialValue)`
- `createPropertyTimeline(initialValues)`
- `setMotionPreference('full' | 'reduced')`
- `getMotionPreference()`
- Existing helpers: `transition`, `spring`, `animationLoop`, `easing`

## Supported transition fields

`createPropertyTimeline` supports numeric properties. Typical fields:

- Geometry: `x`, `y`, `width`, `height`
- Paint: `opacity`
- Additional numeric style values where caller-owned interpolation is acceptable

Non-numeric fields (for example string colors) should be converted by the caller
to numeric channels before interpolation, then reconstructed at render time.

## Interruption and playback semantics

- `to(...)` is interrupt-safe and starts from the current in-flight value.
- `pause()` freezes progression.
- `resume()` continues from paused progress.
- `cancel()` stops progression and keeps current value.
- `step(deltaMs)` is deterministic and does not depend on wall-clock timers.

## Reduced-motion behavior

- `setMotionPreference('reduced')` makes `createTweenTimeline` and
  `createPropertyTimeline` snap immediately to new targets.
- `transition(..., { respectReducedMotion: true })` also snaps immediately.

## Representative scenarios

### List reorder

- Keep row model positions in `createPropertyTimeline({ y })`.
- On reorder, call `to({ y: nextY }, 180, easing.easeOut)` and step in the frame loop.

### Dialog enter/exit

- Animate `opacity` and `y` together with `createPropertyTimeline`.
- Enter: `to({ opacity: 1, y: 0 }, 220, easing.easeOut)`
- Exit: `to({ opacity: 0, y: -8 }, 140, easing.easeIn)`

### Focus transition polish

- Use `createTweenTimeline` for focus ring alpha or thickness values.
- Interrupt on rapid focus changes; timeline starts from current in-flight value.

## Verification

```bash
npm run test -- packages/core/src/__tests__/animation.test.ts
```

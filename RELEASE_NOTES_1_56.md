# Release notes — 1.56.0 (focusFirstInside + submit_form fallback participation + demo refresh)

## Summary

1.56.0 closes the a11y and MCP telemetry gaps left open in 1.55.0:

- **`@geometra/core`** — new `focusFirstInside(tree, layout, scopePath)` helper pairs with `trapFocusStep` so overlays can seed focus on mount and contain Tab inside the scope.
- **`@geometra/mcp`** — `geometra_submit_form` now participates in transparent fallback telemetry. Fill phase retries sequentially when the batched path throws; submit click runs through `resolveClickLocationWithFallback`. Both signals aggregate into a top-level `fallbacks[]` array matching the shape `geometra_run_actions` already emits.
- **`demos/local-canvas`** — rebuilt around the 1.53.0–1.55.0 surface: `swipeableList`, `animatedDialog`, `animatedSheet`, `animatedToast` all driven from a single `animationLoop`.
- **`INTEGRATION_COOKBOOK.md`** — new "Modal focus policy" recipe composing `focusFirstInside` + `trapFocusStep` + `animatedDialog`.

## @geometra/core — focusFirstInside

Companion to the existing `trapFocusStep`:

```ts
import { focusFirstInside, trapFocusStep } from '@geometra/core'

// On open: seed focus to the first focusable inside the dialog subtree.
focusFirstInside(app.tree, app.layout, DIALOG_PATH)

// On Tab: cycle focus inside the subtree without escaping.
trapFocusStep(app.tree, app.layout, DIALOG_PATH, shiftKey ? 'prev' : 'next')
```

Same resolution rules as `trapFocusStep`: invalid path → `false`, corrupt layout bounds skipped, non-array `children` treated as empty. Returns `true` when focus moved.

## @geometra/mcp — submit_form fallback participation

`geometra_submit_form` now emits the same `fallback` shape as `geometra_click` / `geometra_fill_fields` / `geometra_fill_form` across both internal phases:

```json
{
  "completed": true,
  "fill": { "execution": "sequential", "formId": "fm:0", "fieldCount": 12, "successCount": 12 },
  "submit": { "at": { "x": 320, "y": 480 }, "target": { "role": "button", "name": "Submit" } },
  "fallbacks": [
    { "phase": "fill", "attempted": true, "used": true, "reason": "batched-threw", "attempts": 2 },
    { "phase": "submit", "attempted": true, "used": true, "reason": "relaxed-visibility", "attempts": 2 }
  ],
  "navigated": true,
  "afterUrl": "https://jobs.example.com/confirm"
}
```

Behavior changes:

- **Fill phase**: tries batched `sendFillFields` first. On recoverable errors (`canFallbackToSequentialFill`), falls through to a sequential loop via `executeFillField` — matching `geometra_fill_form`'s resilience. `fill.execution` is `'batched'` or `'sequential'` so callers can see which path won.
- **Submit phase**: routes through `resolveClickLocationWithFallback`. Failed resolution after fallback attempts now returns a structured JSON error carrying `submit_fallback` metadata (same pattern `geometra_click` uses).

Agents: ignore `fallbacks` for flow control. Operators: aggregate per phase and reason to prioritize native fixes, just like `geometra_run_actions` aggregates.

## Demo refresh

`demos/local-canvas` rebuilt around the 1.53.0–1.55.0 primitives:

- `swipeableList` (with keyboard nav and pager dots bound to `currentIndex`)
- `animatedDialog` / `animatedSheet` / `animatedToast` all driven from one `animationLoop`
- The old gesture puck playground was replaced — `swipeableList` is a better reference for the pan recognizer surface

Run it with `npx vite --config demos/local-canvas/vite.config.ts`.

## Migration notes

All additions are additive. No protocol changes. GEOM v1 stays fully compatible.

New exports:

- `@geometra/core`: `focusFirstInside`

No changes to existing export signatures. `geometra_submit_form`'s result payload gains `fill.execution` and (when fallback was used) `fallbacks[]` — both are additive fields.

## Performance notes

- `focusFirstInside` walks the scope subtree once; same cost profile as `trapFocusStep`.
- Submit fallback adds at most one retry on the failure path. Happy-path submits are unchanged.

## Verification

- Full fast suite: 2,463 / 2,463 passing across 87 test files.
- New tests: 3 for `focusFirstInside`, 1 for `submit_form` fallback aggregation.

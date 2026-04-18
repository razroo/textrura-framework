# Release notes — 1.57.0 (draggableSort + vitest cleanup + cookbook fix)

## Summary

1.57.0 adds the second big gesture-driven UI primitive, fixes a long-standing cookbook error, and cleans up the default `vitest run` invocation on a fresh checkout:

- **`@geometra/ui`** — new **`draggableSort`** primitive. Vertical list that reorders via pan gesture (canvas) or keyboard (ArrowUp/Down, Home/End). Complements `swipeableList` to round out the gesture-driven list family.
- **`INTEGRATION_COOKBOOK.md`** — the modal focus policy recipe no longer uses the non-existent `Signal.subscribe(callback)` API; it now uses `effect(() => signal.value)` which is the real Signal observation surface shipped from `@geometra/core`.
- **`vitest.config.ts`** — excludes `tests/e2e/**` so Playwright specs (which import `@playwright/test`) no longer crash a bare `vitest run` on a fresh checkout. Spec runs still happen through the Playwright runner.

## @geometra/ui — draggableSort

Vertical reorderable list. Rows carry their own click + key handlers, so drag and keyboard flows share the same hit pipeline:

```ts
import { draggableSort } from '@geometra/ui'
import { attachGestureRecognizers } from '@geometra/renderer-canvas'

const list = draggableSort({
  items: tasks,
  itemHeight: 48,
  renderItem: (task, { index, isDragging }) =>
    taskRow(task, index, isDragging),
  onReorder: (from, to, next) => saveOrder(next),
})

attachGestureRecognizers(canvas, list.recognizers)

// Imperative rail:
list.moveUp(0)          // bump first task up (no-op at edge)
list.move(3, 0)         // move index 3 to index 0
list.order.value        // current snapshot
list.draggingIndex.value // index held by the user, or null
```

Keyboard rail (bound to each row automatically):

- **ArrowDown / ArrowUp** — move the focused row down / up one slot
- **Home / End** — jump the focused row to the top / bottom

Reorder semantics:

- `itemHeight` is fixed across all rows (variable row height is out of scope).
- Drag uses the pan recognizer's `deltaY` divided by `itemHeight` to compute the target slot; live reorder updates while the pointer is held, committed on release.
- Pointer-cancel keeps the interim reorder (undo is a caller concern).

Scope note: attach `list.recognizers` when there's no other canvas-wide pan consumer. Scoping recognizers to a region is an app-level concern — the local-canvas demo intentionally runs `draggableSort` with keyboard-only input because `swipeableList.recognizers` are already attached canvas-wide.

## Cookbook fix — modal focus policy

The 1.55.0 recipe for composing `focusFirstInside` + `trapFocusStep` + `animatedDialog` used a `dlg.isOpen.subscribe((open) => …)` call. `Signal<T>` in `@geometra/core` exposes `value` / `set` / `peek` — there is no `.subscribe()` method. The correct pattern uses `effect`:

```ts
import { effect } from '@geometra/core'

effect(() => {
  const open = dlg.isOpen.value
  if (!open) return
  queueMicrotask(() => {
    focusFirstInside(app.tree, app.layout, DIALOG_PATH)
  })
})
```

Anyone who followed the 1.55.0 recipe literally would have hit a runtime `TypeError` on the `.subscribe` call. The updated recipe in `INTEGRATION_COOKBOOK.md` uses `effect` and matches the real API.

## vitest cleanup

Before this release, `npx vitest run` (no config parameter) picked up `tests/e2e/full-stack-dashboard.spec.ts` via vitest's default `**/*.spec.ts` glob and crashed on the `@playwright/test` import. `vitest.config.ts` now explicitly excludes `tests/e2e/**` while keeping vitest's default excludes (`node_modules`, `dist`, various build configs).

Consequence: a fresh checkout can run `vitest run` from the repo root and get a clean unit-test pass (2,701 / 2,701 across 92 files). Playwright specs continue to run through `npx playwright test`.

## Migration notes

All additions are additive. No protocol changes. GEOM v1 stays fully compatible.

New exports from `@geometra/ui`:

- `draggableSort<T>`
- Types: `DraggableSort<T>`, `DraggableSortOptions<T>`, `DraggableSortItemState`

No existing export signatures changed.

## Performance notes

- `draggableSort`'s pan path fires only when a row has latched `pendingIndex` at pointerdown — dragging empty space in the list bounds does nothing, matching swipeableList's cost profile.
- `draggableSort.view()` re-renders on `order` / `draggingIndex` changes via signals — no extra reconciler work when idle.
- vitest `exclude` is a bare glob check; no measurable test-suite time change.

## Verification

- Full fast suite: 2,471 / 2,471 passing across 88 test files.
- Default `vitest run` (no config parameter): 2,701 / 2,701 passing across 92 files.
- New tests: 7 for `draggableSort`.

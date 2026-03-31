# Scroll-container keyboard contract (v1)

This contract defines keyboard + focus behavior for scrollable containers.

## Focus retention

- Focus remains on the active focusable element while parent scroll offsets change.
- Scrolling must not implicitly clear or move focus unless the focused node is removed.

## Key routing

- `Tab` / `Shift+Tab` traverse focusable elements in document order across scroll regions.
- Directional keys route to focused handlers first (`onKeyDown`) unless reserved by component logic.
- `Escape` behavior is app-defined but must not silently drop focus without explicit handler logic.

## Wheel and scroll synchronization

- Wheel updates should map to `scrollX` / `scrollY` state updates on scroll containers.
- Keyboard-triggered scroll changes (PageUp/PageDown/Home/End when applicable) should flow through the same state path.
- Renderers should avoid divergent scroll behavior between pointer and keyboard paths.

## Visibility expectations

- After keyboard navigation changes focused node in a scroll region, apps should ensure focused content becomes visible (manual or helper-based scroll-into-view).
- Focus ring and selection visuals should track post-scroll geometry accurately.

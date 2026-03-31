# Migration guide: DOM-centric apps to Geometra

## Layout assumptions

- Replace DOM/CSS layout inspection with geometry from Geometra layout output.
- Treat `Tree -> Yoga -> Geometry -> Pixels` as the source of truth.

## Event assumptions

- Replace native DOM bubbling assumptions with explicit `dispatch` and hit-test routing.
- Keyboard flows are focus-targeted through Geometra focus primitives.

## Rendering assumptions

- Canvas/terminal rendering means no automatic browser semantics unless mirrored explicitly.
- Use semantic props + `toAccessibilityTree`/`toSemanticHTML` for accessibility/SEO outputs.

## Input/selection assumptions

- Text editing behavior should rely on text-input helpers (selection, caret, history, composition).
- IME/composition lifecycle must be wired explicitly for non-DOM surfaces.

## Practical migration sequence

1. Port core state and view tree.
2. Port focus + keyboard routing.
3. Port text input behavior.
4. Add accessibility and semantic outputs.
5. Add renderer-specific smoke + integration tests.

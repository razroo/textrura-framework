# RTL parity matrix (1.1 baseline)

This document tracks the current right-to-left (RTL) and direction-aware behavior
across Geometra packages for the 1.1 baseline milestone.

Status values:

- `pass` - implemented and covered by tests
- `partial` - baseline implemented with documented limits
- `deferred` - planned follow-up work

## Matrix

| Area | Core | Canvas | Terminal | Server/Client protocol | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Direction metadata model (`dir`) | `ltr`/`rtl`/`auto` typed and inherited | Consumed during text-node collection | Consumed for RTL line alignment | Preserved in frame tree payloads | `pass` | `packages/core/src/__tests__/direction.test.ts`, `packages/client/src/__tests__/client-protocol-fixture.test.ts` |
| Horizontal caret movement (left/right, word-jump) | Reading-direction aware | Uses core text-input helpers | N/A (no caret editing model in terminal renderer) | Forwarded key events unaffected | `partial` | `packages/core/src/__tests__/text-input.test.ts` |
| Line-boundary movement (Home/End) | Reading-direction aware | Uses core text-input helpers | N/A | Forwarded key events unaffected | `partial` | `packages/core/src/__tests__/text-input.test.ts` |
| Selection hit-test mapping | Direction-aware mapping in core helpers | Applied in canvas selection pointer flow | N/A (selection highlight not implemented) | N/A | `partial` | `packages/core/src/__tests__/selection.test.ts`, `packages/renderer-canvas/src/__tests__/input-forwarding.test.ts` |
| Caret geometry from measured lines | Direction-aware x mapping | Uses measured line metadata | N/A | Geometry tree unchanged | `pass` | `packages/core/src/__tests__/text-input.test.ts` |
| Text line placement | N/A | RTL line origin aligns to right edge | RTL chunk right-alignment baseline | Tree metadata preserved | `pass` | `packages/renderer-canvas/src/__tests__/visual-regression.test.ts`, `packages/renderer-terminal/src/__tests__/renderer-smoke.test.ts` |

## Known limits (still intentional)

- `dir=auto` currently inherits parent direction; script-level auto direction
  detection is deferred.
- Full Unicode bidi algorithm behavior (complex run reordering/shaping details)
  remains deferred work.
- Terminal renderer does not implement text selection painting or caret editing UI;
  RTL support there is baseline alignment behavior.

## Verification command set

```bash
npm run test -- \
  packages/core/src/__tests__/direction.test.ts \
  packages/core/src/__tests__/text-input.test.ts \
  packages/core/src/__tests__/selection.test.ts \
  packages/renderer-canvas/src/__tests__/visual-regression.test.ts \
  packages/renderer-canvas/src/__tests__/input-forwarding.test.ts \
  packages/renderer-terminal/src/__tests__/renderer-smoke.test.ts

npm run test:perf
```

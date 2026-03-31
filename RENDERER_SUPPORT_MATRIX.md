# Renderer support matrix

This matrix summarizes current backend support status by feature class.

Status:

- `pass` - implemented
- `partial` - implemented with known limits
- `todo` - planned/not implemented

| Feature class | Canvas | Terminal | WebGPU (MVP) |
| --- | --- | --- | --- |
| Tree/layout render integration | `pass` | `pass` | `pass` |
| Solid box backgrounds | `pass` | `pass` | `pass` |
| Text paint | `pass` | `pass` | `todo` |
| Selection highlight | `pass` | `todo` | `todo` |
| Focus ring/debug overlays | `pass` | `todo` | `todo` |
| Gradients/shadows/radius parity | `pass` | `partial` | `todo` |
| Direction baseline (`dir`) support | `pass` | `partial` | `partial` |

## Notes

- WebGPU is intentionally scoped as an MVP backend in 1.3; see
  `RENDER_TARGET_STRATEGY_1_3.md`.
- Renderer-agnostic semantic/accessibility fixture coverage remains in
  `packages/core/src/__tests__/renderer-agnostic-fixture.test.ts`.

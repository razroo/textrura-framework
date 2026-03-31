# Release notes draft - 1.1 RTL baseline

## Summary

- Added a baseline direction model with `dir` support (`ltr`, `rtl`, `auto`) on
  core elements and explicit direction resolution helpers.
- Added RTL-aware caret behavior for horizontal movement, word-jump movement, and
  Home/End line-boundary movement in core text-input helpers.
- Added direction-aware selection hit-testing and caret geometry mapping, plus
  canvas and terminal renderer baseline RTL alignment behavior.

## Migration notes

- Existing apps continue to work unchanged; omitting `dir` preserves inherited
  behavior with root fallback to `ltr`.
- `dir=auto` currently behaves as inheritance, not script detection. Apps that
  require explicit RTL behavior should set `dir: 'rtl'`.
- Terminal renderer supports baseline RTL line alignment but does not implement
  full selection/caret editing visuals.
- Migration guide: `MIGRATION_GUIDE_DOM_TO_GEOMETRA.md`

## Performance notes

- No intentional hot-path regressions were introduced for hit-testing or text
  measurement flows in this baseline.
- `npm run test:perf` passes for core and protocol perf smoke suites.

## Verification

- [x] Focused RTL coverage passes across core/canvas/terminal test suites
- [x] `npm run test:perf`
- [x] Direction parity matrix documented in `RTL_PARITY_MATRIX.md`

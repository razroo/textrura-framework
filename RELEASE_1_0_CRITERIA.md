# 1.0 release criteria and freeze policy

## 1.0 criteria

- Interaction contract is documented and covered by tests across core/canvas/terminal.
- Protocol compatibility policy is explicit and validated by shared conformance fixtures.
- Text input (caret, selection, IME, history) behavior is stable and regression-tested.
- Accessibility tree and semantic output have representative snapshot coverage.
- Performance smoke baselines are passing in CI.

## Freeze policy

- Two-week pre-1.0 freeze on protocol and interaction contract changes.
- Only bug fixes, docs, and test reliability updates allowed during freeze.
- Any protocol or interaction behavior change during freeze requires explicit maintainer sign-off and release note callout.

## Exit criteria from freeze

- Release gate checklist passes without flaky reruns.
- Migration notes and known caveats are updated.
- npm package verification is completed post-release workflow.

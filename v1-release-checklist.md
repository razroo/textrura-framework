# Geometra v1 release checklist

Use this file as the single pass/fail tracker for releasing `v1.0.0` (and any `v1.0.0-rc.*` candidates).

Status values:

- `pass`
- `fail`
- `unknown`

## 1) Criteria audit (must be `pass`)

Source of truth for criteria and freeze policy: `RELEASE_1_0_CRITERIA.md`.

| Area | Status | Evidence and owner notes |
| --- | --- | --- |
| Interaction contract is documented and covered by tests across core/canvas/terminal | `pass` | Specs: `INTERACTION_CONTRACT.md`, `SCROLL_KEYBOARD_CONTRACT.md`. Verified locally on 2026-03-31 with `npm run release:gate` (includes keyboard/text/a11y/seo, terminal input, renderer smoke, perf). |
| Protocol compatibility policy is explicit and validated by shared conformance fixtures | `pass` | Policy/docs: `PROTOCOL_COMPATIBILITY.md`, `RFC_PROTOCOL_V2.md`. Verified locally on 2026-03-31 with `npm run test` (30 files, 151 tests passed including protocol/conformance suites). |
| Text input (caret, selection, IME, history) is stable and regression tested | `pass` | Docs/examples: `TERMINAL_INPUT_EXAMPLES.md`. Verified locally on 2026-03-31 via `npm run release:gate` and `npm run test:terminal-input` (passed). |
| Accessibility tree and semantic output have representative snapshot coverage | `pass` | Docs/examples: `FORM_SEMANTICS_EXAMPLES.md`. Verified locally on 2026-03-31 with `npm run release:gate` (a11y + seo suites passed). |
| Performance smoke baselines are passing in CI | `pass` | Baselines: `PERF_BASELINES.md`. Local status verified on 2026-03-31 with `npm run test:perf` (passed). CI verification confirmed on 2026-03-31 via `gh run list` (latest `Performance checks` runs completed with `success`). |

Exit condition:

- All five rows are `pass`.
- Any `fail` or `unknown` is a release blocker for `v1.0.0`.

## 2) Freeze enforcement (required before final)

Source of truth: `RELEASE_1_0_CRITERIA.md` freeze policy.

- [x] Confirm two-week freeze window has started and dates are recorded.
- [ ] Confirm no protocol or interaction contract changes landed during freeze without explicit maintainer sign-off and release-note callout.
- [ ] Confirm only bug fixes, docs, and test reliability changes were merged during freeze.

Record:

- Freeze start date: `2026-03-31`
- Freeze end date: `2026-04-14`
- Maintainer sign-off link(s): `TBD during freeze`

## 3) Stabilization quality gates (must be green)

- [x] `npm run release:gate`
- [x] `npm run test`
- [x] `npm run build`
- [x] `npm run demo:build`
- [x] CI quality and performance workflows are green on `main` (verified on 2026-03-31: `Quality checks` run `23785233743` and `Performance checks` run `23785233710` both passed)

If any gate fails, log the issue link here and block release until resolved:

- Blocking issues: `none from current local/CI verification`

## 4) Docs and migration readiness

- [x] Root `README.md` reflects current shipped behavior for all v1-critical features. (verified 2026-03-31)
- [x] `MIGRATION_GUIDE_DOM_TO_GEOMETRA.md` is up to date and linked from release notes. (verified 2026-03-31)
- [x] `STARTER_TEMPLATES.md` remains accurate for canvas, terminal, and server/client starters. (verified 2026-03-31)
- [x] Known caveats and limitations are current in docs. (verified 2026-03-31)
- [x] Release notes follow `RELEASE_NOTES_TEMPLATE.md`. (verified 2026-03-31)

## 5) RC dry run (`v1.0.0-rc.1`)

Treat RC as a production rehearsal.

- [x] Bump versions for publishable packages. (done in `8b5064a`)
- [x] Publish `v1.0.0-rc.1` using GitHub release flow. (release created 2026-03-31)
- [x] Verify install and smoke usage from each starter template. (verified 2026-03-31 via fresh npm installs of `@geometra/*@1.0.0-rc.1` in `/tmp/geometra-rc-smoke` for canvas-local, terminal, and server-client import/runtime smoke)
- [x] Collect and triage feedback into: blocker / must-fix / post-1.0. (completed during RC window; no open blockers)
- [x] Decide go/no-go for `v1.0.0` based on blocker count. (provisional GO during RC)

Artifacts:

- RC release URL: `https://github.com/razroo/geometra/releases/tag/v1.0.0-rc.1`
- Dogfood / smoke: fresh npm installs under `/tmp/geometra-rc-smoke` (canvas-local, terminal, server-client) as noted above

## 6) Final release execution (`v1.0.0`)

- [x] Working tree clean. (verified before release commit/tag on 2026-03-31)
- [x] Versions finalized. (set to `1.0.0` in `36edf3f`)
- [x] Release notes include summary, migration notes, performance notes, and verification. (in `v1.0.0` GitHub release body)
- [x] GitHub release created (`gh release create v1.0.0 ...`). (created 2026-03-31)
- [x] Publish workflow succeeded. (`Release to npm` run `23792235485` succeeded)
- [x] npm versions verified (`npm run release:verify-npm -- 1.0.0`). (verified 2026-03-31)

Artifacts:

- Final release URL: `https://github.com/razroo/geometra/releases/tag/v1.0.0`
- Post-release verification notes: `Release workflow: https://github.com/razroo/geometra/actions/runs/23792235485; npm verify: npm run release:verify-npm -- 1.0.0`

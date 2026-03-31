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
| Performance smoke baselines are passing in CI | `unknown` | Baselines: `PERF_BASELINES.md`. Local status verified on 2026-03-31 with `npm run test:perf` (passed). CI green status on `main` still pending confirmation. |

Exit condition:

- All five rows are `pass`.
- Any `fail` or `unknown` is a release blocker for `v1.0.0`.

## 2) Freeze enforcement (required before final)

Source of truth: `RELEASE_1_0_CRITERIA.md` freeze policy.

- [ ] Confirm two-week freeze window has started and dates are recorded.
- [ ] Confirm no protocol or interaction contract changes landed during freeze without explicit maintainer sign-off and release-note callout.
- [ ] Confirm only bug fixes, docs, and test reliability changes were merged during freeze.

Record:

- Freeze start date: `<YYYY-MM-DD>`
- Freeze end date: `<YYYY-MM-DD>`
- Maintainer sign-off link(s): `<PR/issue links>`

## 3) Stabilization quality gates (must be green)

- [x] `npm run release:gate`
- [x] `npm run test`
- [x] `npm run build`
- [x] `npm run demo:build`
- [ ] CI quality and performance workflows are green on `main` (as of 2026-03-31: `Performance checks` pass; `Quality checks` previously failed, local lint errors are fixed and awaiting CI rerun)

If any gate fails, log the issue link here and block release until resolved:

- Blocking issues: `CI rerun required` to confirm `Quality checks` is green after local lint fixes (`npm run lint` now passes with warnings only)

## 4) Docs and migration readiness

- [ ] Root `README.md` reflects current shipped behavior for all v1-critical features.
- [ ] `MIGRATION_GUIDE_DOM_TO_GEOMETRA.md` is up to date and linked from release notes.
- [ ] `STARTER_TEMPLATES.md` remains accurate for canvas, terminal, and server/client starters.
- [ ] Known caveats and limitations are current in docs.
- [ ] Release notes follow `RELEASE_NOTES_TEMPLATE.md`.

## 5) RC dry run (`v1.0.0-rc.1`)

Treat RC as a production rehearsal.

- [ ] Bump versions for publishable packages.
- [ ] Publish `v1.0.0-rc.1` using GitHub release flow.
- [ ] Verify install and smoke usage from each starter template.
- [ ] Collect and triage feedback into: blocker / must-fix / post-1.0.
- [ ] Decide go/no-go for `v1.0.0` based on blocker count.

Artifacts:

- RC release URL: `<link>`
- Dogfood notes: `<doc or issue link>`

## 6) Final release execution (`v1.0.0`)

- [ ] Working tree clean.
- [ ] Versions finalized.
- [ ] Release notes include summary, migration notes, performance notes, and verification.
- [ ] GitHub release created (`gh release create v1.0.0 ...`).
- [ ] Publish workflow succeeded.
- [ ] npm versions verified (`npm run release:verify-npm -- 1.0.0`).

Artifacts:

- Final release URL: `<link>`
- Post-release verification notes: `<doc or issue link>`

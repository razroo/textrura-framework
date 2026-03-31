# Geometra RC Feedback Triage — v1.0.0-rc.1

Track all RC feedback in one place and classify issues by release impact.

## RC under review

- Version: `v1.0.0-rc.1`
- Release URL: `https://github.com/razroo/geometra/releases/tag/v1.0.0-rc.1`
- Freeze window: `2026-03-31` to `2026-04-14`

## Verification completed before feedback window

- Local release gates passed:
  - `npm run release:gate`
  - `npm run test`
  - `npm run build`
  - `npm run demo:build`
- CI passed on `main` (quality + performance + demo deploy)
- RC publish workflow passed
- Fresh npm starter smoke verified from registry in:
  - `/tmp/geometra-rc-smoke/canvas-local`
  - `/tmp/geometra-rc-smoke/terminal`
  - `/tmp/geometra-rc-smoke/server-client`

## Triage buckets

### Blocker (must fix before `v1.0.0`)

Definition:
- Breaks a release criterion (interaction/protocol/input/a11y/perf), OR
- Causes data loss/crash/corruption, OR
- Makes a primary starter path unusable.

Current items:
- None.

### Must-fix (fix before `v1.0.0` unless explicitly waived)

Definition:
- Significant regression in correctness or DX that does not fully block usage.

Current items:
- None.

### Post-1.0 (safe to defer)

Definition:
- Enhancements, polish, or non-critical gaps that do not violate 1.0 criteria.

Current items:
- None recorded yet.

## Intake template (use for each new feedback item)

- Source: `<user/issue/link>`
- Area: `<core|canvas|terminal|server|client|router|ui|docs>`
- Repro: `<minimal steps>`
- Expected:
- Actual:
- Severity: `<blocker|must-fix|post-1.0>`
- Owner:
- Status: `<open|in_progress|resolved|deferred>`
- Link: `<issue/PR>`

## Go / No-Go rubric for `v1.0.0`

Go if all are true:
- Blocker count = `0`
- Must-fix count = `0` (or explicit maintainer waiver with documented rationale)
- Release criteria table remains all `pass`
- Freeze policy has no violations without sign-off + release-note callout
- Final publish dry-run evidence remains green

No-Go if any are true:
- Any open blocker
- Any unresolved freeze-violation without maintainer sign-off
- Any criterion regresses to `fail`/`unknown`

## Current recommendation

- Recommendation: **GO (provisional)**
- Rationale:
  - No blockers or must-fix items recorded.
  - RC release/publish/smoke checks are green.
  - Criteria and quality/perf gates remain pass.
- Re-evaluate immediately if new RC feedback is filed.

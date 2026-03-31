# Release checklist

Use this checklist before creating a new `vX.Y.Z` GitHub release.

## Pre-release

- [ ] Ensure working tree is clean.
- [ ] Update versions for publishable packages.
- [ ] Verify public exports and README/API docs are aligned (`packages/*/README.md`, root `README.md`).
- [ ] Run targeted suites:
  - [ ] `npm run test`
  - [ ] `npm run test:terminal-input`
  - [ ] `npm run test:perf`

## Release notes requirements

- [ ] Summarize behavior changes.
- [ ] Include migration notes for API/protocol changes.
- [ ] Add **performance notes**:
  - mention perf-sensitive changes (hit-test, text metrics, geometry diff)
  - confirm `PERF_BASELINES.md` thresholds remain valid or explain updates

## Publish and verify

- [ ] Push release commit to `main`.
- [ ] Create GitHub release tag (`gh release create vX.Y.Z ...`).
- [ ] Verify release workflow success.
- [ ] Verify npm published versions.

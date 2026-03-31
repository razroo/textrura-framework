# Release checklist

Use this checklist before creating a new `vX.Y.Z` GitHub release.

## Playbook commands

```bash
# 1) version bumps (example)
npm version 0.3.2 --no-git-tag-version -w @geometra/core -w @geometra/renderer-canvas -w @geometra/renderer-terminal -w @geometra/server -w @geometra/client

# 2) required checks
npm run test
npm run test:terminal-input
npm run test:perf

# 3) commit + push
git add .
git commit -m "chore: release vX.Y.Z"
git push origin HEAD

# 4) trigger publish workflow
gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."
```

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
- [ ] Follow `RELEASE_NOTES_TEMPLATE.md` structure.
- [ ] Add **performance notes**:
  - mention perf-sensitive changes (hit-test, text metrics, geometry diff)
  - confirm `PERF_BASELINES.md` thresholds remain valid or explain updates

## Publish and verify

- [ ] Push release commit to `main`.
- [ ] Create GitHub release tag (`gh release create vX.Y.Z ...`).
- [ ] Verify release workflow success.
- [ ] Verify npm published versions.

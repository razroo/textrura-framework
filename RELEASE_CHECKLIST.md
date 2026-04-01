# Release checklist

Use this checklist before creating a new `vX.Y.Z` GitHub release.

## Playbook commands

```bash
# 1) version bumps (example)
npm version 0.3.2 --no-git-tag-version -w @geometra/core -w @geometra/renderer-canvas -w @geometra/renderer-terminal -w @geometra/renderer-webgpu -w @geometra/server -w @geometra/client -w @geometra/ui -w @geometra/router

# 2) verify committed source versions match the intended tag
npm run release:check-source -- 0.3.2

# 3) required checks
npm run test:all
npm run test:terminal-input
npm run test:perf

# 4) commit + push
git add .
git commit -m "chore: release vX.Y.Z"
git push origin HEAD

# 5) trigger publish workflow
gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."
```

## Pre-release

- [ ] Ensure working tree is clean.
- [ ] Update versions for publishable packages (`@geometra/core`, `@geometra/renderer-canvas`, `@geometra/renderer-terminal`, `@geometra/renderer-webgpu`, `@geometra/server`, `@geometra/client`, `@geometra/ui`, `@geometra/router`).
- [ ] Run `npm run release:check-source -- X.Y.Z` to confirm committed manifests already match the release tag.
- [ ] Verify public exports and README/API docs are aligned (`packages/*/README.md`, root `README.md`).
- [ ] Run targeted suites:
  - [ ] `npm run test:all`
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
  - [ ] `npm run release:verify-npm -- X.Y.Z`

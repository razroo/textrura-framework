# Release notes template

Use this template when running:

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."
```

## Summary

- <behavior change 1>
- <behavior change 2>
- <behavior change 3>

## Migration notes

- <breaking/non-backward-compatible changes>
- <required code updates for consumers>
- <protocol compatibility notes if applicable>

## Performance notes

- <hit-test / text metrics / geometry diff impact>
- `npm run test:perf` status

## Verification

- [x] `npm run release:gate`
- [x] CI quality/perf workflows green

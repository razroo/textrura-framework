# Performance baselines (smoke-level)

These thresholds are intentionally conservative and intended as regression guards, not absolute hardware-independent benchmarks.

## Core

- Hit-testing smoke (`packages/core/src/__tests__/perf-smoke.test.ts`):
  - 2000 dispatches on ~300-leaf tree: **<= 200 ms**
- Caret geometry smoke (`packages/core/src/__tests__/perf-smoke.test.ts`):
  - 5000 lookups across many measured lines: **<= 300 ms**

## Server protocol

- Geometry diff smoke (`packages/server/src/__tests__/protocol-perf-smoke.test.ts`):
  - 60 burst diffs on a depth-4 breadth-4 tree: **<= 500 ms**

## Updating baselines

When intentionally changing algorithms:

1. Measure locally and in CI.
2. Update thresholds with rationale in commit/release notes.
3. Ensure limits remain defensive enough to catch accidental regressions.

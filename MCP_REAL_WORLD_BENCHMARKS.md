# MCP Real-World Benchmarks

This repo now includes a small "in the wild" benchmark bundle for Geometra MCP.

The goal is not just "can the task be automated?", but "how much model-facing surface area does the agent need to complete it?" Each harness compares:

- Geometra MCP
- A Playwright MCP-style approximation using `browser_navigate`, `browser_snapshot`, and `browser_run_code`

Each run prints:

- tool turns
- input/output bytes
- approximate tokens
- wall-clock runtime
- a few key payload sizes that explain where the bytes went

## Implemented Now

### `triage`

Local benchmark against `demos/mcp-triage-benchmark`.

What it proves:

- summary-first exploration beats full-page snapshotting on dense repeated-action boards
- `connect({ returnPageModel: true })` plus contextual action targeting keeps the exploration path small
- repeated actions can now be targeted semantically with `sectionText` / `itemText` instead of expanding a whole section

Pass condition:

- open `Northwind renewal blocked` from the `Escalations` queue
- confirm the matching dialog appears

### `swaglabs`

Live public benchmark against [saucedemo.com](https://www.saucedemo.com/).

What it proves:

- Geometra can collapse a public multi-step flow into one auto-connected `geometra_run_actions` call
- repeated `Add to cart` buttons can now be targeted semantically with `itemText` instead of geometry glue
- batched field filling plus semantic waits stay compact across login, cart, and checkout pages
- `geometra_prepare_browser` can move browser launch out of the measured task window so the first real run can attach warm

Pass condition:

- log in with the public demo credentials
- add `Sauce Labs Backpack`
- open cart
- proceed through checkout info
- reach `Checkout: Overview`
- stop before clicking `Finish`

## Commands

Run both harnesses:

```bash
bun run benchmark:mcp-real-world
```

Run only the local triage case:

```bash
bun run benchmark:mcp-real-world:triage
```

Run only the live public checkout case:

```bash
bun run benchmark:mcp-real-world:swaglabs
```

Run the live public case with assertions:

```bash
node scripts/benchmark-mcp-public-flow.mjs --assert
```

Run the live public case with an explicit browser-prepare step before the measured task:

```bash
bun run benchmark:mcp-public-flow:prewarm
```

Run the live public case with a first-class warm-reuse pass:

```bash
bun run benchmark:mcp-public-flow:warm
```

Or through the wrapper:

```bash
bun run benchmark:mcp-real-world:swaglabs:prewarm
```

Or with warm reuse:

```bash
bun run benchmark:mcp-real-world:swaglabs:warm
```

Watch the flows in a headed browser:

```bash
bun run benchmark:mcp-real-world:headed
```

## Reading Results

The most useful comparisons are:

- `Geometra semantic-only` vs `Playwright-style semantic-only`
- `Geometra end-to-end` vs `Playwright-style end-to-end`
- `Geometra browser prep` vs `Playwright-style cold start` when you are evaluating startup separately from the actual task runtime

When Geometra wins, the important question is usually why. The key payload section calls out the main sources:

- `connect(... returnPageModel: true)`, `find_action`, `query`, or `run_actions` payloads on the Geometra side
- `ariaSnapshot` outputs on the Playwright-style side

For public-site runs, expect absolute timings to vary with network conditions. The byte/token comparisons are the more stable signal.

Warm reuse matters for latency:

- Geometra keeps compatible proxy/browser sessions warm by default on disconnect
- cold public runs still include browser startup and initial navigation cost
- `geometra_prepare_browser` now exposes that startup cost directly as a separate MCP step so the next `geometra_run_actions` can attach to a prepared browser
- `--warm-reuse` now codifies that path directly in the public checkout harness by running one cold Geometra pass and then one warm pass against the same pooled browser

Prepared browser mode can also win on the public straight-line flow. On one measured run from this repo, the prepared Swag Labs `geometra_run_actions` task completed in `613 ms` versus `905 ms` for the Playwright-style tool runtime, while using `1567 B` instead of `10674 B`. Public-site timings vary, so use repeated runs when comparing absolute latency.

## Scorecard Template

Use this when comparing runs over time:

| Scenario | Geometra turns | Playwright turns | Geometra bytes | Playwright bytes | Geometra semantic bytes | Playwright semantic bytes | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| triage |  |  |  |  |  |  |  |
| swaglabs |  |  |  |  |  |  |  |

## Next Targets

These are good follow-on cases if we want to expand the bundle beyond the first two harnesses:

- public guest checkout on a larger catalog site
- public admin/demo dashboard triage flow
- public search/filter heavy catalog flow
- form-heavy municipal or intake workflow that stops before final submission

The existing wrapper script is meant to stay small, so adding another case should be "new benchmark script + one new scenario entry".

# MCP Performance Roadmap

This is the execution plan for making `@geometra/mcp` clearly outperform Playwright-style MCP flows on real agent workloads, not just synthetic demos.

## Goals

- Win on agent-facing payload size in every discovery-heavy flow.
- Reach parity or better on live ATS form completion.
- Reduce end-to-end wall-clock time, including browser startup.
- Keep Geometra as the primary interface even when lower-level fallback is needed.

## Success Metrics

- Discovery-heavy workflows: more than `70%` less model-facing payload than Playwright MCP.
- Full multi-step workflows: more than `50%` less model-facing payload than Playwright MCP.
- End-to-end runtime including connect: more than `25%` faster than Playwright MCP on warm paths.
- Live application forms: `invalidCount` parity or better on Ashby, Greenhouse, Lever, and Workday.
- Tool turns: fewer MCP calls than Playwright MCP for the same successful workflow.

## Phase 1: Reliability and Semantic Actions

- Replace coordinate-only fallbacks with stable semantic targets wherever possible.
- Keep reveal, click, and wait flows centered on node ids and semantic filters.
- Close live-site form gaps on ATS workflows before adding more surface area.
- Gate regressions with real MCP-vs-MCP benchmarks, not Playwright stand-ins.

Status:
- `geometra_click` and batch `click` now accept semantic targets and auto-reveal before clicking.

## Phase 2: Lower Chatter Per Task

- Expand one-call server-side batches for common workflows like `connect + page_model`, `reveal + click + wait`, and `fill + validate`.
- Keep default outputs final-only and compact unless the caller explicitly asks for verbose debugging.
- Trim snapshot-like fallback summaries so the model only receives the fields and actions it can use next.

## Phase 3: Runtime Performance

- Add warm proxy pools instead of a single reusable session slot.
- Reuse headed/headless browser contexts aggressively across related workflows.
- Prewarm Chromium for benchmark and agent sessions that are likely to chain multiple tasks.
- Measure warm and cold paths separately so startup cost does not hide interaction efficiency.

Status:
- MCP now keeps a small warm proxy pool instead of a single reusable slot, so compatible headed and headless sessions do not evict each other immediately.

## Phase 4: Transparent Fallback

- Keep the Geometra MCP surface stable even when semantic actions need a lower-level browser escape hatch.
- Detect recoverable action failures and fall back server-side instead of forcing the agent to switch tools.
- Report when fallback was used so the team can prioritize native fixes.

## Benchmark Policy

- Prefer real MCP-vs-MCP comparisons: `@geometra/mcp` versus Playwright MCP.
- Avoid hardcoded local paths in benchmarks; use CLI args, env vars, or repo-relative discovery.
- Track both payload size and wall-clock time on:
  - discovery-heavy page understanding
  - single-page applications
  - long-running multi-step application workflows
  - warm session reuse

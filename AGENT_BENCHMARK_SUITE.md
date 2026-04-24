# Agent Benchmark Suite

The benchmark suite should measure the business value of Geometra's agent-native model against browser automation baselines. The target claim is narrow: for stateful operational software, a trusted geometry + action-contract protocol should reduce context size, tool calls, and security failures while increasing replayability.

## Modes

- `geometra-native`: tree + layout + agent contracts + trace.
- `geometra-mcp`: current Geometra MCP/proxy extraction.
- `playwright-mcp`: DOM/accessibility snapshot automation.
- `vision-computer-use`: screenshot-driven browser use.

## Metrics

- Task success rate.
- Context bytes and approximate token budget.
- Tool call count.
- Median latency.
- Human approval count.
- Security failure count.
- Replay determinism: whether the same trace can be inspected and rerun.
- Postcondition verification rate.

## Scenario Families

- Claims review: approve payout, request evidence, escalate, export audit packet.
- Financial operations: reconcile exceptions, approve transfer, flag suspicious counterparty.
- Internal admin: rotate access, suspend account, export records.
- Compliance queue: classify evidence, attach reason code, produce audit summary.
- Dense data work: sort/filter/select rows where visual order matters.

## Deterministic Harness

The repo includes `benchmarks/agent-native-scenarios.json` and `scripts/benchmark-agent-native-value.mjs`. The harness is intentionally deterministic: it validates scenario shape, prints comparison tables, and asserts that the native mode has better or equal context/tool-call budgets than the baselines in every scenario.

Live browser benchmarks can be layered on top later, but the deterministic harness gives CI a cheap guardrail for the concept pitch.

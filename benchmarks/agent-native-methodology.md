# Agent-Native Benchmark Methodology

`scripts/benchmark-agent-native-value.mjs` is a deterministic value harness. It is not a lab latency benchmark; it is a repeatable scenario model for comparing how much work an AI agent must do when the UI is a native protocol versus when the agent infers state from browser or vision surfaces.

## Scenarios

The scenario data lives in `benchmarks/agent-native-scenarios.json`.

Each scenario describes an enterprise workflow where the agent must inspect a UI state, choose an action, respect policy or approval rules, execute the action, and prove what happened afterward.

Current scenarios:

- `claims-review`: review claim evidence, approve payout, and export audit evidence.
- `compliance-queue`: classify evidence, attach a reason code, and escalate a sanctions hit.
- `access-admin`: review privileged access, approve a temporary role, and export approval evidence.

## Modes

- `geometra-native`: the app exposes semantic geometry snapshots, stable node/action ids, policy metadata, and replayable before/after frames directly through Geometra.
- `geometra-mcp`: the agent uses Geometra MCP/proxy semantics against a web surface. This is still structured, but the app is not itself the native protocol.
- `playwright-mcp`: the agent uses browser automation primitives, DOM/a11y queries, selectors, and manual orchestration.
- `vision-computer-use`: the agent uses screenshot or OCR-style inference and coordinate actions.

## Metrics

- `contextBytes`: approximate structured context the agent must inspect to complete the workflow.
- `toolCalls`: round trips required to inspect, act, wait, verify, and export/replay.
- `medianLatencyMs`: representative median flow latency for the modeled mode.
- `successRate`: expected workflow completion rate under realistic UI variance.
- `humanApprovals`: required human policy checkpoints.
- `securityFailures`: modeled cases where the agent could act on the wrong target, stale state, or insufficiently audited surface.
- `replayable`: whether before/after UI state is available as structured replay data.
- `postconditionChecks`: explicit structured checks attached to the completed action.

## Assertions

`bun run benchmark:agent-native:assert` validates that:

- every scenario contains all required modes and metrics
- native Geometra uses no more context or tool calls than every non-native baseline
- native success rate is not lower than any baseline
- native security failures remain `0`
- native mode is replayable
- native mode includes at least one postcondition check

## Interpreting Results

The most important comparison is not raw speed. The product claim is:

> Browser automation infers what happened. Geometra-native apps expose what happened as the UI protocol.

That shows up as fewer context bytes, fewer tool calls, fewer wrong-target/security failures, and a replay record that includes exact semantic geometry for the frame the agent acted on.

Use the harness for product positioning and regression guardrails. Use separate live benchmarks when measuring actual transport, renderer, or network latency.

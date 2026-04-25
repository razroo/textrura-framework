# Agent-Native UI

Geometra's agent-native layer makes the interface itself the protocol. A normal frontend can expose a DOM, screenshots, accessibility data, and backend APIs. Geometra exposes the computed UI frame directly: exact geometry, semantics, interaction targets, policy metadata, and replayable action history from the same declarative tree that renders pixels.

## Contract

Every rendered frame can produce a semantic geometry snapshot:

```ts
{
  id: 'claims-review:frame:1',
  route: 'claims-review',
  rootBounds: { x: 0, y: 0, width: 1180, height: 760 },
  nodes: [
    {
      id: 'approve-payout',
      role: 'button',
      name: 'Approve payout',
      bounds: { x: 474, y: 512, width: 132, height: 62 },
      hitTarget: { x: 474, y: 512, width: 132, height: 62 },
      visible: true,
      enabled: true,
      focusable: true,
      interactive: true,
      actionId: 'approve-payout'
    }
  ],
  actions: [
    {
      id: 'approve-payout',
      kind: 'approve',
      risk: 'write',
      requiresConfirmation: true,
      bounds: { x: 474, y: 512, width: 132, height: 62 }
    }
  ]
}
```

Use `semantic.id` for stable UI ids. If omitted, Geometra falls back to `agentAction.id`, then `key`, then a path id like `node:0.2`.

## Core APIs

`@geometra/core` exports:

- `collectSemanticGeometry(tree, layout)` for flat exact geometry plus role/name/state per node.
- `createAgentGeometrySnapshot(tree, layout, options)` for auditable frame snapshots.
- `createAgentRuntime(app, options)` for direct app-level commands: `inspect`, `snapshot`, `click`, `focus`, `type`, `key`, `getActionLog`, and `replay`.
- `agentAction(contract, semantic)` and `collectAgentActions(tree, layout)` for business-level action contracts.
- `createAgentGateway()` for policy, approval, execution, notification hooks, trace, and replay around those contracts.

## Runtime Commands

The app runtime operates by semantic geometry id instead of DOM selectors or guessed coordinates:

```ts
const runtime = createAgentRuntime(app, { route: 'claims-review' })

const frame = runtime.inspect()
runtime.click('approve-payout')
runtime.type('agent-note', ' reviewed')
const replay = runtime.replay(runtime.getActionLog())
```

Each command records before/after frame snapshots in the runtime action log. That answers: what did the agent see, which stable target did it use, what exact geometry was active, and what changed afterward.

## Gateway And HTTP

`@geometra/gateway` exposes the same frame-bound contract to external agents:

- `GET /inspect` returns the latest frame, semantic geometry, current actions, and pending approvals.
- `GET /actions` returns contracted business actions plus the latest frame.
- `POST /actions/request` requests an action by id and frame id.
- `POST /actions/approve` approves or denies a pending action.
- `GET /trace` returns the append-only event trace.
- `GET /replay` returns before/after frame snapshots and action outcomes.

The MCP-style tool adapter mirrors this with:

- `geometra_gateway_inspect_frame`
- `geometra_gateway_list_actions`
- `geometra_gateway_request_action`
- `geometra_gateway_approve_action`
- `geometra_gateway_get_trace`
- `geometra_gateway_get_replay`

## Demo

Run the claims workflow demo:

```bash
bun run --filter @geometra/demo-agent-native-ops dev
```

The demo shows:

- a human-rendered Canvas UI
- exact semantic geometry for the same UI
- clicking `approve-payout` by stable id
- typing into `agent-note` by stable id
- policy-gated gateway actions
- trace and replay panels with before/after frame geometry

Run the external-agent HTTP flow:

```bash
bun run demo:agent-native:http
```

That script builds the core/gateway packages, starts a local gateway, calls `/inspect`, requests `approve-payout`, approves it, reads `/replay`, and writes `examples/replays/claims-review.json`.

View the replay summary:

```bash
bun run demo:agent-native:replay
```

The public demo build also includes `/agent-native-ops/` for the claims workflow and `/replay-viewer/` for a visual audit packet viewer backed by `examples/replays/claims-review.json`.

Scaffold an agent-native gateway starter:

```bash
bun run create:app -- ./claims-workstation --template agent-workstation
```

For the vertical starter:

```bash
bun run create:app -- ./claims-compliance --template claims-compliance
```

## Benchmark

Run the deterministic value harness:

```bash
bun run benchmark:agent-native:assert
```

The harness compares Geometra-native operation against MCP/browser/vision-style inference on context bytes, tool calls, latency, success rate, security failures, replayability, and postcondition checks.
See `benchmarks/agent-native-methodology.md` for assumptions and metric definitions.

Run the live protocol-vs-browser-inference harness:

```bash
bun run benchmark:agent-native:live
```

For vertical positioning, see `CLAIMS_COMPLIANCE_WORKSTATIONS.md`.

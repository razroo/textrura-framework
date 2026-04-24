# Geometra Agent-Native Protocol

Geometra's agent-native surface is a deterministic UI snapshot designed for automation before it is designed for screenshots. A conforming surface exposes the same declarative tree used for rendering, the computed geometry used for hit-testing, semantic metadata, explicit agent action contracts, and an append-only action trace.

This protocol is the long-term north star above the current MCP/proxy bridge: agents should reason over trusted UI state and business intent, then invoke narrow actions through policy gates.

## Surface Model

A frame contains:

- `version`: protocol version, currently `geometra.agent-native/0`.
- `route`: stable app route or workflow id.
- `tree`: the Geometra UI tree, with text/image/box/scene nodes and semantic metadata.
- `layout`: computed geometry for the tree, using the same coordinates as renderers and hit-testing.
- `actions`: extracted `AgentActionTarget[]` values from `collectAgentActions(tree, layout)`.
- `trace`: append-only `AgentTrace` events for requested, approved, denied, completed, and failed actions.
- `capabilities`: host-supported tools, confirmation modes, export modes, and replay support.

The invariant: if an action appears in `actions`, its `bounds`, `path`, `role`, `name`, and contract must correspond to the same element the human can inspect in the rendered frame.

## Agent Action Contract

An action contract sits inside `SemanticProps.agentAction`:

```ts
agentAction({
  id: 'approve-payout',
  kind: 'approve',
  title: 'Approve payout',
  risk: 'write',
  requiresConfirmation: true,
  preconditions: ['claim.status === "ready"', 'claim.fraudScore < 0.75'],
  postconditions: ['claim.status === "approved"'],
  audit: { workflow: 'claims-review' },
})
```

The contract is intent-level metadata. Geometry remains the execution coordinate system, but agents and gateways do not need to infer business meaning from pixels or DOM labels.

## Action Request Flow

1. The app renders a frame.
2. The gateway extracts `actions` from tree + layout.
3. The agent requests an action by `id` and optional structured input.
4. The gateway verifies the action exists, is enabled, satisfies policy, and has required approval.
5. The gateway dispatches to app code or a host integration.
6. The app renders the next frame.
7. The gateway appends terminal trace events and verifies postconditions when possible.

## Versioning

The protocol is additive by default:

- Unknown action fields must be preserved in traces and ignored by old clients.
- Removing or changing an action id is a breaking app-surface change.
- New `kind` and `risk` values require a minor protocol revision and conservative gateway defaults.
- A frame must state the protocol version so MCP adapters can down-convert safely.

## Conformance Checklist

- All automation-relevant operations have stable action ids.
- `actions[].bounds` are finite and match the rendered hit target.
- Destructive and external actions require human confirmation unless an explicit policy override is configured.
- Action output is recorded in `AgentTrace` without leaking secrets.
- Replay can reconstruct the frame/action sequence from protocol snapshots and traces.
- The app can still run with no agent gateway attached.

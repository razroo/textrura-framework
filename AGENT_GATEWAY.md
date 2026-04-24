# Geometra Agent Gateway

The Agent Gateway is the product boundary between a Geometra app and external agents. It turns UI frames into policy-aware tools and turns agent actions into audited app operations.

## Responsibilities

- Publish frame snapshots: tree, layout, semantics, contracts, and trace.
- Expose MCP tools such as `list_actions`, `request_action`, `approve_action`, `replay_trace`, and `inspect_frame`.
- Enforce policy by risk level, route, tenant, user, and action id.
- Require human confirmation for external or destructive work unless a tenant policy grants an explicit exception.
- Record every request and result in `AgentTrace`.
- Redact secrets from frame snapshots and traces.
- Verify postconditions when the app exposes state assertions.

## Core API

The first implementation lives in `@geometra/core`:

```ts
const gateway = createAgentGateway({
  sessionId: 'claims-review',
  policy: createAgentGatewayPolicy({
    allowedActionIds: ['approve-payout', 'request-evidence'],
    allowExternalDestructiveByDefault: true,
    requireApprovalForRisks: ['external', 'destructive'],
  }),
  execute: async ({ target, request }) => runWorkflowAction(target.id, request.input),
})

const frame = gateway.setFrame(tree, layout, { route: '/claims' })
const actions = gateway.listActions()
const result = await gateway.requestAction({
  frameId: frame.id,
  actionId: 'approve-payout',
  input: { claimId: 'CLM-1042' },
})

if (result.status === 'awaiting_approval') {
  await gateway.approveAction({ approvalId: result.approvalId!, actor: 'manager' })
}
```

This is not the final network gateway. It is the deterministic core that a browser demo, MCP server, or hosted control plane can build on.

## HTTP Transport

`@geometra/gateway` exposes that core gateway over a small HTTP API:

- `GET /actions`: current frame, available actions, and pending approvals.
- `POST /actions/request`: request an action by id and optional frame id/input.
- `POST /actions/approve`: approve or deny a pending action by `approvalId`.
- `GET /trace`: append-only audit trace.
- `GET /replay`: frame/action replay record.
- `GET /frame`: latest frame snapshot.

The transport is intentionally thin. Policy, stale-frame checks, approvals, redaction, trace, and replay all remain inside the core gateway.

HTTP deployments can also attach:

- API-key auth with tenant ids and `read`, `request`, `approve`, or `admin` scopes.
- A replay store, including a file-backed store for local/self-hosted persistence.
- CORS for browser-hosted operator consoles.

```ts
const server = await createAgentGatewayHttpServer({
  gateway,
  replayStore: new FileAgentGatewayReplayStore({ directory: './replays' }),
  auth: {
    apiKeys: {
      'ops-key': { tenantId: 'acme', subject: 'ops-manager', scopes: ['read', 'approve'] },
      'agent-key': { tenantId: 'acme', subject: 'claims-agent', scopes: ['read', 'request'] },
    },
  },
})
```

## MCP-Style Tools

`createAgentGatewayToolAdapter(gateway)` returns a small tool surface that can be wrapped by an MCP server:

- `geometra_gateway_list_actions`
- `geometra_gateway_request_action`
- `geometra_gateway_approve_action`
- `geometra_gateway_get_trace`
- `geometra_gateway_get_replay`

This keeps the agent interface narrow: list current frame actions, request one by id, approve/deny pending work, and inspect audit/replay output.

## Replay

Replay records:

- Frame snapshots as actions are published.
- The frame before each action request.
- The request actor and redacted input.
- The policy decision.
- The approval actor/decision.
- The executor output or error.
- The next frame snapshot after execution when the app publishes one.

This makes the proof inspectable: an agent requested a named operation against a specific frame, policy handled it, a human approved it when required, and the resulting state is linked back into the replay.

## Deployment Modes

- Sidecar: gateway runs next to an existing Geometra app and translates frames to MCP tools.
- Embedded: app imports gateway middleware and exposes a native agent endpoint.
- Proxy: gateway observes a Geometra-rendered app through the current proxy path for incremental adoption.
- Enterprise control plane: centralized policy, audit export, tenant configuration, and replay storage.

## Product Shape

The initial commercial wedge is not a generic browser driver. It is a workflow automation gateway for internal tools where each action has a business owner, a risk class, and an audit requirement.

The gateway can be sold as:

- A developer platform for building agent-safe internal apps.
- A compliance layer for agent automation.
- A benchmarked alternative to brittle DOM and screenshot automation.
- A trace/replay system for AI-assisted operations.

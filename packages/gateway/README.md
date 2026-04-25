# @geometra/gateway

HTTP and tool adapters for Geometra's agent-safe workflow gateway.

The package wraps a core `AgentGateway` with:

- `GET /inspect`, `GET /actions`, `POST /actions/request`, `POST /actions/approve`
- `GET /trace`, `GET /replay`, `GET /frame`
- tenant-scoped API keys with read/request/approve/admin scopes
- file or memory replay stores
- MCP-style tool adapter functions

Core policy, stale-frame checks, approvals, redaction, trace, and replay remain in `@geometra/core`.

## HTTP Surface

| Endpoint | Scope | Purpose |
| --- | --- | --- |
| `GET /health` | none | Liveness check. |
| `GET /inspect` | `read` | Return the latest frame, semantic geometry, action catalog, and pending approvals. |
| `GET /frame` | `read` | Return the latest frame snapshot. |
| `GET /actions` | `read` | Return available action contracts and pending approvals. |
| `POST /actions/request` | `request` | Request an action by `actionId` and optional `frameId`. |
| `POST /actions/approve` | `approve` | Approve or deny a pending action. |
| `GET /trace` | `read` | Return append-only request/approval/completion events. |
| `GET /replay` | `read` | Return replay frames and action outcomes; accepts `?sessionId=` when backed by a replay store. |

The OpenAPI description for this HTTP surface is maintained in [`openapi.json`](openapi.json).

## Minimal Example

```ts
import { createAgentGateway } from '@geometra/core'
import { createAgentGatewayHttpServer } from '@geometra/gateway'

const gateway = createAgentGateway({
  sessionId: 'claims-review',
  execute: ({ target }) => ({ ok: true, actionId: target.id }),
})

// Call gateway.setFrame(tree, layout, { route: 'claims-review' }) after rendering.
const server = await createAgentGatewayHttpServer({ gateway })
console.log(server.url)
```

External agents should start with `GET /inspect`, request actions with the returned `frame.id`, and read `GET /replay` after completion to preserve the "what the agent saw and clicked" proof.

## Auth, Sessions, And Retention

Use `auth.apiKeys` when exposing the gateway outside a trusted local process:

```ts
await createAgentGatewayHttpServer({
  gateway,
  auth: {
    apiKeys: {
      'reader-key': { tenantId: 'acme', subject: 'auditor', scopes: ['read'] },
      'agent-key': { tenantId: 'acme', subject: 'claims-agent', scopes: ['read', 'request'] },
      'manager-key': { tenantId: 'acme', subject: 'ops-manager', scopes: ['read', 'approve'] },
    },
  },
})
```

For replay retention, pass a replay store:

```ts
import { FileAgentGatewayReplayStore } from '@geometra/gateway'

const replayStore = new FileAgentGatewayReplayStore({ directory: './replays' })
await createAgentGatewayHttpServer({ gateway, replayStore })
```

For sensitive workflows, redact before trace/replay persistence:

```ts
const gateway = createAgentGateway({
  sessionId: 'claims-review',
  redact: (value, context) => context.field === 'input' ? '[redacted input]' : value,
})
```

Approval webhooks can be wired directly through core gateway hooks:

```ts
const gateway = createAgentGateway({
  sessionId: 'claims-review',
  onApprovalRequired: approval => {
    void fetch('https://workflow.example/approvals', {
      method: 'POST',
      body: JSON.stringify(approval),
    })
  },
  onActionResult: result => {
    console.log('gateway result', result.status, result.actionId)
  },
})
```

Use `onApprovalRequired` to notify Slack, PagerDuty, a claims supervisor queue, or an internal workflow engine. Use `onActionResult` to mirror completed, denied, or failed outcomes into your audit warehouse.

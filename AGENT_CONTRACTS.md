# Agent Contracts

Agent contracts are the layer above geometry that makes Geometra more than a canvas renderer for agents. They describe what an operation means, how risky it is, and what policy has to happen before it runs.

## Core API

Use `agentAction(contract, semantic)` to attach an action to a UI element:

```ts
box({
  semantic: agentAction(
    {
      id: 'request-evidence',
      kind: 'submit',
      title: 'Request evidence',
      risk: 'write',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
      postconditions: ['claim.status === "waiting_for_customer"'],
    },
    { role: 'button', ariaLabel: 'Request evidence' },
  ),
  onClick: requestEvidence,
})
```

`collectAgentActions(tree, layout)` produces stable action targets with geometry, path, role, name, enabled state, risk, and confirmation requirements.

## Contract Fields

- `id`: stable id unique within the current route or surface.
- `kind`: action category such as `open`, `select`, `input`, `submit`, `approve`, `reject`, `mutate`, or `export`.
- `title`: human-readable name used in approval prompts and audit logs.
- `risk`: `read`, `write`, `external`, or `destructive`. Missing risk defaults to `write`.
- `requiresConfirmation`: explicit approval gate. If omitted, `external` and `destructive` default to confirmation.
- `inputSchema` / `outputSchema`: JSON-schema-like contracts for structured agent inputs and results.
- `preconditions` / `postconditions`: business assertions for gateways, tests, and replay tools.
- `audit`: JSON-serializable business metadata.

## Gateway Semantics

A gateway should treat an action request as invalid when:

- The id is not present in the current frame.
- The target is disabled.
- The request input does not satisfy `inputSchema`.
- Policy requires confirmation and no approval was recorded.
- The action is stale because a newer frame removed or changed the target.

Agents can still use coordinates for pointer routing, but the id is the durable unit of work. That is the distinction from DOM automation: the gateway executes named business operations against the same geometry the human sees.

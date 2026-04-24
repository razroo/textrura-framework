# Agent-Native Adoption

Geometra can be adopted incrementally. The path should let a team prove automation value on one workflow before rewriting an app.

## Phases

1. Proxy observation: use the existing MCP/proxy path to benchmark current DOM workflows and identify high-value operations.
2. Geometra island: rebuild one dense operational surface in Geometra, keeping the rest of the product unchanged.
3. Contracted workflow: add `agentAction` contracts for the few operations agents are allowed to perform.
4. Gateway policy: put approvals, allowlists, audit traces, and postcondition checks around those contracts.
5. Native app: move more workflow state into Geometra once the team trusts the model.

## Good First Workflows

- High-volume queues with repetitive decisions.
- Internal tools where DOM markup is not user-facing SEO infrastructure.
- Regulated actions that already need approvals and audit trails.
- Dashboards where visual order and hit geometry matter.
- B2B operations where the buyer can measure minutes saved per case.

## Migration Rule

Do not ask teams to replace their app to learn whether agents help. Ask them to expose one workflow with better geometry, contracts, and traceability than their existing browser automation stack.

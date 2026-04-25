import type { AgentGateway, AgentGatewayActionRequest, AgentGatewayApprovalRequest } from '@geometra/core'

export type AgentGatewayToolName =
  | 'geometra_gateway_inspect_frame'
  | 'geometra_gateway_list_actions'
  | 'geometra_gateway_request_action'
  | 'geometra_gateway_approve_action'
  | 'geometra_gateway_get_trace'
  | 'geometra_gateway_get_replay'

export interface AgentGatewayTool {
  name: AgentGatewayToolName
  description: string
  inputSchema: Record<string, unknown>
}

export interface AgentGatewayToolCallResult {
  content: Array<{ type: 'text'; text: string }>
}

export interface AgentGatewayToolAdapter {
  tools: AgentGatewayTool[]
  callTool(name: AgentGatewayToolName, input?: unknown): Promise<AgentGatewayToolCallResult>
}

function jsonText(value: unknown): AgentGatewayToolCallResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

export function createAgentGatewayToolAdapter(gateway: AgentGateway): AgentGatewayToolAdapter {
  const tools: AgentGatewayTool[] = [
    {
      name: 'geometra_gateway_inspect_frame',
      description: 'Inspect the current Geometra frame as exact semantic geometry for every reachable UI node.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'geometra_gateway_list_actions',
      description: 'List the current frame-bound Geometra agent actions and pending approvals.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'geometra_gateway_request_action',
      description: 'Request a frame-bound Geometra agent action by id.',
      inputSchema: {
        type: 'object',
        properties: {
          actionId: { type: 'string' },
          frameId: { type: 'string' },
          input: { type: 'object' },
        },
        required: ['actionId'],
      },
    },
    {
      name: 'geometra_gateway_approve_action',
      description: 'Approve or deny a pending Geometra gateway action.',
      inputSchema: {
        type: 'object',
        properties: {
          approvalId: { type: 'string' },
          actor: { type: 'string' },
          approved: { type: 'boolean' },
        },
        required: ['approvalId'],
      },
    },
    {
      name: 'geometra_gateway_get_trace',
      description: 'Return the append-only gateway trace.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'geometra_gateway_get_replay',
      description: 'Return the gateway replay record.',
      inputSchema: { type: 'object', properties: {} },
    },
  ]

  return {
    tools,
    async callTool(name, input = {}) {
      if (name === 'geometra_gateway_inspect_frame') {
        return jsonText({ frame: gateway.getReplay().frames.at(-1) ?? null })
      }
      if (name === 'geometra_gateway_list_actions') {
        return jsonText({
          frame: gateway.getReplay().frames.at(-1) ?? null,
          actions: gateway.listActions(),
          pendingApprovals: gateway.getPendingApprovals(),
        })
      }
      if (name === 'geometra_gateway_request_action') {
        const result = await gateway.requestAction(input as AgentGatewayActionRequest)
        return jsonText({ result, pendingApprovals: gateway.getPendingApprovals() })
      }
      if (name === 'geometra_gateway_approve_action') {
        const result = await gateway.approveAction(input as AgentGatewayApprovalRequest)
        return jsonText({ result, pendingApprovals: gateway.getPendingApprovals() })
      }
      if (name === 'geometra_gateway_get_trace') {
        return jsonText({ trace: gateway.getTrace() })
      }
      if (name === 'geometra_gateway_get_replay') {
        return jsonText({ replay: gateway.getReplay() })
      }
      throw new Error(`Unknown gateway tool "${name satisfies never}"`)
    },
  }
}

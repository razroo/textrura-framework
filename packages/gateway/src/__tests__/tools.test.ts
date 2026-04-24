import type { ComputedLayout } from 'textura'
import { describe, expect, it } from 'vitest'
import { agentAction, box, createAgentGateway, text } from '@geometra/core'
import { createAgentGatewayToolAdapter } from '../tools.js'

function layout(): ComputedLayout {
  return {
    x: 0,
    y: 0,
    width: 200,
    height: 80,
    children: [{ x: 8, y: 8, width: 120, height: 30, children: [] }],
  }
}

function gateway() {
  const instance = createAgentGateway({
    sessionId: 'tool-session',
    execute: () => ({ ok: true }),
  })
  instance.setFrame(
    box({}, [
      text({
        text: 'Approve',
        font: '14px Inter',
        lineHeight: 18,
        semantic: agentAction({
          id: 'approve-payout',
          kind: 'approve',
          title: 'Approve payout',
          risk: 'write',
        }),
      }),
    ]),
    layout(),
    { id: 'frame-1' },
  )
  return instance
}

function resultJson(result: { content: Array<{ text: string }> }): unknown {
  return JSON.parse(result.content[0]!.text)
}

describe('agent gateway tool adapter', () => {
  it('lists, requests, and returns replay through MCP-style tools', async () => {
    const adapter = createAgentGatewayToolAdapter(gateway())
    expect(adapter.tools.map(tool => tool.name)).toContain('geometra_gateway_request_action')

    const listed = await adapter.callTool('geometra_gateway_list_actions')
    expect(resultJson(listed)).toMatchObject({ actions: [{ id: 'approve-payout' }] })

    const requested = await adapter.callTool('geometra_gateway_request_action', {
      actionId: 'approve-payout',
      frameId: 'frame-1',
    })
    expect(resultJson(requested)).toMatchObject({ result: { status: 'completed' } })

    const replay = await adapter.callTool('geometra_gateway_get_replay')
    expect(resultJson(replay)).toMatchObject({ replay: { actions: [{ actionId: 'approve-payout' }] } })
  })
})

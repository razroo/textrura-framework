import type { ComputedLayout } from 'textura'
import { describe, expect, it } from 'vitest'
import { agentAction, collectAgentActions } from '../agent-contracts.js'
import { box, image, text } from '../elements.js'

describe('agent action contracts', () => {
  it('collects intent-level targets with geometry, role, name, and policy defaults', () => {
    const tree = box({ width: 320, height: 160 }, [
      box(
        {
          width: 140,
          height: 36,
          onClick: () => undefined,
          semantic: agentAction(
            {
              id: 'approve-invoice',
              kind: 'approve',
              title: 'Approve invoice',
              risk: 'write',
              preconditions: ['invoice.status === "ready"'],
              postconditions: ['invoice.status === "approved"'],
            },
            { ariaLabel: 'Approve invoice' },
          ),
        },
        [text({ text: 'Approve', font: '14px Inter', lineHeight: 18 })],
      ),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 320,
      height: 160,
      children: [
        {
          x: 12,
          y: 20,
          width: 140,
          height: 36,
          children: [{ x: 10, y: 8, width: 80, height: 18, children: [] }],
        },
      ],
    }

    expect(collectAgentActions(tree, layout)).toEqual([
      {
        id: 'approve-invoice',
        kind: 'approve',
        title: 'Approve invoice',
        risk: 'write',
        requiresConfirmation: false,
        enabled: true,
        role: 'button',
        name: 'Approve invoice',
        bounds: { x: 12, y: 20, width: 140, height: 36 },
        path: [0],
        contract: {
          id: 'approve-invoice',
          kind: 'approve',
          title: 'Approve invoice',
          risk: 'write',
          preconditions: ['invoice.status === "ready"'],
          postconditions: ['invoice.status === "approved"'],
        },
      },
    ])
  })

  it('defaults destructive and external actions to human confirmation', () => {
    const tree = box({}, [
      image({
        src: '/report.pdf',
        alt: 'Audit packet',
        semantic: agentAction({
          id: 'export-audit-packet',
          kind: 'export',
          title: 'Export audit packet',
          risk: 'external',
        }),
      }),
      box({
        semantic: agentAction({
          id: 'void-policy',
          kind: 'mutate',
          title: 'Void policy',
          risk: 'destructive',
          requiresConfirmation: false,
        }),
      }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 300,
      height: 120,
      children: [
        { x: 0, y: 0, width: 48, height: 48, children: [] },
        { x: 0, y: 60, width: 120, height: 32, children: [] },
      ],
    }

    const actions = collectAgentActions(tree, layout)
    expect(actions[0]?.requiresConfirmation).toBe(true)
    expect(actions[0]?.role).toBe('img')
    expect(actions[0]?.name).toBe('Audit packet')
    expect(actions[1]?.requiresConfirmation).toBe(false)
  })

  it('applies scroll offsets and skips corrupt geometry', () => {
    const tree = box({ scrollX: 10, scrollY: 20 }, [
      text({
        text: 'Escalate',
        font: '14px Inter',
        lineHeight: 18,
        semantic: agentAction({
          id: 'escalate-claim',
          kind: 'submit',
          title: 'Escalate claim',
        }),
      }),
      text({
        text: 'Bad geometry',
        font: '14px Inter',
        lineHeight: 18,
        semantic: agentAction({
          id: 'bad-geometry',
          kind: 'custom',
          title: 'Bad geometry',
        }),
      }),
    ])
    const layout: ComputedLayout = {
      x: 50,
      y: 60,
      width: 240,
      height: 100,
      children: [
        { x: 15, y: 8, width: 90, height: 18, children: [] },
        { x: 15, y: 40, width: Number.NaN, height: 18, children: [] },
      ],
    }

    expect(collectAgentActions(tree, layout).map(target => target.bounds)).toEqual([
      { x: 55, y: 48, width: 90, height: 18 },
    ])
  })
})

import type { ComputedLayout } from 'textura'
import { beforeEach, describe, expect, it } from 'vitest'
import type { App } from '../app.js'
import { createAgentRuntime } from '../agent-runtime.js'
import { box, text } from '../elements.js'
import { clearFocus, setFocus } from '../focus.js'
import { dispatchHit } from '../hit-test.js'
import { dispatchKeyboardEvent, dispatchCompositionEvent } from '../keyboard.js'
import type { EventHandlers, KeyboardHitEvent, UIElement } from '../types.js'

function createStaticApp(tree: UIElement, layout: ComputedLayout): App {
  return {
    tree,
    layout,
    update() {},
    dispatch(eventType: keyof EventHandlers, x: number, y: number, extra?: Record<string, unknown>): boolean {
      const result = dispatchHit(tree, layout, eventType, x, y, extra)
      if (eventType === 'onClick' && result.focusTarget) {
        setFocus(result.focusTarget.element, result.focusTarget.layout)
      }
      return result.handled
    },
    dispatchKey(eventType: 'onKeyDown' | 'onKeyUp', event: Omit<KeyboardHitEvent, 'target'>): boolean {
      return dispatchKeyboardEvent(tree, layout, eventType, event)
    },
    dispatchComposition(eventType, event) {
      return dispatchCompositionEvent(tree, layout, eventType, event)
    },
    destroy() {},
  }
}

describe('agent runtime', () => {
  beforeEach(() => {
    clearFocus()
  })

  it('inspects the current frame and clicks a target by semantic geometry id', () => {
    let clicked = 0
    const tree = box({ semantic: { id: 'surface' } }, [
      box({ width: 100, height: 32, onClick: () => clicked++, semantic: { id: 'approve', role: 'button', ariaLabel: 'Approve' } }, [
        text({ text: 'Approve', font: '14px Inter', lineHeight: 18 }),
      ]),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 240,
      height: 120,
      children: [
        {
          x: 10,
          y: 20,
          width: 100,
          height: 32,
          children: [{ x: 8, y: 7, width: 60, height: 18, children: [] }],
        },
      ],
    }

    const runtime = createAgentRuntime(createStaticApp(tree, layout), {
      route: '/claims',
      now: () => '2026-04-24T12:00:00.000Z',
    })

    expect(runtime.inspect({ id: 'frame-1' })).toMatchObject({
      id: 'frame-1',
      route: '/claims',
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: 'surface' }),
        expect.objectContaining({ id: 'approve' }),
      ]),
    })
    expect(runtime.click('approve')).toMatchObject({
      status: 'completed',
      command: 'click',
      targetId: 'approve',
      handled: true,
    })
    expect(clicked).toBe(1)
    expect(runtime.getActionLog()[0]).toMatchObject({
      id: 'agent-runtime:1',
      command: 'click',
      before: expect.objectContaining({ nodes: expect.any(Array) }),
      after: expect.objectContaining({ nodes: expect.any(Array) }),
    })
  })

  it('focuses and types into a keyboard target, then replays the same command log', () => {
    let typed = ''
    const tree = box({ semantic: { id: 'surface' } }, [
      box({
        width: 160,
        height: 32,
        onKeyDown: event => {
          if (event.key.length === 1) typed += event.key
        },
        semantic: { id: 'notes', role: 'textbox', ariaLabel: 'Claim notes' },
      }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 240,
      height: 120,
      children: [{ x: 10, y: 20, width: 160, height: 32, children: [] }],
    }

    const runtime = createAgentRuntime(createStaticApp(tree, layout))

    expect(runtime.type('notes', 'ok')).toMatchObject({
      status: 'completed',
      command: 'type',
      targetId: 'notes',
      handled: true,
    })
    expect(typed).toBe('ok')

    const replay = runtime.replay(runtime.getActionLog().filter(entry => entry.command === 'type'))
    expect(replay).toMatchObject({ attempted: 1, completed: 1, failed: 0 })
    expect(typed).toBe('okok')
  })

  it('returns failed command results for missing or non-focusable targets', () => {
    const tree = box({}, [text({ text: 'Label', font: '14px Inter', lineHeight: 18, semantic: { id: 'label' } })])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      children: [{ x: 0, y: 0, width: 50, height: 18, children: [] }],
    }
    const runtime = createAgentRuntime(createStaticApp(tree, layout))

    expect(runtime.click('missing')).toMatchObject({
      status: 'failed',
      error: 'target "missing" was not found',
    })
    expect(runtime.focus('label')).toMatchObject({
      status: 'failed',
      error: 'target "label" is not focusable',
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { A11yNode } from '../session.js'

function node(
  role: string,
  name: string | undefined,
  options?: {
    value?: string
    state?: A11yNode['state']
    validation?: A11yNode['validation']
    path?: number[]
    children?: A11yNode[]
    meta?: A11yNode['meta']
  },
): A11yNode {
  return {
    role,
    ...(name ? { name } : {}),
    ...(options?.value ? { value: options.value } : {}),
    ...(options?.state ? { state: options.state } : {}),
    ...(options?.validation ? { validation: options.validation } : {}),
    ...(options?.meta ? { meta: options.meta } : {}),
    bounds: { x: 0, y: 0, width: 120, height: 40 },
    path: options?.path ?? [],
    children: options?.children ?? [],
    focusable: role !== 'group',
  }
}

const mockState = vi.hoisted(() => ({
  currentA11yRoot: node('group', undefined, {
    meta: { pageUrl: 'https://jobs.example.com/application', scrollX: 0, scrollY: 0 },
  }),
  session: {
    tree: { kind: 'box' },
    layout: { x: 0, y: 0, width: 1280, height: 800, children: [] },
    url: 'ws://127.0.0.1:3200',
    updateRevision: 1,
  },
  sendClick: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendType: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendKey: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendFileUpload: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 8000 })),
  sendFieldText: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendFieldChoice: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendListboxPick: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 4500 })),
  sendSelectOption: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendSetChecked: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendWheel: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  waitForUiCondition: vi.fn(async () => true),
}))

vi.mock('../session.js', () => ({
  connect: vi.fn(),
  connectThroughProxy: vi.fn(),
  disconnect: vi.fn(),
  getSession: vi.fn(() => mockState.session),
  sendClick: mockState.sendClick,
  sendType: mockState.sendType,
  sendKey: mockState.sendKey,
  sendFileUpload: mockState.sendFileUpload,
  sendFieldText: mockState.sendFieldText,
  sendFieldChoice: mockState.sendFieldChoice,
  sendListboxPick: mockState.sendListboxPick,
  sendSelectOption: mockState.sendSelectOption,
  sendSetChecked: mockState.sendSetChecked,
  sendWheel: mockState.sendWheel,
  buildA11yTree: vi.fn(() => mockState.currentA11yRoot),
  buildCompactUiIndex: vi.fn(() => ({ nodes: [], context: {} })),
  buildPageModel: vi.fn(() => ({
    viewport: { width: 1280, height: 800 },
    archetypes: ['form'],
    summary: { landmarkCount: 0, formCount: 1, dialogCount: 0, listCount: 0, focusableCount: 2 },
    primaryActions: [],
    landmarks: [],
    forms: [],
    dialogs: [],
    lists: [],
  })),
  expandPageSection: vi.fn(() => null),
  buildUiDelta: vi.fn(() => ({})),
  hasUiDelta: vi.fn(() => false),
  nodeIdForPath: vi.fn((path: number[]) => `n:${path.length > 0 ? path.join('.') : 'root'}`),
  summarizeCompactIndex: vi.fn(() => ''),
  summarizePageModel: vi.fn(() => ''),
  summarizeUiDelta: vi.fn(() => ''),
  waitForUiCondition: mockState.waitForUiCondition,
}))

const { createServer } = await import('../server.js')

function getToolHandler(name: string) {
  const server = createServer() as unknown as {
    _registeredTools: Record<string, { handler: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }>
  }
  return server._registeredTools[name]!.handler
}

describe('batch MCP result shaping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.currentA11yRoot = node('group', undefined, {
      meta: { pageUrl: 'https://jobs.example.com/application', scrollX: 0, scrollY: 420 },
      children: [
        node('textbox', 'Mission', {
          value: 'Ship calm developer tools across browsers and platforms.',
          path: [0],
        }),
        node('textbox', 'Email', {
          value: 'taylor@example.com',
          path: [1],
        }),
      ],
    })
  })

  it('keeps fill_fields minimal output structured and does not echo long essay text', async () => {
    const longAnswer = 'A'.repeat(180)
    const handler = getToolHandler('geometra_fill_fields')

    mockState.currentA11yRoot = node('group', undefined, {
      meta: { pageUrl: 'https://jobs.example.com/application', scrollX: 0, scrollY: 420 },
      children: [
        node('textbox', 'Mission', { value: longAnswer, path: [0] }),
        node('textbox', 'Email', { value: 'taylor@example.com', path: [1] }),
      ],
    })

    const result = await handler({
      fields: [
        { kind: 'text', fieldLabel: 'Mission', value: longAnswer },
        { kind: 'text', fieldLabel: 'Email', value: 'taylor@example.com' },
      ],
      stopOnError: true,
      failOnInvalid: false,
      includeSteps: true,
      detail: 'minimal',
    })

    const text = result.content[0]!.text
    const payload = JSON.parse(text) as Record<string, unknown>
    const steps = payload.steps as Array<Record<string, unknown>>

    expect(text).not.toContain(longAnswer)
    expect(payload).toMatchObject({
      completed: true,
      fieldCount: 2,
      successCount: 2,
      errorCount: 0,
    })
    expect(steps[0]).toMatchObject({
      index: 0,
      kind: 'text',
      ok: true,
      fieldLabel: 'Mission',
      valueLength: 180,
      wait: 'updated',
      readback: { role: 'textbox', valueLength: 180 },
    })
    expect(steps[1]).toMatchObject({
      index: 1,
      kind: 'text',
      ok: true,
      fieldLabel: 'Email',
      value: 'taylor@example.com',
      wait: 'updated',
      readback: { role: 'textbox', value: 'taylor@example.com' },
    })
  })

  it('lets run_actions omit step listings while keeping capped final validation state', async () => {
    const handler = getToolHandler('geometra_run_actions')

    mockState.currentA11yRoot = node('group', undefined, {
      meta: { pageUrl: 'https://jobs.example.com/application', scrollX: 0, scrollY: 2400 },
      children: [
        node('textbox', 'Full name', {
          value: '',
          path: [0],
          state: { invalid: true, required: true },
          validation: { error: 'Enter your full name.' },
        }),
        node('textbox', 'Email', {
          value: '',
          path: [1],
          state: { invalid: true, required: true },
          validation: { error: 'Enter your email.' },
        }),
        node('textbox', 'Phone', {
          value: '',
          path: [2],
          state: { invalid: true, required: true },
          validation: { error: 'Enter your phone number.' },
        }),
        node('textbox', 'Location', {
          value: '',
          path: [3],
          state: { invalid: true, required: true },
          validation: { error: 'Choose a location.' },
        }),
        node('textbox', 'LinkedIn', {
          value: '',
          path: [4],
          state: { invalid: true },
          validation: { error: 'Enter a valid URL.' },
        }),
        node('alert', 'Your form needs corrections', { path: [5] }),
      ],
    })

    const result = await handler({
      actions: [{ type: 'click', x: 320, y: 540 }],
      stopOnError: true,
      includeSteps: false,
      detail: 'minimal',
    })

    const payload = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    const final = payload.final as Record<string, unknown>

    expect(payload).toMatchObject({
      completed: true,
      stepCount: 1,
      successCount: 1,
      errorCount: 0,
    })
    expect(payload).not.toHaveProperty('steps')
    expect(final).toMatchObject({
      pageUrl: 'https://jobs.example.com/application',
      alertCount: 1,
      invalidCount: 5,
    })
    expect((final.invalidFields as unknown[]).length).toBe(4)
    expect((final.alerts as unknown[]).length).toBe(1)
  })
})

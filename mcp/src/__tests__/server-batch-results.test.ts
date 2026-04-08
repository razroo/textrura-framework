import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { A11yNode } from '../session.js'

function node(
  role: string,
  name: string | undefined,
  options?: {
    bounds?: A11yNode['bounds']
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
    bounds: options?.bounds ?? { x: 0, y: 0, width: 120, height: 40 },
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
  formSchemas: [] as Array<Record<string, unknown>>,
  connect: vi.fn(),
  connectThroughProxy: vi.fn(),
  sendClick: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendType: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendKey: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendFileUpload: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 8000 })),
  sendFieldText: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendFieldChoice: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendFillFields: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 6000 })),
  sendListboxPick: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 4500 })),
  sendSelectOption: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendSetChecked: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  sendWheel: vi.fn(async () => ({ status: 'updated' as const, timeoutMs: 2000 })),
  waitForUiCondition: vi.fn(async () => true),
}))

vi.mock('../session.js', () => ({
  connect: mockState.connect,
  connectThroughProxy: mockState.connectThroughProxy,
  disconnect: vi.fn(),
  getSession: vi.fn(() => mockState.session),
  sendClick: mockState.sendClick,
  sendType: mockState.sendType,
  sendKey: mockState.sendKey,
  sendFileUpload: mockState.sendFileUpload,
  sendFieldText: mockState.sendFieldText,
  sendFieldChoice: mockState.sendFieldChoice,
  sendFillFields: mockState.sendFillFields,
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
  buildFormSchemas: vi.fn(() => mockState.formSchemas),
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
    mockState.connect.mockResolvedValue(mockState.session)
    mockState.connectThroughProxy.mockResolvedValue(mockState.session)
    mockState.formSchemas = []
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

  it('returns a compact structured connect payload by default', async () => {
    const handler = getToolHandler('geometra_connect')

    const result = await handler({
      pageUrl: 'https://jobs.example.com/application',
      headless: true,
    })

    const payload = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(payload).toMatchObject({
      connected: true,
      transport: 'proxy',
      wsUrl: 'ws://127.0.0.1:3200',
      pageUrl: 'https://jobs.example.com/application',
    })
    expect(payload).not.toHaveProperty('currentUi')
  })

  it('returns compact form schemas without requiring section expansion', async () => {
    const handler = getToolHandler('geometra_form_schema')
    mockState.formSchemas = [
      {
        formId: 'fm:0',
        name: 'Application',
        fieldCount: 4,
        requiredCount: 3,
        invalidCount: 0,
        fields: [
          { id: 'ff:0.0', kind: 'text', label: 'Full name', required: true },
          { id: 'ff:0.1', kind: 'choice', label: 'Preferred location', required: true },
          { id: 'ff:0.2', kind: 'choice', label: 'Are you legally authorized to work in Germany?', options: ['Yes', 'No'], optionCount: 2 },
          { id: 'ff:0.3', kind: 'toggle', label: 'Share my profile for future roles', controlType: 'checkbox' },
        ],
      },
    ]

    const result = await handler({ maxFields: 20 })
    const payload = JSON.parse(result.content[0]!.text) as { forms: Array<Record<string, unknown>> }

    expect(payload.forms).toEqual([
      expect.objectContaining({
        formId: 'fm:0',
        fieldCount: 4,
        requiredCount: 3,
        invalidCount: 0,
      }),
    ])
  })

  it('fills a form from ids and labels without echoing long essay content', async () => {
    const longAnswer = 'B'.repeat(220)
    const handler = getToolHandler('geometra_fill_form')
    mockState.formSchemas = [
      {
        formId: 'fm:0',
        name: 'Application',
        fieldCount: 4,
        requiredCount: 3,
        invalidCount: 0,
        fields: [
          { id: 'ff:0.0', kind: 'text', label: 'Full name', required: true },
          { id: 'ff:0.1', kind: 'choice', label: 'Are you legally authorized to work in Germany?', options: ['Yes', 'No'], optionCount: 2 },
          { id: 'ff:0.2', kind: 'toggle', label: 'Share my profile for future roles', controlType: 'checkbox' },
          { id: 'ff:0.3', kind: 'text', label: 'Why Geometra?' },
        ],
      },
    ]
    mockState.currentA11yRoot = node('group', undefined, {
      meta: { pageUrl: 'https://jobs.example.com/application', scrollX: 0, scrollY: 640 },
      children: [
        node('textbox', 'Full name', { value: 'Taylor Applicant', path: [0] }),
        node('textbox', 'Why Geometra?', { value: longAnswer, path: [1] }),
        node('checkbox', 'Share my profile for future roles', {
          path: [2],
          state: { checked: true },
        }),
      ],
    })

    const result = await handler({
      valuesById: {
        'ff:0.0': 'Taylor Applicant',
      },
      valuesByLabel: {
        'Are you legally authorized to work in Germany?': true,
        'Share my profile for future roles': true,
        'Why Geometra?': longAnswer,
      },
      includeSteps: true,
      detail: 'minimal',
    })

    const text = result.content[0]!.text
    const payload = JSON.parse(text) as Record<string, unknown>
    const steps = payload.steps as Array<Record<string, unknown>>

    expect(text).not.toContain(longAnswer)
    expect(mockState.sendFieldChoice).toHaveBeenCalledWith(
      mockState.session,
      'Are you legally authorized to work in Germany?',
      'Yes',
      { exact: undefined, query: undefined },
      undefined,
    )
    expect(payload).toMatchObject({
      completed: true,
      formId: 'fm:0',
      requestedValueCount: 4,
      fieldCount: 4,
      successCount: 4,
      errorCount: 0,
    })
    expect(steps[3]).toMatchObject({
      kind: 'text',
      fieldLabel: 'Why Geometra?',
      valueLength: 220,
      readback: { role: 'textbox', valueLength: 220 },
    })
  })

  it('uses batched proxy fill for compact fill_form responses', async () => {
    const handler = getToolHandler('geometra_fill_form')
    mockState.formSchemas = [
      {
        formId: 'fm:0',
        name: 'Application',
        fieldCount: 3,
        requiredCount: 2,
        invalidCount: 0,
        fields: [
          { id: 'ff:0.0', kind: 'text', label: 'Full name', required: true },
          { id: 'ff:0.1', kind: 'choice', label: 'Preferred location', required: true },
          { id: 'ff:0.2', kind: 'toggle', label: 'Share my profile for future roles', controlType: 'checkbox' },
        ],
      },
    ]
    mockState.currentA11yRoot = node('group', undefined, {
      meta: { pageUrl: 'https://jobs.example.com/application', scrollX: 0, scrollY: 640 },
      children: [
        node('textbox', 'Full name', { value: 'Taylor Applicant', path: [0] }),
        node('combobox', 'Preferred location', { value: 'Berlin, Germany', path: [1] }),
        node('checkbox', 'Share my profile for future roles', {
          path: [2],
          state: { checked: true },
        }),
      ],
    })

    const result = await handler({
      valuesById: {
        'ff:0.0': 'Taylor Applicant',
        'ff:0.1': 'Berlin, Germany',
        'ff:0.2': true,
      },
      includeSteps: false,
      detail: 'minimal',
    })

    const payload = JSON.parse(result.content[0]!.text) as Record<string, unknown>

    expect(mockState.sendFillFields).toHaveBeenCalledWith(
      mockState.session,
      [
        { kind: 'text', fieldLabel: 'Full name', value: 'Taylor Applicant' },
        { kind: 'choice', fieldLabel: 'Preferred location', value: 'Berlin, Germany' },
        {
          kind: 'toggle',
          label: 'Share my profile for future roles',
          checked: true,
          controlType: 'checkbox',
        },
      ],
    )
    expect(mockState.sendFieldText).not.toHaveBeenCalled()
    expect(mockState.sendFieldChoice).not.toHaveBeenCalled()
    expect(mockState.sendSetChecked).not.toHaveBeenCalled()
    expect(payload).toMatchObject({
      completed: true,
      execution: 'batched',
      formId: 'fm:0',
      fieldCount: 3,
      successCount: 3,
      errorCount: 0,
    })
    expect(payload).not.toHaveProperty('steps')
  })
})

describe('query and reveal tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lets query disambiguate repeated controls by context text', async () => {
    const handler = getToolHandler('geometra_query')

    mockState.currentA11yRoot = node('group', undefined, {
      meta: { pageUrl: 'https://jobs.example.com/application', scrollX: 0, scrollY: 900 },
      children: [
        node('form', 'Application', {
          path: [0],
          children: [
            node('group', undefined, {
              path: [0, 0],
              children: [
                node('text', 'Are you legally authorized to work here?', { path: [0, 0, 0] }),
                node('button', 'Yes', { path: [0, 0, 1] }),
                node('button', 'No', { path: [0, 0, 2] }),
              ],
            }),
            node('group', undefined, {
              path: [0, 1],
              children: [
                node('text', 'Will you require sponsorship?', { path: [0, 1, 0] }),
                node('button', 'Yes', { path: [0, 1, 1] }),
                node('button', 'No', { path: [0, 1, 2] }),
              ],
            }),
          ],
        }),
      ],
    })

    const result = await handler({
      role: 'button',
      name: 'Yes',
      contextText: 'sponsorship',
    })

    const payload = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>
    expect(payload).toHaveLength(1)
    expect(payload[0]).toMatchObject({
      role: 'button',
      name: 'Yes',
      context: {
        prompt: 'Will you require sponsorship?',
        section: 'Application',
      },
    })
  })

  it('reveals an offscreen target with semantic scrolling instead of requiring manual wheels', async () => {
    const handler = getToolHandler('geometra_reveal')

    mockState.currentA11yRoot = node('group', undefined, {
      bounds: { x: 0, y: 0, width: 1280, height: 800 },
      meta: { pageUrl: 'https://jobs.example.com/application', scrollX: 0, scrollY: 0 },
      children: [
        node('form', 'Application', {
          bounds: { x: 20, y: -200, width: 760, height: 1900 },
          path: [0],
          children: [
            node('button', 'Submit application', {
              bounds: { x: 60, y: 1540, width: 180, height: 40 },
              path: [0, 0],
            }),
          ],
        }),
      ],
    })

    mockState.sendWheel.mockImplementationOnce(async () => {
      mockState.currentA11yRoot = node('group', undefined, {
        bounds: { x: 0, y: 0, width: 1280, height: 800 },
        meta: { pageUrl: 'https://jobs.example.com/application', scrollX: 0, scrollY: 1220 },
        children: [
          node('form', 'Application', {
            bounds: { x: 20, y: -1420, width: 760, height: 1900 },
            path: [0],
            children: [
              node('button', 'Submit application', {
                bounds: { x: 60, y: 320, width: 180, height: 40 },
                path: [0, 0],
              }),
            ],
          }),
        ],
      })
      return { status: 'updated' as const, timeoutMs: 2500 }
    })

    const result = await handler({
      role: 'button',
      name: 'Submit application',
      maxSteps: 3,
      fullyVisible: true,
      timeoutMs: 2500,
    })

    const payload = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(mockState.sendWheel).toHaveBeenCalledWith(
      mockState.session,
      expect.any(Number),
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      2500,
    )
    expect(payload).toMatchObject({
      revealed: true,
      attempts: 1,
      target: {
        role: 'button',
        name: 'Submit application',
        visibility: { fullyVisible: true },
      },
    })
  })
})

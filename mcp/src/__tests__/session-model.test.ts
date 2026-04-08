import { describe, expect, it } from 'vitest'
import {
  buildA11yTree,
  buildCompactUiIndex,
  buildFormSchemas,
  buildPageModel,
  expandPageSection,
  buildUiDelta,
  hasUiDelta,
  summarizeUiDelta,
} from '../session.js'
import type { A11yNode } from '../session.js'

function node(
  role: string,
  name: string | undefined,
  bounds: { x: number; y: number; width: number; height: number },
  options?: {
    path?: number[]
    focusable?: boolean
    value?: string
    state?: A11yNode['state']
    validation?: A11yNode['validation']
    meta?: A11yNode['meta']
    children?: A11yNode[]
  },
): A11yNode {
  return {
    role,
    ...(name ? { name } : {}),
    ...(options?.value ? { value: options.value } : {}),
    ...(options?.state ? { state: options.state } : {}),
    ...(options?.validation ? { validation: options.validation } : {}),
    ...(options?.meta ? { meta: options.meta } : {}),
    bounds,
    path: options?.path ?? [],
    children: options?.children ?? [],
    focusable: options?.focusable ?? false,
  }
}

describe('buildPageModel', () => {
  it('builds a summary-first page model with stable section ids', () => {
    const tree = node('group', undefined, { x: 0, y: 0, width: 1024, height: 768 }, {
      children: [
        node('navigation', 'Primary nav', { x: 0, y: 0, width: 220, height: 80 }, { path: [0] }),
        node('main', undefined, { x: 0, y: 80, width: 1024, height: 688 }, {
          path: [1],
          children: [
            node('form', 'Job application', { x: 40, y: 120, width: 520, height: 280 }, {
              path: [1, 0],
              children: [
                node('textbox', 'Full name', { x: 60, y: 160, width: 300, height: 36 }, { path: [1, 0, 0] }),
                node('textbox', 'Email', { x: 60, y: 208, width: 300, height: 36 }, { path: [1, 0, 1] }),
                node('button', 'Submit application', { x: 60, y: 264, width: 180, height: 40 }, {
                  path: [1, 0, 2],
                  focusable: true,
                }),
              ],
            }),
            node('list', 'Open roles', { x: 600, y: 120, width: 360, height: 280 }, {
              path: [1, 1],
              children: [
                node('listitem', 'Designer', { x: 620, y: 148, width: 320, height: 32 }, { path: [1, 1, 0] }),
                node('listitem', 'Engineer', { x: 620, y: 188, width: 320, height: 32 }, { path: [1, 1, 1] }),
              ],
            }),
          ],
        }),
      ],
    })

    const model = buildPageModel(tree)

    expect(model.viewport).toEqual({ width: 1024, height: 768 })
    expect(model.archetypes).toEqual(expect.arrayContaining(['shell', 'form', 'results']))
    expect(model.summary).toEqual({
      landmarkCount: 3,
      formCount: 1,
      dialogCount: 0,
      listCount: 1,
      focusableCount: 1,
    })
    expect(model.landmarks.map(item => item.id)).toEqual(['lm:0', 'lm:1', 'lm:1.0'])
    expect(model.forms).toHaveLength(1)
    expect(model.forms[0]).toMatchObject({
      id: 'fm:1.0',
      name: 'Job application',
      fieldCount: 2,
      actionCount: 1,
    })
    expect(model.lists[0]).toMatchObject({
      id: 'ls:1.1',
      name: 'Open roles',
      itemCount: 2,
    })
    expect(model.primaryActions).toEqual([
      expect.objectContaining({
        id: 'n:1.0.2',
        role: 'button',
        name: 'Submit application',
      }),
    ])
  })

  it('expands a section by id on demand', () => {
    const tree = node('group', undefined, { x: 0, y: 0, width: 1024, height: 768 }, {
      children: [
        node('main', undefined, { x: 0, y: 0, width: 1024, height: 768 }, {
          path: [0],
          children: [
            node('form', 'Job application', { x: 40, y: 120, width: 520, height: 280 }, {
              path: [0, 0],
              children: [
                node('heading', 'Application', { x: 60, y: 132, width: 200, height: 24 }, { path: [0, 0, 0] }),
                node('textbox', 'Full name*', { x: 60, y: 160, width: 300, height: 36 }, {
                  path: [0, 0, 1],
                  value: 'Taylor Applicant',
                  state: { required: true },
                }),
                node('textbox', 'Email:', { x: 60, y: 208, width: 300, height: 36 }, {
                  path: [0, 0, 2],
                  value: 'taylor@example.com',
                  state: { invalid: true, required: true },
                  validation: { error: 'Please enter a valid email address.' },
                }),
                node('button', 'Submit application', { x: 60, y: 264, width: 180, height: 40 }, {
                  path: [0, 0, 3],
                  focusable: true,
                }),
              ],
            }),
          ],
        }),
      ],
    })

    const detail = expandPageSection(tree, 'fm:0.0')

    expect(detail).toMatchObject({
      id: 'fm:0.0',
      kind: 'form',
      role: 'form',
      name: 'Application',
      summary: {
        headingCount: 1,
        fieldCount: 2,
        requiredFieldCount: 2,
        invalidFieldCount: 1,
        actionCount: 1,
      },
      page: {
        fields: { offset: 0, returned: 2, total: 2, hasMore: false },
        actions: { offset: 0, returned: 1, total: 1, hasMore: false },
      },
    })
    expect(detail?.fields.map(field => field.name)).toEqual(['Full name', 'Email'])
    expect(detail?.fields.map(field => field.value)).toEqual(['Taylor Applicant', 'taylor@example.com'])
    expect(detail?.fields[0]?.state).toEqual({ required: true })
    expect(detail?.fields[1]?.state).toEqual({ invalid: true, required: true })
    expect(detail?.fields[1]?.validation).toEqual({ error: 'Please enter a valid email address.' })
    expect(detail?.fields[1]?.visibility).toMatchObject({ intersectsViewport: true, fullyVisible: true })
    expect(detail?.actions[0]?.scrollHint).toMatchObject({ status: 'visible' })
    expect(detail?.actions.map(action => action.id)).toEqual(['n:0.0.3'])
    expect(detail?.fields[0]).not.toHaveProperty('bounds')
  })

  it('paginates long sections and carries context on repeated answers', () => {
    const tree = node('group', undefined, { x: 0, y: 0, width: 900, height: 700 }, {
      children: [
        node('form', 'Application', { x: 20, y: -120, width: 760, height: 1800 }, {
          path: [0],
          children: [
            node('heading', 'Application', { x: 40, y: 40, width: 240, height: 28 }, { path: [0, 0] }),
            node('textbox', 'Full name', { x: 48, y: 120, width: 320, height: 36 }, {
              path: [0, 1],
              state: { required: true },
            }),
            node('textbox', 'Email', { x: 48, y: 176, width: 320, height: 36 }, {
              path: [0, 2],
              state: { required: true, invalid: true },
              validation: { error: 'Enter a valid email.' },
            }),
            node('textbox', 'Phone', { x: 48, y: 232, width: 320, height: 36 }, {
              path: [0, 3],
              state: { required: true },
            }),
            node('group', undefined, { x: 40, y: 980, width: 520, height: 96 }, {
              path: [0, 4],
              children: [
                node('text', 'Are you legally authorized to work here?', { x: 48, y: 980, width: 340, height: 24 }, {
                  path: [0, 4, 0],
                }),
                node('button', 'Yes', { x: 48, y: 1020, width: 88, height: 40 }, {
                  path: [0, 4, 1],
                  focusable: true,
                }),
                node('button', 'No', { x: 148, y: 1020, width: 88, height: 40 }, {
                  path: [0, 4, 2],
                  focusable: true,
                }),
              ],
            }),
            node('group', undefined, { x: 40, y: 1120, width: 520, height: 96 }, {
              path: [0, 5],
              children: [
                node('text', 'Will you require sponsorship?', { x: 48, y: 1120, width: 260, height: 24 }, {
                  path: [0, 5, 0],
                }),
                node('button', 'Yes', { x: 48, y: 1160, width: 88, height: 40 }, {
                  path: [0, 5, 1],
                  focusable: true,
                }),
                node('button', 'No', { x: 148, y: 1160, width: 88, height: 40 }, {
                  path: [0, 5, 2],
                  focusable: true,
                }),
              ],
            }),
            node('button', 'Submit application', { x: 48, y: 1540, width: 180, height: 40 }, {
              path: [0, 6],
              focusable: true,
            }),
          ],
        }),
      ],
    })

    const detail = expandPageSection(tree, 'fm:0', {
      maxFields: 2,
      fieldOffset: 1,
      onlyRequiredFields: true,
    })

    expect(detail).toMatchObject({
      summary: {
        fieldCount: 3,
        requiredFieldCount: 3,
        invalidFieldCount: 1,
        actionCount: 5,
      },
      page: {
        fields: { offset: 1, returned: 2, total: 3, hasMore: false },
        actions: { offset: 0, returned: 5, total: 5, hasMore: false },
      },
    })
    expect(detail?.fields.map(field => field.name)).toEqual(['Email', 'Phone'])
    expect(detail?.fields[0]?.scrollHint).toMatchObject({ status: 'visible' })
    const authorizedYes = detail?.actions.find(action =>
      action.name === 'Yes' && action.context?.prompt === 'Are you legally authorized to work here?',
    )
    const sponsorshipYes = detail?.actions.find(action =>
      action.name === 'Yes' && action.context?.prompt === 'Will you require sponsorship?',
    )
    expect(authorizedYes).toMatchObject({
      name: 'Yes',
      context: { prompt: 'Are you legally authorized to work here?', section: 'Application' },
      visibility: { fullyVisible: false, offscreenBelow: true },
    })
    expect(sponsorshipYes).toMatchObject({
      name: 'Yes',
      context: { prompt: 'Will you require sponsorship?', section: 'Application' },
      visibility: { fullyVisible: false, offscreenBelow: true },
    })
  })

  it('drops noisy container names and falls back to unnamed summaries', () => {
    const tree = node('group', undefined, { x: 0, y: 0, width: 800, height: 600 }, {
      children: [
        node(
          'form',
          'First Name* Last Name* Email* Phone* Country* Location* Resume* LinkedIn*',
          { x: 20, y: 20, width: 500, height: 400 },
          { path: [0] },
        ),
      ],
    })

    const model = buildPageModel(tree)

    expect(model.forms[0]?.id).toBe('fm:0')
    expect(model.forms[0]?.name).toBeUndefined()
  })
})

describe('buildFormSchemas', () => {
  it('builds a compact fill-oriented schema and collapses repeated answer groups', () => {
    const longEssay = 'Semantic browser automation should be reliable, compact, and predictable across large forms.'
    const tree = node('group', undefined, { x: 0, y: 0, width: 1024, height: 768 }, {
      children: [
        node('form', 'Application', { x: 32, y: 32, width: 760, height: 1500 }, {
          path: [0],
          children: [
            node('textbox', 'Full name', { x: 48, y: 120, width: 320, height: 36 }, {
              path: [0, 0],
              state: { required: true },
            }),
            node('combobox', 'Preferred location', { x: 48, y: 180, width: 320, height: 36 }, {
              path: [0, 1],
              state: { required: true },
              value: 'Berlin, Germany',
              meta: { controlTag: 'select' },
            }),
            node('group', undefined, { x: 40, y: 260, width: 520, height: 96 }, {
              path: [0, 2],
              children: [
                node('text', 'Are you legally authorized to work in Germany?', { x: 48, y: 260, width: 360, height: 24 }, {
                  path: [0, 2, 0],
                }),
                node('button', 'Yes', { x: 48, y: 300, width: 88, height: 40 }, {
                  path: [0, 2, 1],
                  focusable: true,
                  state: { required: true },
                }),
                node('button', 'No', { x: 148, y: 300, width: 88, height: 40 }, {
                  path: [0, 2, 2],
                  focusable: true,
                }),
              ],
            }),
            node('checkbox', 'Share my profile for future roles', { x: 48, y: 400, width: 24, height: 24 }, {
              path: [0, 3],
              focusable: true,
              state: { checked: true },
            }),
            node('textbox', 'Why Geometra?', { x: 48, y: 480, width: 520, height: 180 }, {
              path: [0, 4],
              state: { required: true, invalid: true },
              validation: { error: 'Please enter at least 40 characters.' },
              value: longEssay,
            }),
          ],
        }),
      ],
    })

    const schemas = buildFormSchemas(tree)

    expect(schemas).toHaveLength(1)
    expect(schemas[0]).toMatchObject({
      formId: 'fm:0',
      name: 'Application',
      fieldCount: 5,
      requiredCount: 4,
      invalidCount: 1,
    })
    expect(schemas[0]?.fields).toEqual([
      expect.objectContaining({
        kind: 'text',
        label: 'Full name',
        required: true,
      }),
      expect.objectContaining({
        kind: 'choice',
        label: 'Preferred location',
        choiceType: 'select',
        required: true,
        value: 'Berlin, Germany',
      }),
      expect.objectContaining({
        kind: 'choice',
        label: 'Are you legally authorized to work in Germany?',
        choiceType: 'group',
        required: true,
        optionCount: 2,
        booleanChoice: true,
      }),
      expect.objectContaining({
        kind: 'toggle',
        label: 'Share my profile for future roles',
        checked: true,
        controlType: 'checkbox',
      }),
      expect.objectContaining({
        kind: 'text',
        label: 'Why Geometra?',
        required: true,
        invalid: true,
        valueLength: longEssay.length,
      }),
    ])
    expect(schemas[0]?.fields[2]).not.toHaveProperty('options')
  })

  it('includes explicit options when requested and prefers question prompts over nearby explanatory copy', () => {
    const tree = node('group', undefined, { x: 0, y: 0, width: 900, height: 700 }, {
      children: [
        node('form', 'Application', { x: 20, y: 20, width: 760, height: 480 }, {
          path: [0],
          children: [
            node('group', undefined, { x: 32, y: 80, width: 520, height: 120 }, {
              path: [0, 0],
              children: [
                node('text', 'Will you now or in the future require sponsorship?', { x: 40, y: 80, width: 420, height: 24 }, {
                  path: [0, 0, 0],
                }),
                node('text', 'This intentionally repeats Yes / No labels to test contextual disambiguation.', { x: 40, y: 112, width: 520, height: 24 }, {
                  path: [0, 0, 1],
                }),
                node('button', 'Yes', { x: 40, y: 152, width: 88, height: 40 }, {
                  path: [0, 0, 2],
                  focusable: true,
                }),
                node('button', 'No', { x: 140, y: 152, width: 88, height: 40 }, {
                  path: [0, 0, 3],
                  focusable: true,
                }),
              ],
            }),
          ],
        }),
      ],
    })

    const schema = buildFormSchemas(tree, { includeOptions: true, includeContext: 'always' })[0]
    expect(schema?.fields[0]).toMatchObject({
      kind: 'choice',
      choiceType: 'group',
      label: 'Will you now or in the future require sponsorship?',
      options: ['Yes', 'No'],
      booleanChoice: true,
      context: {
        section: 'Application',
      },
    })
  })
})

describe('buildUiDelta', () => {
  it('captures opened dialogs, state changes, and list count changes', () => {
    const before = node('group', undefined, { x: 0, y: 0, width: 1024, height: 768 }, {
      children: [
        node('main', undefined, { x: 0, y: 0, width: 1024, height: 768 }, {
          path: [0],
          children: [
            node('button', 'Save', { x: 40, y: 40, width: 120, height: 40 }, {
              path: [0, 0],
              focusable: true,
            }),
            node('list', 'Results', { x: 40, y: 120, width: 400, height: 240 }, {
              path: [0, 1],
              children: [
                node('listitem', 'Row 1', { x: 60, y: 144, width: 360, height: 32 }, { path: [0, 1, 0] }),
                node('listitem', 'Row 2', { x: 60, y: 184, width: 360, height: 32 }, { path: [0, 1, 1] }),
              ],
            }),
          ],
        }),
      ],
    })

    const after = node('group', undefined, { x: 0, y: 0, width: 1024, height: 768 }, {
      children: [
        node('main', undefined, { x: 0, y: 0, width: 1024, height: 768 }, {
          path: [0],
          children: [
            node('button', 'Save', { x: 40, y: 40, width: 120, height: 40 }, {
              path: [0, 0],
              focusable: true,
              state: { disabled: true },
            }),
            node('list', 'Results', { x: 40, y: 120, width: 400, height: 280 }, {
              path: [0, 1],
              children: [
                node('listitem', 'Row 1', { x: 60, y: 144, width: 360, height: 32 }, { path: [0, 1, 0] }),
                node('listitem', 'Row 2', { x: 60, y: 184, width: 360, height: 32 }, { path: [0, 1, 1] }),
                node('listitem', 'Row 3', { x: 60, y: 224, width: 360, height: 32 }, { path: [0, 1, 2] }),
              ],
            }),
            node('dialog', 'Save complete', { x: 520, y: 80, width: 280, height: 180 }, {
              path: [0, 2],
              children: [
                node('button', 'Close', { x: 620, y: 200, width: 100, height: 36 }, {
                  path: [0, 2, 0],
                  focusable: true,
                }),
              ],
            }),
          ],
        }),
      ],
    })

    const delta = buildUiDelta(before, after)

    expect(hasUiDelta(delta)).toBe(true)
    expect(delta.dialogsOpened).toHaveLength(1)
    expect(delta.dialogsOpened[0]?.id).toBe('dg:0.2')
    expect(delta.dialogsOpened[0]?.name).toBe('Save complete')
    expect(delta.listCountsChanged).toEqual([
      { id: 'ls:0.1', name: 'Results', beforeCount: 2, afterCount: 3 },
    ])
    expect(delta.updated.some(update =>
      update.after.name === 'Save' && update.changes.some(change => change.includes('disabled')),
    )).toBe(true)

    const summary = summarizeUiDelta(delta)
    expect(summary).toContain('+ dg:0.2 dialog "Save complete" opened')
    expect(summary).toContain('~ ls:0.1 list "Results" items 2 -> 3')
    expect(summary).toContain('~ n:0.0 button "Save": disabled unset -> true')
  })

  it('surfaces checkbox checked-state changes in semantic deltas', () => {
    const before = node('group', undefined, { x: 0, y: 0, width: 640, height: 480 }, {
      children: [
        node('form', 'Application', { x: 20, y: 20, width: 600, height: 220 }, {
          path: [0],
          children: [
            node('checkbox', 'New York, NY', { x: 40, y: 80, width: 24, height: 24 }, {
              path: [0, 0],
              focusable: true,
              state: { checked: false },
            }),
          ],
        }),
      ],
    })

    const after = node('group', undefined, { x: 0, y: 0, width: 640, height: 480 }, {
      children: [
        node('form', 'Application', { x: 20, y: 20, width: 600, height: 220 }, {
          path: [0],
          children: [
            node('checkbox', 'New York, NY', { x: 40, y: 80, width: 24, height: 24 }, {
              path: [0, 0],
              focusable: true,
              state: { checked: true },
            }),
          ],
        }),
      ],
    })

    const delta = buildUiDelta(before, after)
    const summary = summarizeUiDelta(delta)

    expect(delta.updated.some(update =>
      update.after.role === 'checkbox' && update.changes.includes('checked false -> true'),
    )).toBe(true)
    expect(summary).toContain('~ n:0.0 checkbox "New York, NY": checked false -> true')
  })

  it('keeps pinned context nodes and reports viewport/focus/navigation drift', () => {
    const before = node('group', undefined, { x: 0, y: 0, width: 900, height: 700 }, {
      meta: { pageUrl: 'https://jobs.example.com/apply', scrollX: 0, scrollY: 120 },
      children: [
        node('tablist', 'Application tabs', { x: 16, y: -64, width: 420, height: 40 }, { path: [0] }),
        node('form', 'Application', { x: 24, y: -20, width: 760, height: 1400 }, {
          path: [1],
          children: [
            node('textbox', 'Full name', { x: 48, y: 140, width: 320, height: 36 }, {
              path: [1, 0],
              focusable: true,
              state: { focused: true },
            }),
          ],
        }),
      ],
    })

    const after = node('group', undefined, { x: 0, y: 0, width: 900, height: 700 }, {
      meta: { pageUrl: 'https://jobs.example.com/apply?step=details', scrollX: 0, scrollY: 420 },
      children: [
        node('tablist', 'Application tabs', { x: 16, y: -96, width: 420, height: 40 }, { path: [0] }),
        node('form', 'Application', { x: 24, y: -320, width: 760, height: 1400 }, {
          path: [1],
          children: [
            node('textbox', 'Country', { x: 48, y: 182, width: 320, height: 36 }, {
              path: [1, 1],
              focusable: true,
              state: { focused: true },
            }),
          ],
        }),
      ],
    })

    const compact = buildCompactUiIndex(before, { maxNodes: 20 })
    expect(compact.context.pageUrl).toBe('https://jobs.example.com/apply')
    expect(compact.context.scrollY).toBe(120)
    expect(compact.context.focusedNode?.name).toBe('Full name')
    expect(compact.nodes.some(item => item.role === 'tablist' && item.pinned)).toBe(true)
    expect(compact.nodes.some(item => item.role === 'form' && item.pinned)).toBe(true)

    const delta = buildUiDelta(before, after)
    const summary = summarizeUiDelta(delta)

    expect(delta.navigation).toEqual({
      beforeUrl: 'https://jobs.example.com/apply',
      afterUrl: 'https://jobs.example.com/apply?step=details',
    })
    expect(delta.viewport).toEqual({
      beforeScrollX: 0,
      beforeScrollY: 120,
      afterScrollX: 0,
      afterScrollY: 420,
    })
    expect(delta.focus?.before?.name).toBe('Full name')
    expect(delta.focus?.after?.name).toBe('Country')
    expect(summary).toContain('~ viewport scroll (0,120) -> (0,420)')
    expect(summary).toContain('~ focus n:1.0 textbox "Full name" -> n:1.1 textbox "Country"')
    expect(summary).toContain('~ navigation "https://jobs.example.com/apply" -> "https://jobs.example.com/apply?step=details"')
  })

  it('includes control values in compact indexes and semantic deltas', () => {
    const before = node('group', undefined, { x: 0, y: 0, width: 640, height: 480 }, {
      children: [
        node('textbox', 'Location', { x: 20, y: 40, width: 280, height: 36 }, {
          path: [0],
          focusable: true,
          value: 'Austin',
        }),
      ],
    })

    const after = node('group', undefined, { x: 0, y: 0, width: 640, height: 480 }, {
      children: [
        node('textbox', 'Location', { x: 20, y: 40, width: 280, height: 36 }, {
          path: [0],
          focusable: true,
          value: 'Austin, Texas, United States',
        }),
      ],
    })

    const compact = buildCompactUiIndex(after, { maxNodes: 10 })
    expect(compact.nodes[0]).toMatchObject({
      role: 'textbox',
      name: 'Location',
      value: 'Austin, Texas, United States',
    })

    const delta = buildUiDelta(before, after)
    expect(delta.updated).toEqual([
      expect.objectContaining({
        changes: [
          'value "Austin" -> "Austin, Texas, United States"',
        ],
      }),
    ])
    expect(summarizeUiDelta(delta)).toContain('value "Austin" -> "Austin, Texas, United States"')
  })
})

describe('buildA11yTree', () => {
  it('maps required, invalid, busy, and validation text from raw semantic nodes', () => {
    const tree = {
      kind: 'box',
      props: {},
      semantic: {},
      children: [
        {
          kind: 'box',
          props: { value: '' },
          semantic: {
            role: 'textbox',
            ariaLabel: 'Email',
            ariaRequired: true,
            ariaInvalid: true,
            ariaBusy: true,
            validationDescription: 'We will contact you about this role.',
            validationError: 'Please enter a valid email address.',
          },
          handlers: { onClick: true, onKeyDown: true },
        },
      ],
    } as Record<string, unknown>

    const layout = {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      children: [
        {
          x: 24,
          y: 40,
          width: 320,
          height: 36,
          children: [],
        },
      ],
    } as Record<string, unknown>

    const a11y = buildA11yTree(tree, layout)
    expect(a11y.children[0]).toMatchObject({
      role: 'textbox',
      name: 'Email',
      state: { required: true, invalid: true, busy: true },
      validation: {
        description: 'We will contact you about this role.',
        error: 'Please enter a valid email address.',
      },
    })
  })
})

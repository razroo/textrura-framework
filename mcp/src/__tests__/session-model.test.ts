import { describe, expect, it } from 'vitest'
import {
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
    state?: A11yNode['state']
    children?: A11yNode[]
  },
): A11yNode {
  return {
    role,
    ...(name ? { name } : {}),
    ...(options?.state ? { state: options.state } : {}),
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
                node('textbox', 'Full name*', { x: 60, y: 160, width: 300, height: 36 }, { path: [0, 0, 1] }),
                node('textbox', 'Email:', { x: 60, y: 208, width: 300, height: 36 }, { path: [0, 0, 2] }),
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
        actionCount: 1,
      },
    })
    expect(detail?.fields.map(field => field.name)).toEqual(['Full name', 'Email'])
    expect(detail?.actions.map(action => action.id)).toEqual(['n:0.0.3'])
    expect(detail?.fields[0]).not.toHaveProperty('bounds')
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
})

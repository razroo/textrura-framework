import { describe, expect, it } from 'vitest'
import { findNodes } from '../server.js'
import type { A11yNode } from '../session.js'

function node(
  role: string,
  bounds: { x: number; y: number; width: number; height: number },
  options?: {
    name?: string
    value?: string
    path?: number[]
    focusable?: boolean
    state?: A11yNode['state']
    validation?: A11yNode['validation']
    children?: A11yNode[]
  },
): A11yNode {
  return {
    role,
    ...(options?.name ? { name: options.name } : {}),
    ...(options?.value ? { value: options.value } : {}),
    ...(options?.state ? { state: options.state } : {}),
    ...(options?.validation ? { validation: options.validation } : {}),
    bounds,
    path: options?.path ?? [],
    children: options?.children ?? [],
    focusable: options?.focusable ?? false,
  }
}

describe('findNodes', () => {
  it('matches value and checked-state filters generically', () => {
    const tree = node('group', { x: 0, y: 0, width: 800, height: 600 }, {
      children: [
        node('combobox', { x: 20, y: 20, width: 260, height: 36 }, {
          path: [0],
          name: 'Location',
          value: 'Austin, Texas, United States',
          focusable: true,
        }),
        node('textbox', { x: 20, y: 120, width: 260, height: 36 }, {
          path: [1],
          name: 'Email',
          focusable: true,
          state: { invalid: true, required: true, busy: true },
          validation: { error: 'Please enter a valid email address.' },
        }),
        node('checkbox', { x: 20, y: 72, width: 24, height: 24 }, {
          path: [2],
          name: 'Notion Website',
          state: { checked: true },
          focusable: true,
        }),
      ],
    })

    expect(findNodes(tree, { value: 'Austin, Texas' })).toEqual([
      expect.objectContaining({ role: 'combobox', name: 'Location' }),
    ])
    expect(findNodes(tree, { text: 'United States' })).toEqual([
      expect.objectContaining({ role: 'combobox', value: 'Austin, Texas, United States' }),
    ])
    expect(findNodes(tree, { invalid: true, required: true, busy: true })).toEqual([
      expect.objectContaining({ role: 'textbox', name: 'Email' }),
    ])
    expect(findNodes(tree, { text: 'valid email address' })).toEqual([
      expect.objectContaining({ role: 'textbox', name: 'Email' }),
    ])
    expect(findNodes(tree, { role: 'checkbox', checked: true })).toEqual([
      expect.objectContaining({ name: 'Notion Website' }),
    ])
  })
})

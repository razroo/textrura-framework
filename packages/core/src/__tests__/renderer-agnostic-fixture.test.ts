import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { toSemanticHTML } from '../seo.js'
import { toAccessibilityTree } from '../a11y.js'

type Fixture = {
  tree: any
  layout: any
  expectedSemanticIncludes: string[]
  expectedA11yRoles: string[]
}

function flattenRoles(node: any, out: string[] = []): string[] {
  out.push(node.role)
  for (const child of node.children ?? []) flattenRoles(child, out)
  return out
}

describe('renderer-agnostic fixtures', () => {
  it('produces expected semantic and accessibility output from shared fixtures', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('../../../../fixtures/renderer-agnostic/basic-card.json', import.meta.url), 'utf8'),
    ) as Fixture

    const semantic = toSemanticHTML(fixture.tree)
    for (const token of fixture.expectedSemanticIncludes) {
      expect(semantic).toContain(token)
    }

    const a11y = toAccessibilityTree(fixture.tree, fixture.layout)
    expect(flattenRoles(a11y)).toEqual(fixture.expectedA11yRoles)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ComputedLayout } from 'textura'
import { toSemanticHTML } from '../seo.js'
import { toAccessibilityTree, type AccessibilityNode } from '../a11y.js'
import type { UIElement } from '../types.js'

type Fixture = {
  tree: UIElement
  layout: ComputedLayout
  expectedSemanticIncludes: string[]
  expectedA11yRoles: string[]
}

function flattenRoles(node: AccessibilityNode, out: string[] = []): string[] {
  out.push(node.role)
  for (const child of node.children ?? []) flattenRoles(child, out)
  return out
}

const fixtureDir = fileURLToPath(new URL('../../../../fixtures/renderer-agnostic/', import.meta.url))
const fixtureNames = readdirSync(fixtureDir)
  .filter(name => name.endsWith('.json'))
  .sort()

describe('renderer-agnostic fixtures', () => {
  for (const name of fixtureNames) {
    it(`produces expected semantic and accessibility output (${name})`, () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as Fixture

      const semantic = toSemanticHTML(fixture.tree)
      for (const token of fixture.expectedSemanticIncludes) {
        expect(semantic).toContain(token)
      }

      const a11y = toAccessibilityTree(fixture.tree, fixture.layout)
      expect(flattenRoles(a11y)).toEqual(fixture.expectedA11yRoles)
    })
  }
})

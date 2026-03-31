import type { ComputedLayout } from 'textura'
import type { UIElement, BoxElement, TextElement, ImageElement } from './types.js'

export interface AccessibilityBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface AccessibilityNode {
  role: string
  name?: string
  state?: {
    disabled?: boolean
    expanded?: boolean
    selected?: boolean
  }
  bounds: AccessibilityBounds
  path: number[]
  children: AccessibilityNode[]
  focusable: boolean
}

function inferTextRole(element: TextElement): string {
  if (element.semantic?.role) return element.semantic.role
  const tag = element.semantic?.tag
  if (tag && /^h[1-6]$/.test(tag)) return 'heading'
  return 'text'
}

function inferBoxRole(element: BoxElement): string {
  if (element.semantic?.role) return element.semantic.role
  const tag = element.semantic?.tag
  if (tag === 'nav') return 'navigation'
  if (tag === 'main') return 'main'
  if (tag === 'article') return 'article'
  if (tag === 'section') return 'region'
  if (tag === 'ul' || tag === 'ol') return 'list'
  if (tag === 'li') return 'listitem'
  if (tag === 'form') return 'form'
  if (tag === 'label') return 'label'
  if (tag === 'button') return 'button'
  if (tag === 'input') return 'textbox'
  if (element.handlers?.onClick) return 'button'
  return 'group'
}

function inferImageRole(element: ImageElement): string {
  if (element.semantic?.role) return element.semantic.role
  return 'img'
}

function inferName(element: UIElement): string | undefined {
  if (element.semantic?.ariaLabel) return element.semantic.ariaLabel
  if (element.kind === 'text') return element.props.text
  if (element.kind === 'image') return element.semantic?.alt ?? element.props.alt
  return element.semantic?.alt
}

function isFocusable(element: UIElement): boolean {
  if (element.kind !== 'box') return false
  return !!(
    element.handlers?.onClick ||
    element.handlers?.onKeyDown ||
    element.handlers?.onKeyUp
  )
}

function stateFor(element: UIElement): AccessibilityNode['state'] | undefined {
  const s = element.semantic
  if (!s) return undefined
  const state: NonNullable<AccessibilityNode['state']> = {}
  if (s.ariaDisabled !== undefined) state.disabled = s.ariaDisabled
  if (s.ariaExpanded !== undefined) state.expanded = s.ariaExpanded
  if (s.ariaSelected !== undefined) state.selected = s.ariaSelected
  return Object.keys(state).length > 0 ? state : undefined
}

function roleFor(element: UIElement): string {
  if (element.kind === 'text') return inferTextRole(element)
  if (element.kind === 'image') return inferImageRole(element)
  return inferBoxRole(element)
}

function walk(
  element: UIElement,
  layout: ComputedLayout,
  offsetX: number,
  offsetY: number,
  path: number[],
): AccessibilityNode {
  const x = offsetX + layout.x
  const y = offsetY + layout.y
  const children: AccessibilityNode[] = []

  if (element.kind === 'box') {
    const childOffsetX = x - (element.props.scrollX ?? 0)
    const childOffsetY = y - (element.props.scrollY ?? 0)
    for (let i = 0; i < element.children.length; i++) {
      const childLayout = layout.children[i]
      if (childLayout) {
        children.push(walk(element.children[i]!, childLayout, childOffsetX, childOffsetY, [...path, i]))
      }
    }
  }

  return {
    role: roleFor(element),
    name: inferName(element),
    state: stateFor(element),
    bounds: { x, y, width: layout.width, height: layout.height },
    path,
    children,
    focusable: isFocusable(element),
  }
}

/** Build an accessibility tree from UI elements and computed layout geometry. */
export function toAccessibilityTree(tree: UIElement, layout: ComputedLayout): AccessibilityNode {
  return walk(tree, layout, 0, 0, [])
}


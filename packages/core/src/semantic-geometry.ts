import type { ComputedLayout } from 'textura'
import type { AgentActionContract, BoxElement, ImageElement, TextElement, UIElement } from './types.js'
import { collectAgentActions, type AgentActionTarget } from './agent-contracts.js'
import { hasFocusCandidateHandlers } from './focus-candidates.js'
import { layoutBoundsAreFinite, scrollSafeChildOffsets } from './layout-bounds.js'

export interface AgentGeometryBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface AgentGeometryState {
  disabled?: boolean
  readOnly?: boolean
  expanded?: boolean
  selected?: boolean
}

export interface AgentGeometryNode {
  /** Stable public id for agent APIs. Prefer `semantic.id`, then `agentAction.id`, then `key`, then path. */
  id: string
  kind: UIElement['kind']
  role: string
  name?: string
  key?: string
  path: number[]
  bounds: AgentGeometryBounds
  hitTarget: AgentGeometryBounds
  visible: boolean
  enabled: boolean
  focusable: boolean
  interactive: boolean
  state?: AgentGeometryState
  actionId?: string
  action?: AgentActionTarget
}

export interface AgentGeometrySnapshot {
  id: string
  route?: string
  createdAt: string
  rootBounds: AgentGeometryBounds
  nodes: AgentGeometryNode[]
  actions: AgentActionTarget[]
}

export interface AgentGeometrySnapshotOptions {
  id?: string
  route?: string
  createdAt?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function pathKey(path: number[]): string {
  return path.length === 0 ? 'root' : path.join('.')
}

function fallbackId(path: number[]): string {
  return path.length === 0 ? 'root' : `node:${pathKey(path)}`
}

function uniqueId(base: string, counts: Map<string, number>): string {
  const count = counts.get(base) ?? 0
  counts.set(base, count + 1)
  return count === 0 ? base : `${base}#${count + 1}`
}

function roleForText(element: TextElement): string {
  if (element.semantic?.role) return element.semantic.role
  const tag = element.semantic?.tag
  if (tag && /^h[1-6]$/.test(tag)) return 'heading'
  return 'text'
}

function roleForBox(element: BoxElement): string {
  if (element.semantic?.role) return element.semantic.role
  const tag = element.semantic?.tag
  if (tag === 'nav') return 'navigation'
  if (tag === 'main') return 'main'
  if (tag === 'search') return 'search'
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

function roleForImage(element: ImageElement): string {
  return element.semantic?.role ?? 'img'
}

function roleFor(element: UIElement): string {
  if (element.kind === 'text') return roleForText(element)
  if (element.kind === 'image') return roleForImage(element)
  if (element.kind === 'scene3d') return element.semantic?.role ?? 'img'
  return roleForBox(element)
}

function nameFor(element: UIElement): string | undefined {
  if (element.semantic?.ariaLabel) return element.semantic.ariaLabel
  if (element.kind === 'text') return element.props.text
  if (element.kind === 'image') return element.semantic?.alt ?? element.props.alt
  return element.semantic?.alt
}

function stateFor(element: UIElement): AgentGeometryState | undefined {
  const semantic = element.semantic
  if (!semantic) return undefined
  const state: AgentGeometryState = {}
  if (semantic.ariaDisabled !== undefined) state.disabled = semantic.ariaDisabled
  if (semantic.ariaReadOnly !== undefined) state.readOnly = semantic.ariaReadOnly
  if (semantic.ariaExpanded !== undefined) state.expanded = semantic.ariaExpanded
  if (semantic.ariaSelected !== undefined) state.selected = semantic.ariaSelected
  return Object.keys(state).length > 0 ? state : undefined
}

function isInteractive(element: UIElement): boolean {
  if (element.kind !== 'box') return false
  const handlers = element.handlers
  return Boolean(
    handlers?.onClick ||
      handlers?.onPointerDown ||
      handlers?.onPointerUp ||
      handlers?.onPointerMove ||
      handlers?.onWheel ||
      handlers?.onKeyDown ||
      handlers?.onKeyUp ||
      handlers?.onCompositionStart ||
      handlers?.onCompositionUpdate ||
      handlers?.onCompositionEnd,
  )
}

function idFor(element: UIElement, path: number[]): string {
  return element.semantic?.id ?? element.semantic?.agentAction?.id ?? element.key ?? fallbackId(path)
}

function walk(
  element: UIElement,
  layout: ComputedLayout,
  offsetX: number,
  offsetY: number,
  path: number[],
  actionsByPath: Map<string, AgentActionTarget>,
  counts: Map<string, number>,
  out: AgentGeometryNode[],
): void {
  if (!layoutBoundsAreFinite(layout)) return

  const x = offsetX + layout.x
  const y = offsetY + layout.y
  if (!Number.isFinite(x) || !Number.isFinite(y)) return

  const bounds = { x, y, width: layout.width, height: layout.height }
  const action = actionsByPath.get(pathKey(path))
  const focusable = element.kind === 'box' && hasFocusCandidateHandlers(element.handlers)
  const node: AgentGeometryNode = {
    id: uniqueId(idFor(element, path), counts),
    kind: element.kind,
    role: roleFor(element),
    ...(nameFor(element) !== undefined ? { name: nameFor(element) } : {}),
    ...(element.key !== undefined ? { key: element.key } : {}),
    path,
    bounds,
    hitTarget: bounds,
    visible: layout.width > 0 && layout.height > 0,
    enabled: element.semantic?.ariaDisabled !== true,
    focusable,
    interactive: isInteractive(element),
    ...(stateFor(element) !== undefined ? { state: stateFor(element) } : {}),
    ...(element.semantic?.agentAction !== undefined
      ? { actionId: (element.semantic.agentAction as AgentActionContract).id }
      : {}),
    ...(action !== undefined ? { action } : {}),
  }
  out.push(node)

  if (element.kind !== 'box') return
  const childOrigin = scrollSafeChildOffsets(x, y, element.props.scrollX, element.props.scrollY)
  if (!childOrigin) return

  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i]
    const childLayout = layout.children[i]
    if (child && childLayout) {
      walk(child, childLayout, childOrigin.ox, childOrigin.oy, [...path, i], actionsByPath, counts, out)
    }
  }
}

/** Collect a flat, protocol-friendly view of the rendered UI: exact geometry plus semantics for every node. */
export function collectSemanticGeometry(tree: UIElement, layout: ComputedLayout): AgentGeometryNode[] {
  const actions = collectAgentActions(tree, layout)
  const actionsByPath = new Map(actions.map(action => [pathKey(action.path), action]))
  const nodes: AgentGeometryNode[] = []
  walk(tree, layout, 0, 0, [], actionsByPath, new Map(), nodes)
  return nodes
}

/** Create an auditable frame snapshot for agents, gateways, tests, and replay logs. */
export function createAgentGeometrySnapshot(
  tree: UIElement,
  layout: ComputedLayout,
  options: AgentGeometrySnapshotOptions = {},
): AgentGeometrySnapshot {
  const createdAt = options.createdAt ?? nowIso()
  return {
    id: options.id ?? `geom:${createdAt}`,
    ...(options.route !== undefined ? { route: options.route } : {}),
    createdAt,
    rootBounds: { x: layout.x, y: layout.y, width: layout.width, height: layout.height },
    nodes: collectSemanticGeometry(tree, layout),
    actions: collectAgentActions(tree, layout),
  }
}

import type { ComputedLayout } from 'textura'
import type { AgentActionContract, SemanticProps, UIElement } from './types.js'
import { layoutBoundsAreFinite, scrollSafeChildOffsets } from './layout-bounds.js'

export interface AgentActionTarget {
  id: string
  kind: AgentActionContract['kind']
  title: string
  description?: string
  risk: NonNullable<AgentActionContract['risk']>
  requiresConfirmation: boolean
  enabled: boolean
  role: string
  name?: string
  bounds: { x: number; y: number; width: number; height: number }
  path: number[]
  contract: AgentActionContract
}

function roleFor(element: UIElement): string {
  if (element.semantic?.role) return element.semantic.role
  if (element.kind === 'text') return 'text'
  if (element.kind === 'image' || element.kind === 'scene3d') return 'img'
  if (element.kind === 'box' && element.handlers?.onClick) return 'button'
  return 'group'
}

function nameFor(element: UIElement): string | undefined {
  if (element.semantic?.ariaLabel) return element.semantic.ariaLabel
  if (element.kind === 'text') return element.props.text
  if (element.kind === 'image') return element.semantic?.alt ?? element.props.alt
  return element.semantic?.alt
}

function normalizeRisk(contract: AgentActionContract): NonNullable<AgentActionContract['risk']> {
  return contract.risk ?? 'write'
}

function normalizeConfirmation(contract: AgentActionContract): boolean {
  if (contract.requiresConfirmation !== undefined) return contract.requiresConfirmation
  return normalizeRisk(contract) === 'destructive' || normalizeRisk(contract) === 'external'
}

/** Attach an agent action contract to existing semantic metadata. */
export function agentAction(
  contract: AgentActionContract,
  semantic: Omit<SemanticProps, 'agentAction'> = {},
): SemanticProps {
  return { ...semantic, agentAction: contract }
}

function walkAgentActions(
  element: UIElement,
  layout: ComputedLayout,
  offsetX: number,
  offsetY: number,
  path: number[],
  out: AgentActionTarget[],
): void {
  if (!layoutBoundsAreFinite(layout)) return

  const x = offsetX + layout.x
  const y = offsetY + layout.y
  if (!Number.isFinite(x) || !Number.isFinite(y)) return

  const contract = element.semantic?.agentAction
  if (contract) {
    const name = nameFor(element)
    out.push({
      id: contract.id,
      kind: contract.kind,
      title: contract.title,
      ...(contract.description !== undefined ? { description: contract.description } : {}),
      risk: normalizeRisk(contract),
      requiresConfirmation: normalizeConfirmation(contract),
      enabled: element.semantic?.ariaDisabled !== true,
      role: roleFor(element),
      ...(name !== undefined ? { name } : {}),
      bounds: { x, y, width: layout.width, height: layout.height },
      path,
      contract,
    })
  }

  if (element.kind !== 'box') return
  const childOrigin = scrollSafeChildOffsets(x, y, element.props.scrollX, element.props.scrollY)
  if (!childOrigin) return

  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i]
    const childLayout = layout.children[i]
    if (child && childLayout) {
      walkAgentActions(child, childLayout, childOrigin.ox, childOrigin.oy, [...path, i], out)
    }
  }
}

/** Extract all agent-native action contracts from a rendered tree and its computed layout. */
export function collectAgentActions(tree: UIElement, layout: ComputedLayout): AgentActionTarget[] {
  const out: AgentActionTarget[] = []
  walkAgentActions(tree, layout, 0, 0, [], out)
  return out
}

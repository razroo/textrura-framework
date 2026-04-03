import type { ComputedLayout } from 'textura'
import type { Renderer, UIElement } from '@geometra/core'

/** Paint-free {@link Renderer} for headless / agent clients that only consume wire messages. */
export function createNoopRenderer(): Renderer {
  return {
    render(_layout: ComputedLayout, _tree: UIElement): void {},
    destroy(): void {},
  }
}

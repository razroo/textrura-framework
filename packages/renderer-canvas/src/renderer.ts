import type { ComputedLayout } from 'textura'
import type { Renderer, UIElement, BoxElement, TextElement, SelectionRange, TextNodeInfo, TextLineInfo } from '@geometra/core'
import { collectTextNodes, getSelectedText, hitTestText } from '@geometra/core'

export interface CanvasRendererOptions {
  /** Canvas element to render into. */
  canvas: HTMLCanvasElement
  /** Device pixel ratio for crisp rendering. Default: window.devicePixelRatio. */
  dpr?: number
  /** Background color for the canvas. Default: '#ffffff'. */
  background?: string
  /** Highlight color for text selection. Default: 'rgba(59, 130, 246, 0.35)'. */
  selectionColor?: string
}

export class CanvasRenderer implements Renderer {
  private ctx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private dpr: number
  private background: string
  private selectionColor: string

  /** Text nodes collected during the last render (for selection hit-testing). */
  textNodes: TextNodeInfo[] = []
  /** Current text selection range, or null if nothing is selected. */
  selection: SelectionRange | null = null

  /** Index used during rendering to assign text node indices. */
  private textNodeIndex = 0

  constructor(options: CanvasRendererOptions) {
    this.canvas = options.canvas
    this.dpr = options.dpr ?? window.devicePixelRatio
    this.background = options.background ?? '#ffffff'
    this.selectionColor = options.selectionColor ?? 'rgba(59, 130, 246, 0.35)'

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2d context')
    this.ctx = ctx
  }

  render(layout: ComputedLayout, tree: UIElement): void {
    const { ctx, canvas, dpr } = this

    // Size canvas to layout
    canvas.width = layout.width * dpr
    canvas.height = layout.height * dpr
    canvas.style.width = `${layout.width}px`
    canvas.style.height = `${layout.height}px`
    ctx.scale(dpr, dpr)

    // Clear
    ctx.fillStyle = this.background
    ctx.fillRect(0, 0, layout.width, layout.height)

    // Collect selectable text nodes
    this.textNodes = []
    collectTextNodes(tree, layout, 0, 0, this.textNodes)

    // Populate line info for each text node (needs ctx.measureText)
    for (const node of this.textNodes) {
      this.computeTextNodeLines(node)
    }

    // Paint tree
    this.textNodeIndex = 0
    this.paintNode(tree, layout, 0, 0)

    // Reset transform for next frame
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  /** Compute character-level positions for a text node. */
  private computeTextNodeLines(node: TextNodeInfo): void {
    const { ctx } = this
    ctx.font = node.element.props.font
    const { lineHeight } = node.element.props

    const wrappedLines = this.wrapText(node.element.props.text, node.width)
    const lines: TextLineInfo[] = []

    for (let i = 0; i < wrappedLines.length; i++) {
      const lineText = wrappedLines[i]!
      const lineY = node.y + i * lineHeight
      const charOffsets: number[] = []
      const charWidths: number[] = []

      let xOffset = 0
      for (let c = 0; c < lineText.length; c++) {
        charOffsets.push(xOffset)
        const w = ctx.measureText(lineText[c]!).width
        charWidths.push(w)
        xOffset += w
      }

      lines.push({ text: lineText, x: node.x, y: lineY, charOffsets, charWidths })
    }

    node.lines = lines
  }

  private paintNode(
    element: UIElement,
    layout: ComputedLayout,
    offsetX: number,
    offsetY: number,
  ): void {
    const x = offsetX + layout.x
    const y = offsetY + layout.y
    const { width, height } = layout

    if (element.kind === 'box') {
      this.paintBox(element, layout, x, y, width, height)
      for (let i = 0; i < element.children.length; i++) {
        const childLayout = layout.children[i]
        if (childLayout) {
          this.paintNode(element.children[i]!, childLayout, x, y)
        }
      }
    } else {
      this.paintText(element, x, y, width, height)
    }
  }

  private paintBox(
    element: BoxElement,
    _layout: ComputedLayout,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const { ctx } = this
    const { backgroundColor, borderColor, borderRadius, opacity } = element.props

    if (opacity !== undefined) ctx.globalAlpha = opacity

    if (backgroundColor) {
      ctx.fillStyle = backgroundColor
      if (borderRadius) {
        this.roundRect(x, y, width, height, borderRadius)
        ctx.fill()
      } else {
        ctx.fillRect(x, y, width, height)
      }
    }

    if (borderColor) {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1
      if (borderRadius) {
        this.roundRect(x, y, width, height, borderRadius)
        ctx.stroke()
      } else {
        ctx.strokeRect(x, y, width, height)
      }
    }

    if (opacity !== undefined) ctx.globalAlpha = 1
  }

  private paintText(
    element: TextElement,
    x: number,
    y: number,
    _width: number,
    _height: number,
  ): void {
    const { ctx } = this
    const { text, font, color, backgroundColor, lineHeight, opacity, selectable } = element.props

    if (opacity !== undefined) ctx.globalAlpha = opacity

    if (backgroundColor) {
      ctx.fillStyle = backgroundColor
      ctx.fillRect(x, y, _width, _height)
    }

    ctx.font = font
    ctx.fillStyle = color ?? '#000000'
    ctx.textBaseline = 'top'

    const lines = this.wrapText(text, _width)

    // If this is a selectable text node, paint selection highlights
    if (selectable && this.selection) {
      const nodeInfo = this.textNodes[this.textNodeIndex]
      if (nodeInfo) {
        this.paintSelectionHighlight(nodeInfo, lines, lineHeight)
      }
    }

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i]!, x, y + i * lineHeight)
    }

    if (selectable) {
      this.textNodeIndex++
    }

    if (opacity !== undefined) ctx.globalAlpha = 1
  }

  /** Paint selection highlight rectangles for a text node. */
  private paintSelectionHighlight(
    node: TextNodeInfo,
    _lines: string[],
    lineHeight: number,
  ): void {
    const sel = this.selection
    if (!sel) return

    // Normalize selection direction
    let startNode = sel.anchorNode
    let startOffset = sel.anchorOffset
    let endNode = sel.focusNode
    let endOffset = sel.focusOffset

    if (startNode > endNode || (startNode === endNode && startOffset > endOffset)) {
      ;[startNode, endNode] = [endNode, startNode]
      ;[startOffset, endOffset] = [endOffset, startOffset]
    }

    // Check if this node is in the selection range
    if (node.index < startNode || node.index > endNode) return

    const { ctx } = this
    ctx.fillStyle = this.selectionColor

    let globalCharOffset = 0
    for (const line of node.lines) {
      const lineStart = globalCharOffset
      const lineEnd = globalCharOffset + line.text.length

      // Determine the selected portion of this line
      let selStart: number
      let selEnd: number

      if (node.index === startNode && node.index === endNode) {
        selStart = Math.max(startOffset, lineStart) - lineStart
        selEnd = Math.min(endOffset, lineEnd) - lineStart
      } else if (node.index === startNode) {
        selStart = Math.max(startOffset, lineStart) - lineStart
        selEnd = line.text.length
      } else if (node.index === endNode) {
        selStart = 0
        selEnd = Math.min(endOffset, lineEnd) - lineStart
      } else {
        selStart = 0
        selEnd = line.text.length
      }

      if (selStart < selEnd && selStart < line.charOffsets.length) {
        const rectX = line.x + (line.charOffsets[selStart] ?? 0)
        const endCharOffset = selEnd < line.charOffsets.length
          ? line.charOffsets[selEnd]!
          : (line.charOffsets[line.charOffsets.length - 1] ?? 0) + (line.charWidths[line.charWidths.length - 1] ?? 0)
        const rectWidth = endCharOffset - (line.charOffsets[selStart] ?? 0)

        ctx.fillRect(rectX, line.y, rectWidth, lineHeight)
      }

      globalCharOffset = lineEnd
    }
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const { ctx } = this
    const lines: string[] = []
    const paragraphs = text.split('\n')

    for (const para of paragraphs) {
      const words = para.split(' ')
      let current = ''

      for (const word of words) {
        const test = current ? `${current} ${word}` : word
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current)
          current = word
        } else {
          current = test
        }
      }
      lines.push(current)
    }

    return lines
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  /** Get the currently selected text string, or empty if nothing selected. */
  getSelectedText(): string {
    if (!this.selection || this.textNodes.length === 0) return ''
    return getSelectedText(this.selection, this.textNodes)
  }

  destroy(): void {
    // Nothing to clean up for canvas
  }
}

/**
 * Enable text selection on a canvas rendered by a CanvasRenderer.
 *
 * Attaches pointer and keyboard event listeners for click-drag selection
 * and Ctrl/Cmd+C copy. Returns a cleanup function.
 */
export function enableSelection(
  canvas: HTMLCanvasElement,
  renderer: CanvasRenderer,
  /** Called after selection changes so you can re-render. */
  onSelectionChange?: () => void,
): () => void {
  let isSelecting = false

  function getCanvasPos(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: PointerEvent) {
    const pos = getCanvasPos(e)
    const hit = hitTestText(renderer.textNodes, pos.x, pos.y)
    if (!hit) {
      // Clear selection if clicking outside text
      if (renderer.selection) {
        renderer.selection = null
        onSelectionChange?.()
      }
      return
    }

    isSelecting = true
    renderer.selection = {
      anchorNode: hit.nodeIndex,
      anchorOffset: hit.charOffset,
      focusNode: hit.nodeIndex,
      focusOffset: hit.charOffset,
    }
    canvas.setPointerCapture(e.pointerId)
    onSelectionChange?.()
  }

  function onPointerMove(e: PointerEvent) {
    if (!isSelecting || !renderer.selection) return

    const pos = getCanvasPos(e)
    const hit = hitTestText(renderer.textNodes, pos.x, pos.y)
    if (hit) {
      renderer.selection.focusNode = hit.nodeIndex
      renderer.selection.focusOffset = hit.charOffset
      onSelectionChange?.()
    }
  }

  function onPointerUp(_e: PointerEvent) {
    isSelecting = false
  }

  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
      const selectedText = renderer.getSelectedText()
      if (selectedText) {
        navigator.clipboard.writeText(selectedText)
        e.preventDefault()
      }
    }
  }

  // Use cursor to indicate selectable area
  function onMouseMove(e: MouseEvent) {
    if (isSelecting) return
    const pos = getCanvasPos(e)
    const hit = hitTestText(renderer.textNodes, pos.x, pos.y)
    canvas.style.cursor = hit ? 'text' : 'default'
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('mousemove', onMouseMove)
  document.addEventListener('keydown', onKeyDown)

  // Make canvas focusable for keyboard events
  if (!canvas.hasAttribute('tabindex')) {
    canvas.setAttribute('tabindex', '0')
  }

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('keydown', onKeyDown)
  }
}

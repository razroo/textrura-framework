import type { ComputedLayout } from 'textura'
import type {
  Renderer,
  UIElement,
  BoxElement,
  TextElement,
  ImageElement,
  SelectionRange,
  TextNodeInfo,
  AccessibilityNode,
} from '@geometra/core'
import {
  collectTextNodes,
  getSelectedText,
  hitTestText,
  getCursorAtPoint,
  focusedElement,
  toAccessibilityTree,
} from '@geometra/core'

export interface CanvasRendererOptions {
  /** Canvas element to render into. */
  canvas: HTMLCanvasElement
  /** Device pixel ratio for crisp rendering. Default: window.devicePixelRatio. */
  dpr?: number
  /** Background color for the canvas. Default: '#ffffff'. */
  background?: string
  /** Highlight color for text selection. Default: 'rgba(59, 130, 246, 0.4)'. */
  selectionColor?: string
  /** Text color for selected text. Default: auto-computed from selectionColor for contrast. */
  selectedTextColor?: string
  /** Called when an async image finishes loading. Use to trigger re-render. */
  onImageLoaded?: () => void
  /** Stroke every layout rect (flex debugging). Default false. */
  debugLayoutBounds?: boolean
  /** Draw a ring around the keyboard-focused box. Default true. */
  showFocusRing?: boolean
  /** Focus ring stroke color. Default: rgba(59, 130, 246, 0.95). */
  focusRingColor?: string
  /** Outset from the focused box in CSS pixels. Default 2. */
  focusRingPadding?: number
}

export interface AccessibilityMirrorOptions {
  /** Label for the hidden accessibility region. */
  rootLabel?: string
}

interface CachedTextLineMetrics {
  text: string
  charOffsets: number[]
  charWidths: number[]
}

/** Parse a CSS color string into [r, g, b] (0-255). Supports #hex and rgba(). */
function parseColorRGB(color: string): [number, number, number] {
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const full = hex.length === 3
      ? hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!
      : hex
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ]
  }
  const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (match) return [parseInt(match[1]!), parseInt(match[2]!), parseInt(match[3]!)]
  return [59, 130, 246]
}

/** Compute relative luminance (0-1) from sRGB. */
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map(
    c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  )
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!
}

export class CanvasRenderer implements Renderer {
  private ctx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private dpr: number
  private background: string
  private selectionColor: string
  private selectedTextColor: string
  private onImageLoaded?: () => void
  private debugLayoutBounds: boolean
  private showFocusRing: boolean
  private focusRingColor: string
  private focusRingPadding: number
  /** Cache text wrapping + per-char metrics to avoid recomputing every frame. */
  private textLineCache = new Map<string, CachedTextLineMetrics[]>()
  /** Cache child paint order by z-index per box element. */
  private paintOrderCache = new WeakMap<BoxElement, { signature: string; asc: number[] }>()

  /** Cached loaded images. */
  private imageCache = new Map<string, HTMLImageElement>()
  private pendingImages = new Set<string>()

  /** Text nodes collected during the last render (for selection hit-testing). */
  textNodes: TextNodeInfo[] = []
  /** Text nodes sorted by vertical position for faster hit prefilter. */
  textNodesByY: TextNodeInfo[] = []
  /** Current text selection range, or null if nothing is selected. */
  selection: SelectionRange | null = null
  /** The last rendered tree + layout (for cursor queries). */
  lastTree: UIElement | null = null
  lastLayout: ComputedLayout | null = null

  private textNodeIndex = 0

  constructor(options: CanvasRendererOptions) {
    this.canvas = options.canvas
    this.dpr = options.dpr ?? window.devicePixelRatio
    this.background = options.background ?? '#ffffff'
    this.selectionColor = options.selectionColor ?? 'rgba(59, 130, 246, 0.4)'
    this.onImageLoaded = options.onImageLoaded
    this.debugLayoutBounds = options.debugLayoutBounds ?? false
    this.showFocusRing = options.showFocusRing ?? true
    this.focusRingColor = options.focusRingColor ?? 'rgba(59, 130, 246, 0.95)'
    this.focusRingPadding = options.focusRingPadding ?? 2

    if (options.selectedTextColor) {
      this.selectedTextColor = options.selectedTextColor
    } else {
      const [r, g, b] = parseColorRGB(this.selectionColor)
      this.selectedTextColor = luminance(r, g, b) > 0.4 ? '#000000' : '#ffffff'
    }

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2d context')
    this.ctx = ctx
  }

  render(layout: ComputedLayout, tree: UIElement): void {
    const { ctx, canvas, dpr } = this

    canvas.width = layout.width * dpr
    canvas.height = layout.height * dpr
    canvas.style.width = `${layout.width}px`
    canvas.style.height = `${layout.height}px`
    ctx.scale(dpr, dpr)

    ctx.fillStyle = this.background
    ctx.fillRect(0, 0, layout.width, layout.height)

    this.textNodes = []
    collectTextNodes(tree, layout, 0, 0, this.textNodes)
    this.textNodesByY = [...this.textNodes].sort((a, b) => a.y - b.y)
    for (const node of this.textNodes) {
      this.computeTextNodeLines(node)
    }

    this.textNodeIndex = 0
    this.lastTree = tree
    this.lastLayout = layout
    this.paintNode(tree, layout, 0, 0)

    if (this.debugLayoutBounds) {
      this.paintLayoutDebug(tree, layout, 0, 0)
    }
    if (this.showFocusRing) {
      const f = focusedElement.peek()
      if (f) {
        this.paintFocusRingForTarget(tree, layout, 0, 0, f.element)
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  private computeTextNodeLines(node: TextNodeInfo): void {
    const { lineHeight, font, text } = node.element.props
    const width = Math.max(1, Math.round(node.width * 1000) / 1000)
    const cacheKey = `${font}|${lineHeight}|${width}|${text}`
    let cached = this.textLineCache.get(cacheKey)

    if (!cached) {
      const { ctx } = this
      ctx.font = font
      const wrappedLines = this.wrapText(text, width)
      cached = wrappedLines.map((lineText) => {
        const charOffsets: number[] = []
        const charWidths: number[] = []
        let xOffset = 0
        for (let c = 0; c < lineText.length; c++) {
          charOffsets.push(xOffset)
          const w = ctx.measureText(lineText[c]!).width
          charWidths.push(w)
          xOffset += w
        }
        return { text: lineText, charOffsets, charWidths }
      })
      this.textLineCache.set(cacheKey, cached)
      if (this.textLineCache.size > 500) {
        this.textLineCache.clear()
      }
    }

    node.lines = cached.map((line, i) => ({
      text: line.text,
      x: node.x,
      y: node.y + i * lineHeight,
      charOffsets: line.charOffsets,
      charWidths: line.charWidths,
    }))
  }

  private zIndexOf(element: UIElement): number {
    return (element.props as Record<string, unknown>).zIndex as number | undefined ?? 0
  }

  private getChildrenByZAsc(box: BoxElement): number[] {
    const signature = box.children.map((c, i) => `${i}:${this.zIndexOf(c)}`).join('|')
    const cached = this.paintOrderCache.get(box)
    if (cached && cached.signature === signature) {
      return cached.asc
    }
    const asc = box.children.map((_, i) => i).sort((a, b) => this.zIndexOf(box.children[a]!) - this.zIndexOf(box.children[b]!))
    this.paintOrderCache.set(box, { signature, asc })
    return asc
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

      const { overflow, scrollX, scrollY } = element.props
      const shouldClip = overflow === 'hidden' || overflow === 'scroll'
      const childOffsetX = x - (scrollX ?? 0)
      const childOffsetY = y - (scrollY ?? 0)

      if (shouldClip) {
        this.ctx.save()
        this.ctx.beginPath()
        this.ctx.rect(x, y, width, height)
        this.ctx.clip()
      }

      for (const i of this.getChildrenByZAsc(element)) {
        const childLayout = layout.children[i]
        if (childLayout) {
          this.paintNode(element.children[i]!, childLayout, childOffsetX, childOffsetY)
        }
      }

      if (shouldClip) {
        this.ctx.restore()
      }
    } else if (element.kind === 'image') {
      this.paintImage(element, x, y, width, height)
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
    const { backgroundColor, borderColor, borderRadius, borderWidth, opacity, boxShadow, gradient } = element.props

    if (opacity !== undefined) ctx.globalAlpha = opacity

    // Box shadow
    if (boxShadow) {
      ctx.save()
      ctx.shadowOffsetX = boxShadow.offsetX
      ctx.shadowOffsetY = boxShadow.offsetY
      ctx.shadowBlur = boxShadow.blur
      ctx.shadowColor = boxShadow.color
      ctx.fillStyle = backgroundColor ?? '#000000'
      if (borderRadius) {
        this.roundRect(x, y, width, height, borderRadius)
        ctx.fill()
      } else {
        ctx.fillRect(x, y, width, height)
      }
      ctx.restore()
      // If no gradient, the shadow fill already drew the background
      if (!gradient) {
        if (opacity !== undefined) ctx.globalAlpha = 1
        // Still need border
        if (borderColor) {
          ctx.strokeStyle = borderColor
          ctx.lineWidth = borderWidth ?? 1
          if (borderRadius) {
            this.roundRect(x, y, width, height, borderRadius)
            ctx.stroke()
          } else {
            ctx.strokeRect(x, y, width, height)
          }
        }
        if (opacity !== undefined) ctx.globalAlpha = 1
        return
      }
    }

    // Gradient or solid background
    if (gradient && gradient.type === 'linear') {
      const angle = ((gradient.angle ?? 180) * Math.PI) / 180
      const cx = x + width / 2
      const cy = y + height / 2
      const len = Math.max(width, height) / 2
      const x0 = cx - Math.sin(angle) * len
      const y0 = cy - Math.cos(angle) * len
      const x1 = cx + Math.sin(angle) * len
      const y1 = cy + Math.cos(angle) * len
      const grad = ctx.createLinearGradient(x0, y0, x1, y1)
      for (const stop of gradient.stops) {
        grad.addColorStop(stop.offset, stop.color)
      }
      ctx.fillStyle = grad
      if (borderRadius) {
        this.roundRect(x, y, width, height, borderRadius)
        ctx.fill()
      } else {
        ctx.fillRect(x, y, width, height)
      }
    } else if (backgroundColor && !boxShadow) {
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
      ctx.lineWidth = borderWidth ?? 1
      if (borderRadius) {
        this.roundRect(x, y, width, height, borderRadius)
        ctx.stroke()
      } else {
        ctx.strokeRect(x, y, width, height)
      }
    }

    if (opacity !== undefined) ctx.globalAlpha = 1
  }

  private paintImage(
    element: ImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const { ctx } = this
    const { src, objectFit, opacity, borderRadius } = element.props

    if (opacity !== undefined) ctx.globalAlpha = opacity

    const cached = this.imageCache.get(src)
    if (cached) {
      if (borderRadius) {
        ctx.save()
        this.roundRect(x, y, width, height, borderRadius)
        ctx.clip()
      }

      if (objectFit === 'cover' || objectFit === 'contain') {
        const imgRatio = cached.naturalWidth / cached.naturalHeight
        const boxRatio = width / height
        let sw: number, sh: number, sx: number, sy: number
        if ((objectFit === 'cover' && imgRatio > boxRatio) || (objectFit === 'contain' && imgRatio < boxRatio)) {
          sh = cached.naturalHeight
          sw = sh * boxRatio
          sx = (cached.naturalWidth - sw) / 2
          sy = 0
        } else {
          sw = cached.naturalWidth
          sh = sw / boxRatio
          sx = 0
          sy = (cached.naturalHeight - sh) / 2
        }
        ctx.drawImage(cached, sx, sy, sw, sh, x, y, width, height)
      } else {
        ctx.drawImage(cached, x, y, width, height)
      }

      if (borderRadius) ctx.restore()
    } else if (!this.pendingImages.has(src)) {
      // Start loading
      this.pendingImages.add(src)
      const img = new Image()
      img.onload = () => {
        this.imageCache.set(src, img)
        this.pendingImages.delete(src)
        this.onImageLoaded?.()
      }
      img.onerror = () => {
        this.pendingImages.delete(src)
      }
      img.src = src

      // Placeholder
      ctx.fillStyle = '#27272a'
      ctx.fillRect(x, y, width, height)
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
    ctx.textBaseline = 'top'

    const lines = this.wrapText(text, _width)
    const textColor = color ?? '#000000'

    const isSelectable = selectable !== false
    const nodeInfo = isSelectable && this.selection ? this.textNodes[this.textNodeIndex] : null
    const selRanges = nodeInfo ? this.getLineSelectionRanges(nodeInfo) : null

    if (selRanges) {
      this.paintSelectionHighlight(nodeInfo!, lines, lineHeight)
    }

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i]!
      const lineY = y + i * lineHeight
      const lineSelRange = selRanges?.[i]

      if (lineSelRange && lineSelRange.start < lineSelRange.end) {
        const before = lineText.slice(0, lineSelRange.start)
        const selected = lineText.slice(lineSelRange.start, lineSelRange.end)
        const after = lineText.slice(lineSelRange.end)

        let cx = x
        if (before) {
          ctx.fillStyle = textColor
          ctx.fillText(before, cx, lineY)
          cx += ctx.measureText(before).width
        }
        if (selected) {
          ctx.fillStyle = this.selectedTextColor
          ctx.fillText(selected, cx, lineY)
          cx += ctx.measureText(selected).width
        }
        if (after) {
          ctx.fillStyle = textColor
          ctx.fillText(after, cx, lineY)
        }
      } else {
        ctx.fillStyle = textColor
        ctx.fillText(lineText, x, lineY)
      }
    }

    if (isSelectable) {
      this.textNodeIndex++
    }

    if (opacity !== undefined) ctx.globalAlpha = 1
  }

  private getLineSelectionRanges(node: TextNodeInfo): Array<{ start: number; end: number }> | null {
    const sel = this.selection
    if (!sel) return null

    let startNode = sel.anchorNode, startOffset = sel.anchorOffset
    let endNode = sel.focusNode, endOffset = sel.focusOffset
    if (startNode > endNode || (startNode === endNode && startOffset > endOffset)) {
      ;[startNode, endNode] = [endNode, startNode]
      ;[startOffset, endOffset] = [endOffset, startOffset]
    }
    if (node.index < startNode || node.index > endNode) return null

    const ranges: Array<{ start: number; end: number }> = []
    let globalCharOffset = 0
    for (const line of node.lines) {
      const lineStart = globalCharOffset, lineEnd = globalCharOffset + line.text.length
      let selStart: number, selEnd: number
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
      ranges.push({ start: Math.max(0, selStart), end: Math.min(line.text.length, selEnd) })
      globalCharOffset = lineEnd
    }
    return ranges
  }

  private paintSelectionHighlight(node: TextNodeInfo, _lines: string[], lineHeight: number): void {
    const sel = this.selection
    if (!sel) return
    let startNode = sel.anchorNode, startOffset = sel.anchorOffset
    let endNode = sel.focusNode, endOffset = sel.focusOffset
    if (startNode > endNode || (startNode === endNode && startOffset > endOffset)) {
      ;[startNode, endNode] = [endNode, startNode]
      ;[startOffset, endOffset] = [endOffset, startOffset]
    }
    if (node.index < startNode || node.index > endNode) return

    const { ctx } = this
    ctx.fillStyle = this.selectionColor
    let globalCharOffset = 0
    for (const line of node.lines) {
      const lineStart = globalCharOffset, lineEnd = globalCharOffset + line.text.length
      let selStart: number, selEnd: number
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
        ctx.fillRect(rectX, line.y, endCharOffset - (line.charOffsets[selStart] ?? 0), lineHeight)
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
    r = Math.min(r, w / 2, h / 2)
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

  private paintLayoutDebug(
    element: UIElement,
    layout: ComputedLayout,
    offsetX: number,
    offsetY: number,
  ): void {
    const x = offsetX + layout.x
    const y = offsetY + layout.y
    const { width, height } = layout
    const { ctx } = this
    ctx.save()
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.45)'
    ctx.lineWidth = 1
    const dw = Math.max(0, width - 1)
    const dh = Math.max(0, height - 1)
    ctx.strokeRect(x + 0.5, y + 0.5, dw, dh)
    ctx.restore()

    if (element.kind !== 'box') return

    const { overflow, scrollX, scrollY } = element.props
    const shouldClip = overflow === 'hidden' || overflow === 'scroll'
    const childOffsetX = x - (scrollX ?? 0)
    const childOffsetY = y - (scrollY ?? 0)

    if (shouldClip) {
      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.rect(x, y, width, height)
      this.ctx.clip()
    }

    for (const i of this.getChildrenByZAsc(element)) {
      const childLayout = layout.children[i]
      if (childLayout) {
        this.paintLayoutDebug(element.children[i]!, childLayout, childOffsetX, childOffsetY)
      }
    }

    if (shouldClip) {
      this.ctx.restore()
    }
  }

  private paintFocusRingForTarget(
    element: UIElement,
    layout: ComputedLayout,
    offsetX: number,
    offsetY: number,
    target: BoxElement,
  ): boolean {
    const x = offsetX + layout.x
    const y = offsetY + layout.y
    const { width, height } = layout

    if (element.kind === 'box' && element === target) {
      const pad = this.focusRingPadding
      const br = element.props.borderRadius ?? 0
      this.strokeFocusRingOutline(
        x - pad,
        y - pad,
        width + pad * 2,
        height + pad * 2,
        br > 0 ? br + pad * 0.5 : 0,
      )
      return true
    }

    if (element.kind !== 'box') return false

    const { overflow, scrollX, scrollY } = element.props
    const shouldClip = overflow === 'hidden' || overflow === 'scroll'
    const childOffsetX = x - (scrollX ?? 0)
    const childOffsetY = y - (scrollY ?? 0)

    if (shouldClip) {
      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.rect(x, y, width, height)
      this.ctx.clip()
    }

    for (const i of this.getChildrenByZAsc(element)) {
      const childLayout = layout.children[i]
      if (childLayout) {
        if (this.paintFocusRingForTarget(element.children[i]!, childLayout, childOffsetX, childOffsetY, target)) {
          if (shouldClip) this.ctx.restore()
          return true
        }
      }
    }

    if (shouldClip) {
      this.ctx.restore()
    }
    return false
  }

  private strokeFocusRingOutline(x: number, y: number, w: number, h: number, borderRadius: number): void {
    const { ctx } = this
    ctx.save()
    ctx.strokeStyle = this.focusRingColor
    ctx.lineWidth = 2
    if (borderRadius > 0) {
      this.roundRect(x, y, w, h, borderRadius)
      ctx.stroke()
    } else {
      ctx.strokeRect(x, y, w, h)
    }
    ctx.restore()
  }

  getSelectedText(): string {
    if (!this.selection || this.textNodes.length === 0) return ''
    return getSelectedText(this.selection, this.textNodes)
  }

  /** Build an accessibility tree for the currently rendered frame. */
  getAccessibilityTree(): AccessibilityNode | null {
    if (!this.lastTree || !this.lastLayout) return null
    return toAccessibilityTree(this.lastTree, this.lastLayout)
  }

  destroy(): void {
    // Nothing to clean up for canvas
  }
}

function hitTestTextFast(
  textNodesByY: TextNodeInfo[],
  px: number,
  py: number,
): { nodeIndex: number; charOffset: number } | null {
  if (textNodesByY.length === 0) return null

  let lo = 0
  let hi = textNodesByY.length - 1
  let start = textNodesByY.length
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const node = textNodesByY[mid]!
    if (node.y + node.height >= py) {
      start = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  if (start >= textNodesByY.length) return null

  const candidates: TextNodeInfo[] = []
  for (let i = start; i < textNodesByY.length; i++) {
    const node = textNodesByY[i]!
    if (node.y > py) break
    if (py >= node.y && py <= node.y + node.height) {
      candidates.push(node)
    }
  }
  if (candidates.length === 0) return null
  return hitTestText(candidates, px, py)
}

/**
 * Enable text selection and cursor styles on a canvas rendered by a CanvasRenderer.
 * Returns a cleanup function.
 */
export function enableSelection(
  canvas: HTMLCanvasElement,
  renderer: CanvasRenderer,
  onSelectionChange?: () => void,
): () => void {
  let isSelecting = false
  let rafId: number | null = null
  let hoverRafId: number | null = null
  let pendingHoverPos: { x: number; y: number } | null = null

  function scheduleSelectionChange(): void {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      if (onSelectionChange) {
        onSelectionChange()
        return
      }
      // Fast path: selection-only repaint from cached frame.
      if (renderer.lastLayout && renderer.lastTree) {
        renderer.render(renderer.lastLayout, renderer.lastTree)
      }
    })
  }

  function getCanvasPos(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: PointerEvent) {
    const pos = getCanvasPos(e)
    const hit = hitTestTextFast(renderer.textNodesByY, pos.x, pos.y)
    if (!hit) {
      if (renderer.selection) {
        renderer.selection = null
        scheduleSelectionChange()
      }
      return
    }
    isSelecting = true
    renderer.selection = {
      anchorNode: hit.nodeIndex, anchorOffset: hit.charOffset,
      focusNode: hit.nodeIndex, focusOffset: hit.charOffset,
    }
    canvas.setPointerCapture(e.pointerId)
    scheduleSelectionChange()
  }

  function onPointerMove(e: PointerEvent) {
    if (!isSelecting || !renderer.selection) return
    const pos = getCanvasPos(e)
    const hit = hitTestTextFast(renderer.textNodesByY, pos.x, pos.y)
    if (hit) {
      if (
        renderer.selection.focusNode !== hit.nodeIndex ||
        renderer.selection.focusOffset !== hit.charOffset
      ) {
        renderer.selection.focusNode = hit.nodeIndex
        renderer.selection.focusOffset = hit.charOffset
        scheduleSelectionChange()
      }
    }
  }

  function onPointerUp() {
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

  function flushHoverCursor(): void {
    hoverRafId = null
    if (isSelecting || !pendingHoverPos) return
    const pos = pendingHoverPos
    pendingHoverPos = null

    // Check for element cursor prop first
    if (renderer.lastTree && renderer.lastLayout) {
      const elementCursor = getCursorAtPoint(renderer.lastTree, renderer.lastLayout, pos.x, pos.y)
      if (elementCursor) {
        if (canvas.style.cursor !== elementCursor) {
          canvas.style.cursor = elementCursor
        }
        return
      }
    }

    // Fall back to text selection cursor
    const hit = hitTestTextFast(renderer.textNodesByY, pos.x, pos.y)
    const nextCursor = hit ? 'text' : 'default'
    if (canvas.style.cursor !== nextCursor) {
      canvas.style.cursor = nextCursor
    }
  }

  function onMouseMove(e: MouseEvent) {
    pendingHoverPos = getCanvasPos(e)
    if (hoverRafId !== null) return
    hoverRafId = requestAnimationFrame(flushHoverCursor)
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('mousemove', onMouseMove)
  document.addEventListener('keydown', onKeyDown)

  if (!canvas.hasAttribute('tabindex')) {
    canvas.setAttribute('tabindex', '0')
  }

  return () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (hoverRafId !== null) {
      cancelAnimationFrame(hoverRafId)
      hoverRafId = null
    }
    pendingHoverPos = null
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('keydown', onKeyDown)
  }
}

function createAccessibilityElement(node: AccessibilityNode, doc: Document): HTMLElement {
  const el = doc.createElement('div')
  el.setAttribute('role', node.role)
  if (node.name) el.setAttribute('aria-label', node.name)
  el.style.position = 'absolute'
  el.style.left = `${node.bounds.x}px`
  el.style.top = `${node.bounds.y}px`
  el.style.width = `${Math.max(1, node.bounds.width)}px`
  el.style.height = `${Math.max(1, node.bounds.height)}px`
  el.style.pointerEvents = 'none'
  el.style.background = 'transparent'
  if (node.focusable) el.setAttribute('tabindex', '0')
  for (const child of node.children) {
    el.appendChild(createAccessibilityElement(child, doc))
  }
  return el
}

/**
 * Mirror canvas semantics into a hidden DOM subtree for assistive tech.
 * The mirror auto-syncs after every canvas render.
 */
export function enableAccessibilityMirror(
  host: HTMLElement,
  renderer: CanvasRenderer,
  options: AccessibilityMirrorOptions = {},
): () => void {
  const doc = host.ownerDocument
  const root = doc.createElement('div')
  root.setAttribute('aria-label', options.rootLabel ?? 'Geometra accessibility mirror')
  root.style.position = 'absolute'
  root.style.left = '0'
  root.style.top = '0'
  root.style.width = '1px'
  root.style.height = '1px'
  root.style.overflow = 'hidden'
  root.style.clipPath = 'inset(50%)'
  root.style.whiteSpace = 'nowrap'
  host.appendChild(root)

  const originalRender = renderer.render.bind(renderer)
  const patchedRender: typeof renderer.render = (layout, tree) => {
    originalRender(layout, tree)
    const a11y = renderer.getAccessibilityTree()
    root.replaceChildren()
    if (a11y) {
      root.appendChild(createAccessibilityElement(a11y, doc))
    }
  }

  renderer.render = patchedRender

  return () => {
    renderer.render = originalRender
    root.remove()
  }
}

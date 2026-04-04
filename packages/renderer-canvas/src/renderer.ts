import type { ComputedLayout } from 'textura'
import type {
  App,
  FrameTimings,
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
  hasInteractiveHitAtPoint,
  focusedElement,
  toAccessibilityTree,
  hitPathAtPoint,
  collectFocusOrder,
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
  /** Max number of decoded images to keep in memory. Default: 256. */
  imageCacheMaxEntries?: number
  /** Placeholder color while an image is loading. Default: '#27272a'. */
  imagePlaceholderColor?: string
  /** Fallback fill color when image loading fails. Default: '#3f1d1d'. */
  imageErrorColor?: string
  /** TTL in ms for decoded images. 0 disables expiry. Default: 0. */
  imageCacheTTLms?: number
  /** Max retries after image load failure. Default: 2. */
  imageRetryCount?: number
  /** Base delay for exponential backoff retries in ms. Default: 500. */
  imageRetryBaseDelayMs?: number
  /** Custom placeholder painter for loading/error states. */
  imagePlaceholderRenderer?: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    state: 'loading' | 'error',
    src: string,
  ) => void
  /** Factory for creating image objects (useful for tests/custom loaders). */
  createImage?: () => HTMLImageElement
  /** Stroke every layout rect (flex debugging). Default false. */
  debugLayoutBounds?: boolean
  /** Draw a ring around the keyboard-focused box. Default true. */
  showFocusRing?: boolean
  /** Focus ring stroke color. Default: rgba(59, 130, 246, 0.95). */
  focusRingColor?: string
  /** Outset from the focused box in CSS pixels. Default 2. */
  focusRingPadding?: number
  /** Skip debug/focus overlays during active drag interactions. Default true. */
  optimizeOverlaysDuringInteraction?: boolean
  /**
   * Draw a lightweight inspector HUD (node count, tree depth, root size, focus summary).
   * Negligible cost when disabled. Default false.
   */
  layoutInspector?: boolean
}

export interface AccessibilityMirrorOptions {
  /** Label for the hidden accessibility region. */
  rootLabel?: string
}

export interface CanvasInputForwardingOptions {
  /** Optional target for keyboard/composition events. Defaults to document. */
  keyboardTarget?: Document | HTMLElement
}

interface CachedTextLineMetrics {
  text: string
  charOffsets: number[]
  charWidths: number[]
}

interface CachedImageEntry {
  image: HTMLImageElement
  lastUsedAt: number
  cachedAt: number
}

interface FailedImageEntry {
  attempts: number
  nextRetryAt: number
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
  private imageCacheMaxEntries: number
  private imagePlaceholderColor: string
  private imageErrorColor: string
  private imageCacheTTLms: number
  private imageRetryCount: number
  private imageRetryBaseDelayMs: number
  private imagePlaceholderRenderer?: CanvasRendererOptions['imagePlaceholderRenderer']
  private createImage: () => HTMLImageElement
  private debugLayoutBounds: boolean
  private showFocusRing: boolean
  private focusRingColor: string
  private focusRingPadding: number
  private optimizeOverlaysDuringInteraction: boolean
  private layoutInspector: boolean
  private interactionActive = false
  /** Cache text wrapping + per-char metrics to avoid recomputing every frame. */
  private textLineCache = new Map<string, CachedTextLineMetrics[]>()
  /** Cache child paint order by z-index per box element. */
  private paintOrderCache = new WeakMap<BoxElement, { signature: string; asc: number[] }>()

  /** Cached loaded images (LRU by lastUsedAt). */
  private imageCache = new Map<string, CachedImageEntry>()
  private pendingImages = new Set<string>()
  private failedImages = new Map<string, FailedImageEntry>()
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /** Text nodes collected during the last render (for selection hit-testing). */
  textNodes: TextNodeInfo[] = []
  /** Text nodes sorted by vertical position for faster hit prefilter. */
  textNodesByY: TextNodeInfo[] = []
  /** Current text selection range, or null if nothing is selected. */
  selection: SelectionRange | null = null
  /** The last rendered tree + layout (for cursor queries). */
  lastTree: UIElement | null = null
  lastLayout: ComputedLayout | null = null

  /**
   * When `layoutInspector` is enabled, optional pointer in layout coordinates
   * to show `hitPathAtPoint` in the HUD. Set each frame from pointer move (or clear).
   */
  inspectorProbe: { x: number; y: number } | null = null

  /** Increments every `render()`; shown in the layout inspector HUD. */
  renderFrame = 0

  /** Wall time (ms) for the last completed `render()` call, including paint and overlays. */
  lastRenderWallMs = 0

  /** Last `computeLayout` wall time (ms) reported by `createApp` via `setFrameTimings`. */
  lastLayoutWallMs = 0

  private textNodeIndex = 0

  constructor(options: CanvasRendererOptions) {
    this.canvas = options.canvas
    this.dpr = options.dpr ?? window.devicePixelRatio
    this.background = options.background ?? '#ffffff'
    this.selectionColor = options.selectionColor ?? 'rgba(59, 130, 246, 0.4)'
    this.onImageLoaded = options.onImageLoaded
    this.imageCacheMaxEntries = Math.max(1, options.imageCacheMaxEntries ?? 256)
    this.imagePlaceholderColor = options.imagePlaceholderColor ?? '#27272a'
    this.imageErrorColor = options.imageErrorColor ?? '#3f1d1d'
    this.imageCacheTTLms = Math.max(0, options.imageCacheTTLms ?? 0)
    this.imageRetryCount = Math.max(0, options.imageRetryCount ?? 2)
    this.imageRetryBaseDelayMs = Math.max(1, options.imageRetryBaseDelayMs ?? 500)
    this.imagePlaceholderRenderer = options.imagePlaceholderRenderer
    this.createImage = options.createImage ?? (() => new Image())
    this.debugLayoutBounds = options.debugLayoutBounds ?? false
    this.showFocusRing = options.showFocusRing ?? true
    this.focusRingColor = options.focusRingColor ?? 'rgba(59, 130, 246, 0.95)'
    this.focusRingPadding = options.focusRingPadding ?? 2
    this.optimizeOverlaysDuringInteraction = options.optimizeOverlaysDuringInteraction ?? true
    this.layoutInspector = options.layoutInspector ?? false

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

  /**
   * Same clamping as `createApp` after Yoga: non-finite or negative `layoutMs` become `0` so the
   * inspector HUD and telemetry never observe NaN/negative layout times.
   */
  setFrameTimings(timings: FrameTimings): void {
    const raw = timings.layoutMs
    this.lastLayoutWallMs = Math.max(0, Number.isFinite(raw) ? raw : 0)
  }

  render(layout: ComputedLayout, tree: UIElement): void {
    const { ctx, canvas, dpr } = this
    const frameStart = typeof performance !== 'undefined' ? performance.now() : 0

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
    this.renderFrame++
    this.paintNode(tree, layout, 0, 0)

    const skipOverlays = this.optimizeOverlaysDuringInteraction && this.interactionActive

    if (this.debugLayoutBounds && !skipOverlays) {
      this.paintLayoutDebug(tree, layout, 0, 0)
    }
    if (this.showFocusRing && !skipOverlays) {
      const f = focusedElement.peek()
      if (f) {
        this.paintFocusRingForTarget(tree, layout, 0, 0, f.element)
      }
    }
    if (this.layoutInspector && !skipOverlays) {
      const msBeforeHud =
        typeof performance !== 'undefined' ? performance.now() - frameStart : 0
      this.paintLayoutInspectorHud(layout, tree, msBeforeHud)
    }

    if (typeof performance !== 'undefined') {
      this.lastRenderWallMs = performance.now() - frameStart
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
      x: node.direction === 'rtl'
        ? node.x + Math.max(
          0,
          node.width - (
            line.charOffsets.length > 0
              ? (line.charOffsets[line.charOffsets.length - 1] ?? 0) + (line.charWidths[line.charWidths.length - 1] ?? 0)
              : 0
          ),
        )
        : node.x,
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
    } else if (element.kind === 'scene3d') {
      // scene3d elements are rendered by a Three.js host; paint a placeholder on canvas.
      this.ctx.fillStyle = '#111827'
      this.roundRect(x, y, width, height, 0)
      this.ctx.fill()
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

    const now = Date.now()
    const cached = this.imageCache.get(src)
    if (cached) {
      if (this.imageCacheTTLms > 0 && now - cached.cachedAt > this.imageCacheTTLms) {
        this.imageCache.delete(src)
      } else {
        cached.lastUsedAt = now
      }
    }

    const fresh = this.imageCache.get(src)
    if (fresh) {
      const cached = fresh
      const img = cached.image
      if (borderRadius) {
        ctx.save()
        this.roundRect(x, y, width, height, borderRadius)
        ctx.clip()
      }

      if (objectFit === 'cover' || objectFit === 'contain') {
        const imgRatio = img.naturalWidth / img.naturalHeight
        const boxRatio = width / height
        let sw: number, sh: number, sx: number, sy: number
        if ((objectFit === 'cover' && imgRatio > boxRatio) || (objectFit === 'contain' && imgRatio < boxRatio)) {
          sh = img.naturalHeight
          sw = sh * boxRatio
          sx = (img.naturalWidth - sw) / 2
          sy = 0
        } else {
          sw = img.naturalWidth
          sh = sw / boxRatio
          sx = 0
          sy = (img.naturalHeight - sh) / 2
        }
        ctx.drawImage(img, sx, sy, sw, sh, x, y, width, height)
      } else {
        ctx.drawImage(img, x, y, width, height)
      }

      if (borderRadius) ctx.restore()
    } else if (this.pendingImages.has(src)) {
      this.paintImagePlaceholder(ctx, x, y, width, height, 'loading', src)
    } else if (this.failedImages.has(src)) {
      const failed = this.failedImages.get(src)!
      if (now >= failed.nextRetryAt && failed.attempts <= this.imageRetryCount) {
        this.startImageLoad(src)
        this.paintImagePlaceholder(ctx, x, y, width, height, 'loading', src)
      } else {
        this.paintImagePlaceholder(ctx, x, y, width, height, 'error', src)
      }
    } else if (!this.pendingImages.has(src)) {
      this.startImageLoad(src)
      this.paintImagePlaceholder(ctx, x, y, width, height, 'loading', src)
    } else {
      this.paintImagePlaceholder(ctx, x, y, width, height, 'loading', src)
    }

    if (opacity !== undefined) ctx.globalAlpha = 1
  }

  /** Warm image cache before first paint. */
  preloadImages(urls: string[]): void {
    for (const src of urls) {
      if (this.imageCache.has(src) || this.pendingImages.has(src)) continue
      this.startImageLoad(src)
    }
  }

  clearImageCache(): void {
    this.imageCache.clear()
    this.pendingImages.clear()
    this.failedImages.clear()
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer)
    }
    this.retryTimers.clear()
  }

  getImageCacheStats(): { cached: number; pending: number; failed: number; maxEntries: number } {
    return {
      cached: this.imageCache.size,
      pending: this.pendingImages.size,
      failed: this.failedImages.size,
      maxEntries: this.imageCacheMaxEntries,
    }
  }

  private paintImagePlaceholder(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    state: 'loading' | 'error',
    src: string,
  ): void {
    if (this.imagePlaceholderRenderer) {
      this.imagePlaceholderRenderer(ctx, x, y, width, height, state, src)
      return
    }
    ctx.fillStyle = state === 'loading' ? this.imagePlaceholderColor : this.imageErrorColor
    ctx.fillRect(x, y, width, height)
    ctx.fillStyle = state === 'loading' ? '#a1a1aa' : '#fca5a5'
    ctx.font = '11px sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(state === 'loading' ? 'Loading image...' : 'Image failed', x + 8, y + Math.max(10, height / 2))
  }

  private startImageLoad(src: string): void {
    if (this.pendingImages.has(src)) return
    this.pendingImages.add(src)
    const img = this.createImage()
    img.onload = () => {
      const now = Date.now()
      this.imageCache.set(src, { image: img, lastUsedAt: now, cachedAt: now })
      this.pendingImages.delete(src)
      this.failedImages.delete(src)
      const timer = this.retryTimers.get(src)
      if (timer) {
        clearTimeout(timer)
        this.retryTimers.delete(src)
      }
      this.enforceImageCacheLimit()
      this.onImageLoaded?.()
    }
    img.onerror = () => {
      this.pendingImages.delete(src)
      const prev = this.failedImages.get(src)
      const attempts = (prev?.attempts ?? 0) + 1
      const backoff = this.imageRetryBaseDelayMs * Math.pow(2, Math.max(0, attempts - 1))
      const nextRetryAt = Date.now() + backoff
      this.failedImages.set(src, { attempts, nextRetryAt })
      if (attempts <= this.imageRetryCount) {
        const timer = setTimeout(() => {
          this.retryTimers.delete(src)
          this.onImageLoaded?.()
        }, backoff)
        this.retryTimers.set(src, timer)
      }
      this.onImageLoaded?.()
    }
    img.src = src
  }

  private enforceImageCacheLimit(): void {
    if (this.imageCache.size <= this.imageCacheMaxEntries) return
    const entries = [...this.imageCache.entries()]
    entries.sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)
    const removeCount = this.imageCache.size - this.imageCacheMaxEntries
    for (let i = 0; i < removeCount; i++) {
      const victim = entries[i]
      if (victim) this.imageCache.delete(victim[0])
    }
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
    const nodeInfo = isSelectable ? this.textNodes[this.textNodeIndex] : null
    const selRanges = nodeInfo ? this.getLineSelectionRanges(nodeInfo) : null

    if (selRanges) {
      this.paintSelectionHighlight(nodeInfo!, lines, lineHeight)
    }

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i]!
      const lineY = nodeInfo?.lines[i]?.y ?? (y + i * lineHeight)
      const lineX = nodeInfo?.lines[i]?.x ?? x
      const lineSelRange = selRanges?.[i]

      if (lineSelRange && lineSelRange.start < lineSelRange.end) {
        const before = lineText.slice(0, lineSelRange.start)
        const selected = lineText.slice(lineSelRange.start, lineSelRange.end)
        const after = lineText.slice(lineSelRange.end)

        let cx = lineX
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
        ctx.fillText(lineText, lineX, lineY)
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

  private countInspectorNodes(element: UIElement): number {
    if (element.kind !== 'box') return 1
    let n = 1
    for (const c of element.children) n += this.countInspectorNodes(c)
    return n
  }

  private maxInspectorDepth(element: UIElement): number {
    if (element.kind !== 'box' || element.children.length === 0) return 1
    let m = 0
    for (const c of element.children) m = Math.max(m, this.maxInspectorDepth(c))
    return 1 + m
  }

  private paintLayoutInspectorHud(
    layout: ComputedLayout,
    tree: UIElement,
    renderMsBeforeHud: number,
  ): void {
    const { ctx } = this
    const nodes = this.countInspectorNodes(tree)
    const depth = this.maxInspectorDepth(tree)
    const ft = focusedElement.peek()
    const focusHint = ft
      ? (ft.element.semantic?.role ?? ft.element.semantic?.tag ?? 'box')
      : 'none'
    const order = collectFocusOrder(tree, layout)
    let focusOrdinal = '—'
    if (ft) {
      const idx = order.findIndex(t => t.element === ft.element)
      if (idx >= 0) focusOrdinal = `${idx + 1}/${order.length}`
    }
    const lines = [
      `frame ${this.renderFrame}`,
      `layout ${this.lastLayoutWallMs.toFixed(2)}ms`,
      `render ${renderMsBeforeHud.toFixed(2)}ms`,
      `nodes ${nodes}  depth ${depth}`,
      `root ${Math.round(layout.width)}×${Math.round(layout.height)}`,
      `focus ${focusHint}  (${focusOrdinal})`,
    ]
    const probe = this.inspectorProbe
    if (probe) {
      const path = hitPathAtPoint(tree, layout, probe.x, probe.y)
      lines.push(`hit [${path === null ? 'miss' : path.join(',')}] @ ${Math.round(probe.x)},${Math.round(probe.y)}`)
    }
    ctx.save()
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    const pad = 8
    const lineH = 14
    let maxW = 0
    for (const line of lines) {
      maxW = Math.max(maxW, ctx.measureText(line).width)
    }
    const boxW = maxW + pad * 2
    const boxH = pad * 2 + lines.length * lineH
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)'
    ctx.fillRect(pad, pad, boxW, boxH)
    ctx.fillStyle = '#e2e8f0'
    let y = pad * 2 + 10
    for (const line of lines) {
      ctx.fillText(line, pad * 2, y)
      y += lineH
    }
    ctx.restore()
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

  setInteractionActive(active: boolean): void {
    this.interactionActive = active
  }

  /** Build an accessibility tree for the currently rendered frame. */
  getAccessibilityTree(): AccessibilityNode | null {
    if (!this.lastTree || !this.lastLayout) return null
    return toAccessibilityTree(this.lastTree, this.lastLayout)
  }

  destroy(): void {
    this.clearImageCache()
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
    if (renderer.lastTree && renderer.lastLayout) {
      const overInteractive = hasInteractiveHitAtPoint(renderer.lastTree, renderer.lastLayout, pos.x, pos.y)
      if (overInteractive) {
        if (renderer.selection) {
          renderer.selection = null
          scheduleSelectionChange()
        }
        return
      }
    }
    const hit = hitTestTextFast(renderer.textNodesByY, pos.x, pos.y)
    if (!hit) {
      if (renderer.selection) {
        renderer.selection = null
        scheduleSelectionChange()
      }
      return
    }
    isSelecting = true
    renderer.setInteractionActive(true)
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
    renderer.setInteractionActive(false)
    scheduleSelectionChange()
  }

  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      if (focusedElement.peek()) return
      if (renderer.textNodes.length > 0) {
        const first = renderer.textNodes[0]!
        const last = renderer.textNodes[renderer.textNodes.length - 1]!
        renderer.selection = {
          anchorNode: first.index,
          anchorOffset: 0,
          focusNode: last.index,
          focusOffset: last.element.props.text.length,
        }
        scheduleSelectionChange()
        e.preventDefault()
        return
      }
    }

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
    renderer.setInteractionActive(false)
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

/**
 * Forward browser pointer/keyboard/composition events into a Geometra app.
 * Returns a cleanup function.
 */
export function enableInputForwarding(
  canvas: HTMLCanvasElement,
  getApp: () => App | null,
  options: CanvasInputForwardingOptions = {},
): () => void {
  const keyboardTarget = options.keyboardTarget ?? document

  function shouldPreventHandledKey(e: KeyboardEvent): boolean {
    return (
      ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') ||
      ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') ||
      (e.ctrlKey && e.key.toLowerCase() === 'y') ||
      e.key === 'Tab' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'Backspace' ||
      e.key === 'Delete' ||
      e.key === 'Enter' ||
      e.key === ' ' ||
      e.code === 'Space'
    )
  }

  function onPointerDown(e: PointerEvent): void {
    const app = getApp()
    if (!app) return
    const rect = canvas.getBoundingClientRect()
    app.dispatch('onClick', e.clientX - rect.left, e.clientY - rect.top)
  }

  function onKeyDown(e: KeyboardEvent): void {
    const app = getApp()
    if (!app) return
    const handled = app.dispatchKey('onKeyDown', {
      key: e.key,
      code: e.code,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
    })
    if (handled && shouldPreventHandledKey(e)) {
      e.preventDefault()
    }
  }

  function onCompositionStart(e: CompositionEvent): void {
    const app = getApp()
    if (!app) return
    app.dispatchComposition('onCompositionStart', { data: e.data ?? '' })
  }

  function onCompositionUpdate(e: CompositionEvent): void {
    const app = getApp()
    if (!app) return
    app.dispatchComposition('onCompositionUpdate', { data: e.data ?? '' })
  }

  function onCompositionEnd(e: CompositionEvent): void {
    const app = getApp()
    if (!app) return
    app.dispatchComposition('onCompositionEnd', { data: e.data ?? '' })
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  keyboardTarget.addEventListener('keydown', onKeyDown as EventListener)
  keyboardTarget.addEventListener('compositionstart', onCompositionStart as EventListener)
  keyboardTarget.addEventListener('compositionupdate', onCompositionUpdate as EventListener)
  keyboardTarget.addEventListener('compositionend', onCompositionEnd as EventListener)

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown)
    keyboardTarget.removeEventListener('keydown', onKeyDown as EventListener)
    keyboardTarget.removeEventListener('compositionstart', onCompositionStart as EventListener)
    keyboardTarget.removeEventListener('compositionupdate', onCompositionUpdate as EventListener)
    keyboardTarget.removeEventListener('compositionend', onCompositionEnd as EventListener)
  }
}

import type { ComputedLayout } from 'textura'
import { finiteNumberOrZero, layoutBoundsAreFinite, type Renderer, type UIElement } from '@geometra/core'

export interface WebGPURendererOptions {
  canvas: HTMLCanvasElement
  background?: string
  powerPreference?: GPUPowerPreference
  /** Optional callback to surface unsupported nodes that need fallback rendering. */
  onFallbackNeeded?: (count: number) => void
}

/**
 * WebGPU renderer for Geometra.
 *
 * Renders solid-color boxes via a vertex-colored triangle pipeline and text
 * via a canvas-rasterized texture atlas sampled through a separate textured-quad pipeline.
 */
/** Root/backing-store size: at least 1×1; non-finite or negative layout from Yoga/JSON never poisons canvas or NDC math. */
function safeCanvasExtent(layout: ComputedLayout): { w: number; h: number } {
  if (!layoutBoundsAreFinite(layout)) {
    return { w: 1, h: 1 }
  }
  return {
    w: Math.max(1, Math.round(layout.width)),
    h: Math.max(1, Math.round(layout.height)),
  }
}

// --- Text atlas: rasterizes text to offscreen canvas, uploads as GPU texture ---

interface TextEntry {
  /** Region in atlas */
  ax: number
  ay: number
  aw: number
  ah: number
  /** Destination in layout */
  dx: number
  dy: number
  dw: number
  dh: number
}

class TextAtlas {
  private canvas: OffscreenCanvas
  private ctx: OffscreenCanvasRenderingContext2D
  private entries: TextEntry[] = []
  private cursorX = 0
  private cursorY = 0
  private rowHeight = 0
  readonly width: number
  readonly height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.canvas = new OffscreenCanvas(width, height)
    const ctx = this.canvas.getContext('2d', { willReadFrequently: false })
    if (!ctx) throw new Error('Could not create offscreen 2d context for text atlas')
    this.ctx = ctx
  }

  clear(): void {
    this.entries = []
    this.cursorX = 0
    this.cursorY = 0
    this.rowHeight = 0
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  addText(
    text: string,
    font: string,
    color: string,
    lineHeight: number,
    dx: number,
    dy: number,
    maxWidth: number,
    _maxHeight: number,
    whiteSpace?: string,
  ): void {
    const { ctx } = this
    ctx.font = font
    ctx.textBaseline = 'top'

    const shouldWrap = whiteSpace === 'normal' || whiteSpace === 'pre-wrap'
    const lines = shouldWrap ? wrapText(ctx, text, maxWidth) : [text]

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i]!
      if (!lineText) continue
      const metrics = ctx.measureText(lineText)
      const lw = Math.ceil(metrics.width) + 2
      const lh = Math.ceil(lineHeight) + 2

      if (lw <= 0 || lh <= 0) continue

      // Advance atlas cursor (simple row packing)
      if (this.cursorX + lw > this.width) {
        this.cursorX = 0
        this.cursorY += this.rowHeight
        this.rowHeight = 0
      }
      if (this.cursorY + lh > this.height) continue // atlas full

      const ax = this.cursorX
      const ay = this.cursorY

      ctx.fillStyle = color
      ctx.fillText(lineText, ax, ay)

      this.entries.push({
        ax,
        ay,
        aw: lw,
        ah: lh,
        dx,
        dy: dy + i * lineHeight,
        dw: lw,
        dh: lh,
      })

      this.cursorX += lw
      if (lh > this.rowHeight) this.rowHeight = lh
    }
  }

  getEntries(): TextEntry[] {
    return this.entries
  }

  getImageBitmap(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas)
  }
}

function wrapText(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text]
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? current + ' ' + word : word
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

export class WebGPURenderer implements Renderer {
  private canvas: HTMLCanvasElement
  private background: string
  private powerPreference: GPUPowerPreference
  private onFallbackNeeded?: (count: number) => void
  private _initialized = false
  private adapter: GPUAdapter | null = null
  private device: GPUDevice | null = null
  private context: GPUCanvasContext | null = null
  private format: GPUTextureFormat | null = null
  private pipeline: GPURenderPipeline | null = null
  private textPipeline: GPURenderPipeline | null = null
  private textBindGroupLayout: GPUBindGroupLayout | null = null
  private sampler: GPUSampler | null = null
  private vertexBuffer: GPUBuffer | null = null
  private vertexCapacity = 0
  private textVertexBuffer: GPUBuffer | null = null
  private textVertexCapacity = 0
  private textAtlas: TextAtlas | null = null

  constructor(options: WebGPURendererOptions) {
    this.canvas = options.canvas
    this.background = options.background ?? '#000000'
    this.powerPreference = options.powerPreference ?? 'high-performance'
    this.onFallbackNeeded = options.onFallbackNeeded
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.gpu
  }

  async init(): Promise<void> {
    if (!WebGPURenderer.isSupported()) {
      throw new Error('WebGPU is not supported in this environment')
    }
    this.adapter = await navigator.gpu.requestAdapter({ powerPreference: this.powerPreference })
    if (!this.adapter) throw new Error('Could not acquire WebGPU adapter')
    this.device = await this.adapter.requestDevice()
    const context = this.canvas.getContext('webgpu') as GPUCanvasContext | null
    if (!context) throw new Error('Could not get WebGPU canvas context')
    this.context = context
    this.format = navigator.gpu.getPreferredCanvasFormat()
    context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    })
    this.pipeline = this.createColorPipeline(this.device, this.format)
    this.textPipeline = this.createTextPipeline(this.device, this.format)
    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    })
    this.textAtlas = new TextAtlas(2048, 2048)
    this._initialized = true
  }

  render(layout: ComputedLayout, tree: UIElement): void {
    if (!this._initialized) {
      const ctx = this.canvas.getContext('2d')
      if (!ctx) {
        throw new Error('WebGPURenderer is not initialized. Call init() first.')
      }
      ctx.fillStyle = this.background
      const { w, h } = safeCanvasExtent(layout)
      ctx.fillRect(0, 0, w, h)
      return
    }
    const device = this.device!
    const context = this.context!
    const colorPipeline = this.pipeline!
    const textPipeline = this.textPipeline!
    const { w: canvasW, h: canvasH } = safeCanvasExtent(layout)
    this.canvas.width = canvasW
    this.canvas.height = canvasH

    const rects: number[] = []
    const unsupported = { count: 0 }
    const textItems: Array<{
      text: string
      font: string
      color: string
      lineHeight: number
      x: number
      y: number
      w: number
      h: number
      whiteSpace?: string
    }> = []
    this.collectRenderables(tree, layout, 0, 0, rects, textItems, unsupported)
    if (unsupported.count > 0) this.onFallbackNeeded?.(unsupported.count)

    // Rasterize text to atlas
    const atlas = this.textAtlas!
    atlas.clear()
    for (const item of textItems) {
      atlas.addText(item.text, item.font, item.color, item.lineHeight, item.x, item.y, item.w, item.h, item.whiteSpace)
    }

    const color = parseColor(this.background)
    const encoder = device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: color[0], g: color[1], b: color[2], a: color[3] },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    })

    // Draw solid boxes
    if (rects.length > 0) {
      const vb = this.ensureVertexBuffer(rects.length * 4)
      device.queue.writeBuffer(vb, 0, new Float32Array(rects))
      pass.setPipeline(colorPipeline)
      pass.setVertexBuffer(0, vb)
      pass.draw(rects.length / 6)
    }

    // Draw text quads
    const entries = atlas.getEntries()
    if (entries.length > 0) {
      const textVerts = this.buildTextVertices(entries, canvasW, canvasH, atlas.width, atlas.height)
      if (textVerts.length > 0) {
        const tvb = this.ensureTextVertexBuffer(textVerts.length * 4)
        device.queue.writeBuffer(tvb, 0, new Float32Array(textVerts))

        // Upload atlas texture
        const atlasCanvas = (atlas as unknown as { canvas: OffscreenCanvas }).canvas
        const texture = device.createTexture({
          size: [atlas.width, atlas.height],
          format: 'rgba8unorm',
          usage: 0x04 | 0x10, // TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT
        })
        device.queue.copyExternalImageToTexture(
          { source: atlasCanvas },
          { texture },
          [atlas.width, atlas.height],
        )

        const bindGroup = device.createBindGroup({
          layout: this.textBindGroupLayout!,
          entries: [
            { binding: 0, resource: this.sampler! },
            { binding: 1, resource: texture.createView() },
          ],
        })

        pass.setPipeline(textPipeline)
        pass.setVertexBuffer(0, tvb)
        pass.setBindGroup(0, bindGroup)
        pass.draw(textVerts.length / 4)

        texture.destroy()
      }
    }

    pass.end()
    device.queue.submit([encoder.finish()])
  }

  destroy(): void {
    if (this.vertexBuffer) {
      this.vertexBuffer.destroy()
      this.vertexBuffer = null
    }
    if (this.textVertexBuffer) {
      this.textVertexBuffer.destroy()
      this.textVertexBuffer = null
    }
    this.pipeline = null
    this.textPipeline = null
    this.textBindGroupLayout = null
    this.sampler = null
    this.textAtlas = null
    this.context = null
    this.device = null
    this.adapter = null
    this.format = null
    this._initialized = false
  }

  private createColorPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
    const shader = device.createShaderModule({
      code: `
struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
}

@vertex
fn vs_main(
  @location(0) pos: vec2f,
  @location(1) color: vec4f,
) -> VSOut {
  var out: VSOut;
  out.position = vec4f(pos.x, pos.y, 0.0, 1.0);
  out.color = color;
  return out;
}

@fragment
fn fs_main(@location(0) color: vec4f) -> @location(0) vec4f {
  return color;
}
`,
    })
    return device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shader,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 6 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 2 * 4, format: 'float32x4' },
          ],
        }],
      },
      fragment: {
        module: shader,
        entryPoint: 'fs_main',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    })
  }

  private createTextPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
    const shader = device.createShaderModule({
      code: `
struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var atlasSampler: sampler;
@group(0) @binding(1) var atlasTexture: texture_2d<f32>;

@vertex
fn vs_main(
  @location(0) pos: vec2f,
  @location(1) uv: vec2f,
) -> VSOut {
  var out: VSOut;
  out.position = vec4f(pos.x, pos.y, 0.0, 1.0);
  out.uv = uv;
  return out;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(atlasTexture, atlasSampler, uv);
}
`,
    })

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: 0x2, sampler: {} }, // GPUShaderStage.FRAGMENT
        { binding: 1, visibility: 0x2, texture: {} },
      ],
    })
    this.textBindGroupLayout = bindGroupLayout

    return device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module: shader,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 4 * 4, // 2 pos + 2 uv
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 2 * 4, format: 'float32x2' },
          ],
        }],
      },
      fragment: {
        module: shader,
        entryPoint: 'fs_main',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    })
  }

  private buildTextVertices(
    entries: TextEntry[],
    canvasW: number,
    canvasH: number,
    atlasW: number,
    atlasH: number,
  ): number[] {
    const verts: number[] = []
    for (const e of entries) {
      // NDC coordinates
      const x0 = (e.dx / canvasW) * 2 - 1
      const y0 = 1 - (e.dy / canvasH) * 2
      const x1 = ((e.dx + e.dw) / canvasW) * 2 - 1
      const y1 = 1 - ((e.dy + e.dh) / canvasH) * 2

      // UV coordinates
      const u0 = e.ax / atlasW
      const v0 = e.ay / atlasH
      const u1 = (e.ax + e.aw) / atlasW
      const v1 = (e.ay + e.ah) / atlasH

      // Triangle 1
      verts.push(x0, y0, u0, v0)
      verts.push(x1, y0, u1, v0)
      verts.push(x0, y1, u0, v1)
      // Triangle 2
      verts.push(x1, y0, u1, v0)
      verts.push(x1, y1, u1, v1)
      verts.push(x0, y1, u0, v1)
    }
    return verts
  }

  private ensureVertexBuffer(requiredBytes: number): GPUBuffer {
    const device = this.device!
    if (this.vertexBuffer && this.vertexCapacity >= requiredBytes) {
      return this.vertexBuffer
    }
    if (this.vertexBuffer) this.vertexBuffer.destroy()
    this.vertexCapacity = Math.max(requiredBytes, 1024 * 16)
    this.vertexBuffer = device.createBuffer({
      size: this.vertexCapacity,
      usage: 0x0020 | 0x0008, // VERTEX | COPY_DST
    })
    return this.vertexBuffer
  }

  private ensureTextVertexBuffer(requiredBytes: number): GPUBuffer {
    const device = this.device!
    if (this.textVertexBuffer && this.textVertexCapacity >= requiredBytes) {
      return this.textVertexBuffer
    }
    if (this.textVertexBuffer) this.textVertexBuffer.destroy()
    this.textVertexCapacity = Math.max(requiredBytes, 1024 * 16)
    this.textVertexBuffer = device.createBuffer({
      size: this.textVertexCapacity,
      usage: 0x0020 | 0x0008,
    })
    return this.textVertexBuffer
  }

  private collectRenderables(
    element: UIElement,
    layout: ComputedLayout,
    offsetX: number,
    offsetY: number,
    colorRects: number[],
    textItems: Array<{
      text: string
      font: string
      color: string
      lineHeight: number
      x: number
      y: number
      w: number
      h: number
      whiteSpace?: string
    }>,
    unsupported: { count: number },
  ): void {
    if (!layoutBoundsAreFinite(layout)) {
      unsupported.count++
      return
    }
    const x = offsetX + layout.x
    const y = offsetY + layout.y
    const w = layout.width
    const h = layout.height

    if (element.kind === 'text') {
      const { text, font, color, lineHeight, whiteSpace } = element.props
      if (text) {
        textItems.push({
          text,
          font: font ?? '16px sans-serif',
          color: color ?? '#ffffff',
          lineHeight: lineHeight ?? 20,
          x,
          y,
          w,
          h,
          whiteSpace,
        })
      }
      return
    }

    if (element.kind === 'box') {
      const { backgroundColor, borderRadius, gradient, boxShadow, opacity } = element.props
      if (backgroundColor && !borderRadius && !gradient && !boxShadow) {
        const [r, g, b, a] = parseColor(backgroundColor)
        const alpha = opacity === undefined ? a : a * opacity
        pushRectVertices(colorRects, x, y, w, h, this.canvas.width, this.canvas.height, r, g, b, alpha)
      } else if (gradient || borderRadius || boxShadow) {
        unsupported.count++
      }
      const childOffsetX = x - finiteNumberOrZero(element.props.scrollX)
      const childOffsetY = y - finiteNumberOrZero(element.props.scrollY)
      for (let i = 0; i < element.children.length; i++) {
        const childLayout = layout.children[i]
        if (childLayout) {
          this.collectRenderables(element.children[i]!, childLayout, childOffsetX, childOffsetY, colorRects, textItems, unsupported)
        }
      }
      return
    }
    unsupported.count++
  }
}

function pushRectVertices(
  out: number[],
  x: number,
  y: number,
  w: number,
  h: number,
  canvasW: number,
  canvasH: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const x0 = (x / canvasW) * 2 - 1
  const y0 = 1 - (y / canvasH) * 2
  const x1 = ((x + w) / canvasW) * 2 - 1
  const y1 = 1 - ((y + h) / canvasH) * 2
  // Triangle 1
  out.push(x0, y0, r, g, b, a)
  out.push(x1, y0, r, g, b, a)
  out.push(x0, y1, r, g, b, a)
  // Triangle 2
  out.push(x1, y0, r, g, b, a)
  out.push(x1, y1, r, g, b, a)
  out.push(x0, y1, r, g, b, a)
}

function parseColor(color: string): [number, number, number, number] {
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const full = hex.length === 3
      ? hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!
      : hex
    const r = parseInt(full.slice(0, 2), 16) / 255
    const g = parseInt(full.slice(2, 4), 16) / 255
    const b = parseInt(full.slice(4, 6), 16) / 255
    return [r, g, b, 1]
  }
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/)
  if (m) {
    return [
      Number(m[1]) / 255,
      Number(m[2]) / 255,
      Number(m[3]) / 255,
      m[4] === undefined ? 1 : Number(m[4]),
    ]
  }
  return [0, 0, 0, 1]
}

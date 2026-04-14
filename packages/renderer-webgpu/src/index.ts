import type { ComputedLayout } from 'textura'
import {
  finiteNumberOrZero,
  layoutBoundsAreFinite,
  type Renderer,
  type UIElement,
  type BoxElement,
} from '@geometra/core'

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
 * Pipelines:
 * - color: vertex-colored triangles for flat boxes
 * - shape: rounded-rect / gradient boxes via SDF fragment shader
 * - text: offscreen-canvas atlas sampled as GPU texture
 * - image: per-image textures sampled as GPU texture
 */

function safeCanvasExtent(layout: ComputedLayout): { w: number; h: number } {
  if (!layoutBoundsAreFinite(layout)) {
    return { w: 1, h: 1 }
  }
  return {
    w: Math.max(1, Math.round(layout.width)),
    h: Math.max(1, Math.round(layout.height)),
  }
}

// --- Text atlas ---

interface TextEntry {
  ax: number
  ay: number
  aw: number
  ah: number
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

      if (this.cursorX + lw > this.width) {
        this.cursorX = 0
        this.cursorY += this.rowHeight
        this.rowHeight = 0
      }
      if (this.cursorY + lh > this.height) continue

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

  getCanvas(): OffscreenCanvas {
    return this.canvas
  }
}

function wrapText(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text]
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const testLine = current ? current + ' ' + word : word
    if (ctx.measureText(testLine).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = testLine
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

// --- Image cache ---

interface ImageTextureEntry {
  texture: GPUTexture
  width: number
  height: number
  loaded: boolean
}

class ImageCache {
  private cache = new Map<string, ImageTextureEntry>()
  private loading = new Map<string, Promise<void>>()

  constructor(private device: GPUDevice, private onReady: () => void) {}

  get(src: string): ImageTextureEntry | null {
    const entry = this.cache.get(src)
    if (entry) return entry
    if (!this.loading.has(src)) {
      this.loading.set(src, this.load(src))
    }
    return null
  }

  private async load(src: string): Promise<void> {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = src
      await img.decode()
      const bitmap = await createImageBitmap(img)
      const texture = this.device.createTexture({
        size: [bitmap.width, bitmap.height],
        format: 'rgba8unorm',
        usage: 0x04 | 0x10, // TEXTURE_BINDING | COPY_DST
      })
      this.device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture },
        [bitmap.width, bitmap.height],
      )
      this.cache.set(src, {
        texture,
        width: bitmap.width,
        height: bitmap.height,
        loaded: true,
      })
      this.onReady()
    } catch {
      // Mark as failed so we don't retry every frame
      this.cache.set(src, { texture: null as unknown as GPUTexture, width: 0, height: 0, loaded: false })
    } finally {
      this.loading.delete(src)
    }
  }

  destroy(): void {
    for (const entry of this.cache.values()) {
      if (entry.loaded && entry.texture) entry.texture.destroy()
    }
    this.cache.clear()
    this.loading.clear()
  }
}

// --- Collected renderables ---

interface TextItem {
  text: string
  font: string
  color: string
  lineHeight: number
  x: number
  y: number
  w: number
  h: number
  whiteSpace?: string
}

interface ImageItem {
  src: string
  x: number
  y: number
  w: number
  h: number
  opacity: number
}

interface ShapeItem {
  x: number
  y: number
  w: number
  h: number
  radius: number
  color1: [number, number, number, number]
  color2: [number, number, number, number]
  gradientDir: [number, number] // unit vector; (0,0) means solid
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

  // Pipelines
  private colorPipeline: GPURenderPipeline | null = null
  private shapePipeline: GPURenderPipeline | null = null
  private texturePipeline: GPURenderPipeline | null = null
  private textureBindGroupLayout: GPUBindGroupLayout | null = null
  private sampler: GPUSampler | null = null

  // Buffers
  private colorVB: GPUBuffer | null = null
  private colorVBCapacity = 0
  private shapeVB: GPUBuffer | null = null
  private shapeVBCapacity = 0
  private textVB: GPUBuffer | null = null
  private textVBCapacity = 0
  private imageVB: GPUBuffer | null = null
  private imageVBCapacity = 0

  private textAtlas: TextAtlas | null = null
  private imageCache: ImageCache | null = null

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
    this.colorPipeline = this.createColorPipeline(this.device, this.format)
    this.shapePipeline = this.createShapePipeline(this.device, this.format)
    this.texturePipeline = this.createTexturePipeline(this.device, this.format)
    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    })
    this.textAtlas = new TextAtlas(2048, 2048)
    this.imageCache = new ImageCache(this.device, () => {
      // Image loaded — could trigger a re-render; left to the host app
    })
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
    const { w: canvasW, h: canvasH } = safeCanvasExtent(layout)
    this.canvas.width = canvasW
    this.canvas.height = canvasH

    const colorRects: number[] = []
    const shapes: ShapeItem[] = []
    const textItems: TextItem[] = []
    const imageItems: ImageItem[] = []
    const unsupported = { count: 0 }

    this.collect(tree, layout, 0, 0, colorRects, shapes, textItems, imageItems, unsupported)
    if (unsupported.count > 0) this.onFallbackNeeded?.(unsupported.count)

    // Rasterize text to atlas
    const atlas = this.textAtlas!
    atlas.clear()
    for (const item of textItems) {
      atlas.addText(item.text, item.font, item.color, item.lineHeight, item.x, item.y, item.w, item.h, item.whiteSpace)
    }

    const bgColor = parseColor(this.background)
    const encoder = device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: bgColor[0], g: bgColor[1], b: bgColor[2], a: bgColor[3] },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    })

    // 1) Flat solid boxes
    if (colorRects.length > 0) {
      const vb = this.ensureBuffer('color', colorRects.length * 4)
      device.queue.writeBuffer(vb, 0, new Float32Array(colorRects))
      pass.setPipeline(this.colorPipeline!)
      pass.setVertexBuffer(0, vb)
      pass.draw(colorRects.length / 6)
    }

    // 2) Rounded-rect / gradient boxes
    if (shapes.length > 0) {
      const shapeVerts = this.buildShapeVertices(shapes, canvasW, canvasH)
      const vb = this.ensureBuffer('shape', shapeVerts.length * 4)
      device.queue.writeBuffer(vb, 0, new Float32Array(shapeVerts))
      pass.setPipeline(this.shapePipeline!)
      pass.setVertexBuffer(0, vb)
      pass.draw(shapeVerts.length / SHAPE_VERTEX_STRIDE)
    }

    // 3) Text atlas draw
    const atlasEntries = atlas.getEntries()
    if (atlasEntries.length > 0) {
      const textVerts = this.buildTextureVertices(
        atlasEntries.map((e) => ({
          dx: e.dx,
          dy: e.dy,
          dw: e.dw,
          dh: e.dh,
          ax: e.ax,
          ay: e.ay,
          aw: e.aw,
          ah: e.ah,
          atlasW: atlas.width,
          atlasH: atlas.height,
          alpha: 1,
        })),
        canvasW,
        canvasH,
      )
      if (textVerts.length > 0) {
        const vb = this.ensureBuffer('text', textVerts.length * 4)
        device.queue.writeBuffer(vb, 0, new Float32Array(textVerts))

        const atlasTexture = device.createTexture({
          size: [atlas.width, atlas.height],
          format: 'rgba8unorm',
          usage: 0x04 | 0x10,
        })
        device.queue.copyExternalImageToTexture(
          { source: atlas.getCanvas() },
          { texture: atlasTexture },
          [atlas.width, atlas.height],
        )

        const bindGroup = device.createBindGroup({
          layout: this.textureBindGroupLayout!,
          entries: [
            { binding: 0, resource: this.sampler! },
            { binding: 1, resource: atlasTexture.createView() },
          ],
        })

        pass.setPipeline(this.texturePipeline!)
        pass.setVertexBuffer(0, vb)
        pass.setBindGroup(0, bindGroup)
        pass.draw(textVerts.length / TEXTURE_VERTEX_STRIDE)

        atlasTexture.destroy()
      }
    }

    // 4) Images — each image has its own texture, so we batch per image
    for (const img of imageItems) {
      const entry = this.imageCache!.get(img.src)
      if (!entry || !entry.loaded) continue
      const verts = this.buildTextureVertices(
        [
          {
            dx: img.x,
            dy: img.y,
            dw: img.w,
            dh: img.h,
            ax: 0,
            ay: 0,
            aw: entry.width,
            ah: entry.height,
            atlasW: entry.width,
            atlasH: entry.height,
            alpha: img.opacity,
          },
        ],
        canvasW,
        canvasH,
      )
      const vb = this.ensureBuffer('image', verts.length * 4)
      device.queue.writeBuffer(vb, 0, new Float32Array(verts))

      const bindGroup = device.createBindGroup({
        layout: this.textureBindGroupLayout!,
        entries: [
          { binding: 0, resource: this.sampler! },
          { binding: 1, resource: entry.texture.createView() },
        ],
      })

      pass.setPipeline(this.texturePipeline!)
      pass.setVertexBuffer(0, vb)
      pass.setBindGroup(0, bindGroup)
      pass.draw(verts.length / TEXTURE_VERTEX_STRIDE)
    }

    pass.end()
    device.queue.submit([encoder.finish()])
  }

  destroy(): void {
    for (const buf of [this.colorVB, this.shapeVB, this.textVB, this.imageVB]) {
      if (buf) buf.destroy()
    }
    this.colorVB = this.shapeVB = this.textVB = this.imageVB = null
    if (this.imageCache) {
      this.imageCache.destroy()
      this.imageCache = null
    }
    this.colorPipeline = null
    this.shapePipeline = null
    this.texturePipeline = null
    this.textureBindGroupLayout = null
    this.sampler = null
    this.textAtlas = null
    this.context = null
    this.device = null
    this.adapter = null
    this.format = null
    this._initialized = false
  }

  // --- Pipelines ---

  private createColorPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
    const shader = device.createShaderModule({
      code: `
struct VSOut { @builtin(position) position: vec4f, @location(0) color: vec4f, }

@vertex fn vs_main(@location(0) pos: vec2f, @location(1) color: vec4f) -> VSOut {
  var out: VSOut;
  out.position = vec4f(pos.x, pos.y, 0.0, 1.0);
  out.color = color;
  return out;
}

@fragment fn fs_main(@location(0) color: vec4f) -> @location(0) vec4f { return color; }
`,
    })
    return device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shader,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 6 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 2 * 4, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: {
        module: shader,
        entryPoint: 'fs_main',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    })
  }

  /**
   * Shape pipeline: per-vertex local position + shape params drive an SDF fragment shader
   * for rounded rects, linear gradients, or both.
   *
   * Per-vertex layout (12 floats = 48 bytes):
   *   pos (vec2)      — NDC position
   *   localPx (vec2)  — position in pixels relative to rect center
   *   halfSize (vec2) — rect half-size in pixels
   *   radius (f32)    — border-radius in pixels
   *   color1 (vec4)   — solid color (or gradient stop 1)
   *   color2Lo (f32)  — packed xy of color2 (rg) [stride-fitting]
   *
   * For simplicity we store two colors + gradient direction as **instance-like** per-vertex
   * data. Each of the 6 vertices of a box repeats the same color/gradient fields.
   * Actual per-vertex layout is larger (see SHAPE_VERTEX_STRIDE).
   */
  private createShapePipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
    const shader = device.createShaderModule({
      code: `
struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) localPx: vec2f,
  @location(1) halfSize: vec2f,
  @location(2) radius: f32,
  @location(3) color1: vec4f,
  @location(4) color2: vec4f,
  @location(5) gradDir: vec2f,
}

@vertex fn vs_main(
  @location(0) pos: vec2f,
  @location(1) localPx: vec2f,
  @location(2) halfSize: vec2f,
  @location(3) radius: f32,
  @location(4) color1: vec4f,
  @location(5) color2: vec4f,
  @location(6) gradDir: vec2f,
) -> VSOut {
  var out: VSOut;
  out.position = vec4f(pos.x, pos.y, 0.0, 1.0);
  out.localPx = localPx;
  out.halfSize = halfSize;
  out.radius = radius;
  out.color1 = color1;
  out.color2 = color2;
  out.gradDir = gradDir;
  return out;
}

fn sdRoundRect(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + vec2f(r, r);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0, 0.0))) - r;
}

@fragment fn fs_main(in: VSOut) -> @location(0) vec4f {
  // SDF for rounded rect
  let d = sdRoundRect(in.localPx, in.halfSize, in.radius);
  // Antialias edge (1 pixel of smoothstep)
  let alpha = 1.0 - smoothstep(-0.5, 0.5, d);

  // Gradient interpolation: project localPx onto gradDir (in [-1, 1] range)
  var col = in.color1;
  let dirLen = length(in.gradDir);
  if (dirLen > 0.001) {
    let dir = in.gradDir / dirLen;
    // Normalize localPx by half-size to get [-1,1] coords, then project
    let norm = in.localPx / max(in.halfSize, vec2f(0.001, 0.001));
    let t = clamp(dot(norm, dir) * 0.5 + 0.5, 0.0, 1.0);
    col = mix(in.color1, in.color2, t);
  }

  return vec4f(col.rgb, col.a * alpha);
}
`,
    })

    return device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shader,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: SHAPE_VERTEX_STRIDE * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },        // pos
              { shaderLocation: 1, offset: 2 * 4, format: 'float32x2' },    // localPx
              { shaderLocation: 2, offset: 4 * 4, format: 'float32x2' },    // halfSize
              { shaderLocation: 3, offset: 6 * 4, format: 'float32' },      // radius
              { shaderLocation: 4, offset: 7 * 4, format: 'float32x4' },    // color1
              { shaderLocation: 5, offset: 11 * 4, format: 'float32x4' },   // color2
              { shaderLocation: 6, offset: 15 * 4, format: 'float32x2' },   // gradDir
            ],
          },
        ],
      },
      fragment: {
        module: shader,
        entryPoint: 'fs_main',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    })
  }

  private createTexturePipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
    const shader = device.createShaderModule({
      code: `
struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) alpha: f32,
}

@group(0) @binding(0) var atlasSampler: sampler;
@group(0) @binding(1) var atlasTexture: texture_2d<f32>;

@vertex fn vs_main(@location(0) pos: vec2f, @location(1) uv: vec2f, @location(2) alpha: f32) -> VSOut {
  var out: VSOut;
  out.position = vec4f(pos.x, pos.y, 0.0, 1.0);
  out.uv = uv;
  out.alpha = alpha;
  return out;
}

@fragment fn fs_main(in: VSOut) -> @location(0) vec4f {
  let c = textureSample(atlasTexture, atlasSampler, in.uv);
  return vec4f(c.rgb, c.a * in.alpha);
}
`,
    })

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: 0x2, sampler: {} },
        { binding: 1, visibility: 0x2, texture: {} },
      ],
    })
    this.textureBindGroupLayout = bindGroupLayout

    return device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module: shader,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: TEXTURE_VERTEX_STRIDE * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },      // pos
              { shaderLocation: 1, offset: 2 * 4, format: 'float32x2' },  // uv
              { shaderLocation: 2, offset: 4 * 4, format: 'float32' },    // alpha
            ],
          },
        ],
      },
      fragment: {
        module: shader,
        entryPoint: 'fs_main',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    })
  }

  // --- Vertex builders ---

  private buildShapeVertices(shapes: ShapeItem[], canvasW: number, canvasH: number): number[] {
    const verts: number[] = []
    for (const s of shapes) {
      const x0 = (s.x / canvasW) * 2 - 1
      const y0 = 1 - (s.y / canvasH) * 2
      const x1 = ((s.x + s.w) / canvasW) * 2 - 1
      const y1 = 1 - ((s.y + s.h) / canvasH) * 2
      const hw = s.w / 2
      const hh = s.h / 2
      const r = Math.min(s.radius, hw, hh)
      const [c1r, c1g, c1b, c1a] = s.color1
      const [c2r, c2g, c2b, c2a] = s.color2
      const [gx, gy] = s.gradientDir

      // Each vertex: pos(2), localPx(2), halfSize(2), radius(1), color1(4), color2(4), gradDir(2) = 17
      // Triangle 1
      pushShapeVert(verts, x0, y0, -hw, -hh, hw, hh, r, c1r, c1g, c1b, c1a, c2r, c2g, c2b, c2a, gx, gy)
      pushShapeVert(verts, x1, y0, hw, -hh, hw, hh, r, c1r, c1g, c1b, c1a, c2r, c2g, c2b, c2a, gx, gy)
      pushShapeVert(verts, x0, y1, -hw, hh, hw, hh, r, c1r, c1g, c1b, c1a, c2r, c2g, c2b, c2a, gx, gy)
      // Triangle 2
      pushShapeVert(verts, x1, y0, hw, -hh, hw, hh, r, c1r, c1g, c1b, c1a, c2r, c2g, c2b, c2a, gx, gy)
      pushShapeVert(verts, x1, y1, hw, hh, hw, hh, r, c1r, c1g, c1b, c1a, c2r, c2g, c2b, c2a, gx, gy)
      pushShapeVert(verts, x0, y1, -hw, hh, hw, hh, r, c1r, c1g, c1b, c1a, c2r, c2g, c2b, c2a, gx, gy)
    }
    return verts
  }

  private buildTextureVertices(
    entries: Array<{
      dx: number
      dy: number
      dw: number
      dh: number
      ax: number
      ay: number
      aw: number
      ah: number
      atlasW: number
      atlasH: number
      alpha: number
    }>,
    canvasW: number,
    canvasH: number,
  ): number[] {
    const verts: number[] = []
    for (const e of entries) {
      const x0 = (e.dx / canvasW) * 2 - 1
      const y0 = 1 - (e.dy / canvasH) * 2
      const x1 = ((e.dx + e.dw) / canvasW) * 2 - 1
      const y1 = 1 - ((e.dy + e.dh) / canvasH) * 2

      const u0 = e.ax / e.atlasW
      const v0 = e.ay / e.atlasH
      const u1 = (e.ax + e.aw) / e.atlasW
      const v1 = (e.ay + e.ah) / e.atlasH

      verts.push(x0, y0, u0, v0, e.alpha)
      verts.push(x1, y0, u1, v0, e.alpha)
      verts.push(x0, y1, u0, v1, e.alpha)
      verts.push(x1, y0, u1, v0, e.alpha)
      verts.push(x1, y1, u1, v1, e.alpha)
      verts.push(x0, y1, u0, v1, e.alpha)
    }
    return verts
  }

  private ensureBuffer(kind: 'color' | 'shape' | 'text' | 'image', requiredBytes: number): GPUBuffer {
    const device = this.device!
    const minSize = 1024 * 16
    const field = kind === 'color' ? 'colorVB' : kind === 'shape' ? 'shapeVB' : kind === 'text' ? 'textVB' : 'imageVB'
    const capField = kind === 'color'
      ? 'colorVBCapacity'
      : kind === 'shape'
      ? 'shapeVBCapacity'
      : kind === 'text'
      ? 'textVBCapacity'
      : 'imageVBCapacity'
    const current = this[field] as GPUBuffer | null
    const capacity = this[capField] as number
    if (current && capacity >= requiredBytes) return current
    if (current) current.destroy()
    const newCap = Math.max(requiredBytes, minSize)
    const buf = device.createBuffer({ size: newCap, usage: 0x0020 | 0x0008 })
    ;(this[field] as GPUBuffer | null) = buf
    ;(this[capField] as number) = newCap
    return buf
  }

  // --- Tree walk & categorization ---

  private collect(
    element: UIElement,
    layout: ComputedLayout,
    offsetX: number,
    offsetY: number,
    colorRects: number[],
    shapes: ShapeItem[],
    textItems: TextItem[],
    imageItems: ImageItem[],
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

    if (element.kind === 'image') {
      const { src, opacity } = element.props
      if (src) {
        imageItems.push({
          src,
          x,
          y,
          w,
          h,
          opacity: opacity ?? 1,
        })
      }
      return
    }

    if (element.kind === 'box') {
      this.categorizeBox(element, x, y, w, h, colorRects, shapes, unsupported)

      const childOffsetX = x - finiteNumberOrZero(element.props.scrollX)
      const childOffsetY = y - finiteNumberOrZero(element.props.scrollY)
      for (let i = 0; i < element.children.length; i++) {
        const childLayout = layout.children[i]
        if (childLayout) {
          this.collect(
            element.children[i]!,
            childLayout,
            childOffsetX,
            childOffsetY,
            colorRects,
            shapes,
            textItems,
            imageItems,
            unsupported,
          )
        }
      }
      return
    }
    unsupported.count++
  }

  private categorizeBox(
    element: BoxElement,
    x: number,
    y: number,
    w: number,
    h: number,
    colorRects: number[],
    shapes: ShapeItem[],
    unsupported: { count: number },
  ): void {
    const { backgroundColor, borderRadius, gradient, boxShadow, opacity } = element.props

    if (boxShadow) unsupported.count++

    const hasRadius = typeof borderRadius === 'number' && borderRadius > 0
    const hasGradient = !!gradient && gradient.type === 'linear' && gradient.stops.length >= 2

    if (!hasRadius && !hasGradient && !backgroundColor) return

    if (!hasRadius && !hasGradient && backgroundColor) {
      // Flat path
      const [r, g, b, a] = parseColor(backgroundColor)
      const alpha = opacity === undefined ? a : a * opacity
      pushRectVertices(colorRects, x, y, w, h, this.canvas.width, this.canvas.height, r, g, b, alpha)
      return
    }

    // Shape path
    let color1: [number, number, number, number]
    let color2: [number, number, number, number]
    let gradDir: [number, number] = [0, 0]

    if (hasGradient) {
      const stops = gradient.stops
      const c1 = parseColor(stops[0]!.color)
      const c2 = parseColor(stops[stops.length - 1]!.color)
      color1 = c1
      color2 = c2
      // Angle: 0° = top-to-bottom (CSS), 90° = left-to-right
      // Gradient direction vector in normalized coords
      const angleRad = ((gradient.angle ?? 180) * Math.PI) / 180
      gradDir = [Math.sin(angleRad), -Math.cos(angleRad)]
    } else {
      const base = backgroundColor ? parseColor(backgroundColor) : ([0, 0, 0, 1] as [number, number, number, number])
      color1 = base
      color2 = base
    }

    if (opacity !== undefined) {
      color1 = [color1[0], color1[1], color1[2], color1[3] * opacity]
      color2 = [color2[0], color2[1], color2[2], color2[3] * opacity]
    }

    shapes.push({
      x,
      y,
      w,
      h,
      radius: hasRadius ? borderRadius! : 0,
      color1,
      color2,
      gradientDir: gradDir,
    })
  }
}

// --- Constants ---

const SHAPE_VERTEX_STRIDE = 17 // pos(2) localPx(2) halfSize(2) radius(1) color1(4) color2(4) gradDir(2)
const TEXTURE_VERTEX_STRIDE = 5 // pos(2) uv(2) alpha(1)

function pushShapeVert(
  out: number[],
  px: number,
  py: number,
  lx: number,
  ly: number,
  hw: number,
  hh: number,
  r: number,
  c1r: number,
  c1g: number,
  c1b: number,
  c1a: number,
  c2r: number,
  c2g: number,
  c2b: number,
  c2a: number,
  gx: number,
  gy: number,
): void {
  out.push(px, py, lx, ly, hw, hh, r, c1r, c1g, c1b, c1a, c2r, c2g, c2b, c2a, gx, gy)
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
  out.push(x0, y0, r, g, b, a)
  out.push(x1, y0, r, g, b, a)
  out.push(x0, y1, r, g, b, a)
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

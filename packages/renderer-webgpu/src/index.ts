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
 * Early WebGPU renderer scaffold.
 *
 * This package establishes a stable API surface so apps can start integrating
 * WebGPU capability checks and fallback paths. Full paint parity with
 * renderer-canvas is tracked as follow-up work.
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
  private vertexBuffer: GPUBuffer | null = null
  private vertexCapacity = 0

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
    this.pipeline = this.createPipeline(this.device, this.format)
    this._initialized = true
  }

  render(layout: ComputedLayout, tree: UIElement): void {
    if (!this._initialized) {
      // Keep first milestone predictable: fallback clear pass until full GPU pipeline lands.
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
    const pipeline = this.pipeline!
    const { w: canvasW, h: canvasH } = safeCanvasExtent(layout)
    this.canvas.width = canvasW
    this.canvas.height = canvasH

    const rects: number[] = []
    const unsupported = { count: 0 }
    this.collectSolidBoxes(tree, layout, 0, 0, rects, unsupported)
    if (unsupported.count > 0) this.onFallbackNeeded?.(unsupported.count)

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

    if (rects.length > 0) {
      const vb = this.ensureVertexBuffer(rects.length * 4)
      device.queue.writeBuffer(vb, 0, new Float32Array(rects))
      pass.setPipeline(pipeline)
      pass.setVertexBuffer(0, vb)
      pass.draw(rects.length / 4)
    }
    pass.end()
    device.queue.submit([encoder.finish()])
  }

  destroy(): void {
    if (this.vertexBuffer) {
      this.vertexBuffer.destroy()
      this.vertexBuffer = null
    }
    this.pipeline = null
    this.context = null
    this.device = null
    this.adapter = null
    this.format = null
    this._initialized = false
  }

  private createPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
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
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    })
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

  private collectSolidBoxes(
    element: UIElement,
    layout: ComputedLayout,
    offsetX: number,
    offsetY: number,
    out: number[],
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
    if (element.kind === 'box') {
      const { backgroundColor, borderRadius, gradient, boxShadow, opacity } = element.props
      if (backgroundColor && !borderRadius && !gradient && !boxShadow) {
        const [r, g, b, a] = parseColor(backgroundColor)
        const alpha = opacity === undefined ? a : a * opacity
        pushRectVertices(out, x, y, w, h, this.canvas.width, this.canvas.height, r, g, b, alpha)
      } else if (gradient || borderRadius || boxShadow) {
        unsupported.count++
      }
      const childOffsetX = x - finiteNumberOrZero(element.props.scrollX)
      const childOffsetY = y - finiteNumberOrZero(element.props.scrollY)
      for (let i = 0; i < element.children.length; i++) {
        const childLayout = layout.children[i]
        if (childLayout) {
          this.collectSolidBoxes(element.children[i]!, childLayout, childOffsetX, childOffsetY, out, unsupported)
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

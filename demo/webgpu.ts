import { box, text, createApp, type App, type Renderer, type UIElement } from '@geometra/core'
import { CanvasRenderer, enableInputForwarding } from '@geometra/renderer-canvas'
import { WebGPURenderer } from '@geometra/renderer-webgpu'

const BG = '#09090b'
const SURFACE = '#18181b'
const BORDER = '#3f3f46'
const TEXT = '#fafafa'
const MUTED = '#a1a1aa'
const DIM = '#71717a'
const ACCENT = '#e94560'
const ACCENT2 = '#0ea5e9'
const ACCENT3 = '#22c55e'

type DemoMode = 'ready' | 'unsupported' | 'error'

const canvas = document.getElementById('app') as HTMLCanvasElement
let app: App | null = null
let cleanupInputForwarding: (() => void) | null = null
let currentMode: DemoMode = 'ready'
let currentMessage = 'WebGPU ready. Rendering this page through the WebGPU backend.'

function actionButton(label: string, onClick: () => void): UIElement {
  return box({
    backgroundColor: SURFACE,
    borderColor: BORDER,
    borderRadius: 8,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 14,
    paddingRight: 14,
    cursor: 'pointer',
    onClick,
  }, [
    text({ text: label, font: '600 13px Inter, system-ui, sans-serif', lineHeight: 18, color: TEXT }),
  ])
}

function featureCard(title: string, body: string, color: string): UIElement {
  return box({
    backgroundColor: SURFACE,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 16,
    flexDirection: 'column',
    gap: 8,
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 180,
  }, [
    text({ text: title, font: '700 14px Inter, system-ui, sans-serif', lineHeight: 20, color }),
    text({ text: body, font: '13px Inter, system-ui, sans-serif', lineHeight: 20, color: MUTED, whiteSpace: 'normal' }),
  ])
}

function statusColor(mode: DemoMode): string {
  if (mode === 'ready') return ACCENT3
  if (mode === 'unsupported') return ACCENT2
  return ACCENT
}

function view(): UIElement {
  const width = window.innerWidth
  const height = window.innerHeight
  const contentWidth = Math.min(Math.max(280, width - 32), 980)
  const sidePad = Math.max(16, (width - contentWidth) / 2)
  const compact = width < 720

  return box({
    width,
    minHeight: height,
    backgroundColor: BG,
    paddingLeft: sidePad,
    paddingRight: sidePad,
    paddingTop: compact ? 32 : 48,
    paddingBottom: 32,
    flexDirection: 'column',
    gap: 22,
  }, [
    box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, [
      text({ text: 'WebGPU Renderer', font: '700 30px Inter, system-ui, sans-serif', lineHeight: 38, color: TEXT }),
      box({ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, [
        ...(currentMode !== 'ready' ? [actionButton('Run WebGPU', () => { window.location.href = './webgpu.html?forceWebGPU=1' })] : []),
        actionButton('Main Demo', () => { window.location.href = './' }),
        actionButton('GitHub', () => window.open('https://github.com/razroo/geometra/tree/main/packages/renderer-webgpu', '_blank')),
      ]),
    ]),
    text({
      text: 'Geometra tree, Yoga layout, GPU paint. This page keeps browser HTML to one canvas and renders diagnostics inside Geometra.',
      font: '15px Inter, system-ui, sans-serif',
      lineHeight: 23,
      color: MUTED,
      whiteSpace: 'normal',
    }),
    box({
      backgroundColor: 'rgba(24,24,27,0.92)',
      borderColor: statusColor(currentMode),
      borderWidth: 1,
      borderRadius: 8,
      padding: 14,
    }, [
      text({
        text: currentMessage,
        font: '13px Inter, system-ui, sans-serif',
        lineHeight: 20,
        color: currentMode === 'ready' ? '#bbf7d0' : currentMode === 'unsupported' ? '#bae6fd' : '#fecaca',
        whiteSpace: 'normal',
      }),
    ]),
    box({
      minHeight: compact ? 260 : 320,
      borderRadius: 8,
      borderColor: BORDER,
      borderWidth: 1,
      overflow: 'hidden',
      padding: compact ? 18 : 28,
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 22,
      gradient: {
        type: 'linear',
        angle: 135,
        stops: [
          { offset: 0, color: '#0f0f14' },
          { offset: 0.5, color: '#111827' },
          { offset: 1, color: '#171717' },
        ],
      },
    }, [
      box({ flexDirection: 'column', gap: 10 }, [
        text({ text: 'Same layout tree, different renderer', font: '700 24px Inter, system-ui, sans-serif', lineHeight: 32, color: TEXT }),
        text({
          text: 'Boxes, text, gradients, rounded shapes, images, selection highlights, and focus rings flow through the renderer contract instead of DOM layout.',
          font: '14px Inter, system-ui, sans-serif',
          lineHeight: 22,
          color: MUTED,
          whiteSpace: 'normal',
        }),
      ]),
      box({ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, [
        featureCard('Color pipeline', 'Vertex-colored triangles handle flat geometry with alpha blending.', ACCENT),
        featureCard('Shape pipeline', 'SDF fragments cover rounded corners, gradients, and shadow pre-pass work.', ACCENT2),
        featureCard('Texture pipeline', 'Text and images use GPU textures while layout stays renderer-agnostic.', ACCENT3),
      ]),
    ]),
    box({ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, [
      box({ width: 120, height: 72, borderRadius: 12, backgroundColor: ACCENT }, [
        text({ text: 'Box', font: '700 14px Inter, system-ui, sans-serif', lineHeight: 20, color: '#fff', marginLeft: 14, marginTop: 14 }),
      ]),
      box({
        width: 120,
        height: 72,
        borderRadius: { topLeft: 24, topRight: 4, bottomLeft: 4, bottomRight: 24 },
        gradient: {
          type: 'linear',
          angle: 135,
          stops: [
            { offset: 0, color: '#ff0080' },
            { offset: 0.55, color: '#7928ca' },
            { offset: 1, color: '#0070f3' },
          ],
        },
      }, [
        text({ text: 'Gradient', font: '700 14px Inter, system-ui, sans-serif', lineHeight: 20, color: '#fff', marginLeft: 14, marginTop: 14 }),
      ]),
      box({ width: 120, height: 72, borderRadius: 36, backgroundColor: ACCENT3 }, [
        text({ text: 'Pill', font: '700 14px Inter, system-ui, sans-serif', lineHeight: 20, color: '#052e16', marginLeft: 24, marginTop: 14 }),
      ]),
    ]),
    text({
      text: 'Current gaps: complex text shaping and advanced filters still belong on the renderer roadmap.',
      font: '12px Inter, system-ui, sans-serif',
      lineHeight: 18,
      color: DIM,
      whiteSpace: 'normal',
    }),
  ])
}

async function mountWith(nextRenderer: Renderer): Promise<void> {
  app?.destroy()
  let renderError: unknown
  const nextApp = await createApp(view, nextRenderer, {
    width: window.innerWidth,
    height: window.innerHeight,
    waitForFonts: true,
    onError: err => {
      renderError = err
      console.error('Geometra WebGPU demo render failed:', err)
    },
  })
  if (renderError) {
    nextApp.destroy()
    throw renderError
  }
  app = nextApp
  if (!cleanupInputForwarding) {
    cleanupInputForwarding = enableInputForwarding(canvas, () => app)
  }
}

async function mountFallback(mode: DemoMode, message: string): Promise<void> {
  currentMode = mode
  currentMessage = message
  await mountWith(new CanvasRenderer({ canvas, background: BG }))
}

async function main() {
  const forceWebGPU = new URLSearchParams(window.location.search).get('forceWebGPU') === '1'
  if (!forceWebGPU) {
    const availability = WebGPURenderer.isSupported() ? 'available' : 'not available'
    await mountFallback('unsupported', `WebGPU is ${availability}. This diagnostic page is rendered through the canvas renderer until Run WebGPU is selected.`)
    return
  }

  if (!WebGPURenderer.isSupported()) {
    await mountFallback('unsupported', 'WebGPU is not available in this browser. Try a current Chrome, Edge, or Safari Technology Preview build.')
    return
  }

  const webgpu = new WebGPURenderer({ canvas, background: BG })
  try {
    await webgpu.init()
  } catch (err) {
    await mountFallback('error', `WebGPU initialization failed: ${(err as Error).message}`)
    return
  }

  currentMode = 'ready'
  currentMessage = 'WebGPU ready. Rendering this page through the WebGPU backend.'
  try {
    await mountWith(webgpu)
  } catch (err) {
    await mountFallback('error', `WebGPU rendering failed: ${(err as Error).message}`)
  }
}

let resizeTimer: ReturnType<typeof setTimeout> | null = null
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    main().catch(err => {
      console.error('Geometra WebGPU demo resize failed:', err)
    })
  }, 150)
})

main().catch(err => {
  console.error('Geometra WebGPU demo failed:', err)
})

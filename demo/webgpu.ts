import { box, text, createApp } from '@geometra/core'
import { WebGPURenderer } from '@geometra/renderer-webgpu'

const statusEl = document.getElementById('status') as HTMLDivElement
const canvas = document.getElementById('app') as HTMLCanvasElement

async function main() {
  if (!WebGPURenderer.isSupported()) {
    statusEl.className = 'status err'
    statusEl.textContent =
      'WebGPU is not available in this browser. Try the latest Chrome, Edge, or Safari Technology Preview.'
    return
  }

  const renderer = new WebGPURenderer({ canvas, background: '#0f0f14' })

  try {
    await renderer.init()
  } catch (err) {
    statusEl.className = 'status err'
    statusEl.textContent = `WebGPU init failed: ${(err as Error).message}`
    return
  }

  statusEl.className = 'status ok'
  statusEl.textContent = 'WebGPU ready — rendering below.'

  const view = () =>
    box(
      {
        width: 800,
        height: 400,
        padding: 32,
        flexDirection: 'column',
        gap: 16,
        backgroundColor: '#0f0f14',
      },
      [
        text({
          text: 'Geometra + WebGPU',
          font: '700 32px Inter, sans-serif',
          lineHeight: 40,
          color: '#fafafa',
        }),
        text({
          text: 'Same layout, same tree, same protocol — rendered on the GPU.',
          font: '400 16px Inter, sans-serif',
          lineHeight: 22,
          color: '#a1a1aa',
          whiteSpace: 'normal',
        }),
        box(
          {
            flexDirection: 'row',
            gap: 12,
            marginTop: 24,
          },
          [
            box({ width: 120, height: 80, backgroundColor: '#e94560', borderRadius: 12 }, [
              text({
                text: 'Rounded',
                font: '600 14px Inter',
                lineHeight: 20,
                color: '#fff',
                marginLeft: 12,
                marginTop: 12,
              }),
            ]),
            box({
              width: 120,
              height: 80,
              borderRadius: 12,
              gradient: {
                type: 'linear',
                angle: 135,
                stops: [
                  { offset: 0, color: '#0ea5e9' },
                  { offset: 1, color: '#8b5cf6' },
                ],
              },
            }, [
              text({
                text: 'Gradient',
                font: '600 14px Inter',
                lineHeight: 20,
                color: '#fff',
                marginLeft: 12,
                marginTop: 12,
              }),
            ]),
            box({ width: 120, height: 80, backgroundColor: '#22c55e', borderRadius: 40 }, [
              text({
                text: 'Pill',
                font: '600 14px Inter',
                lineHeight: 20,
                color: '#fff',
                marginLeft: 12,
                marginTop: 12,
              }),
            ]),
            box({
              width: 120,
              height: 80,
              borderRadius: 12,
              gradient: {
                type: 'linear',
                angle: 90,
                stops: [
                  { offset: 0, color: '#f59e0b' },
                  { offset: 1, color: '#e94560' },
                ],
              },
            }, [
              text({
                text: 'Sunset',
                font: '600 14px Inter',
                lineHeight: 20,
                color: '#fff',
                marginLeft: 12,
                marginTop: 12,
              }),
            ]),
          ],
        ),
        box(
          {
            marginTop: 24,
            padding: 16,
            backgroundColor: '#18181b',
            borderRadius: 8,
            flexDirection: 'column',
            gap: 8,
          },
          [
            text({
              text: 'Pipeline details',
              font: '600 14px Inter',
              lineHeight: 20,
              color: '#fafafa',
            }),
            text({
              text: '• Flat boxes: vertex-colored triangles with alpha blending',
              font: '400 13px Inter',
              lineHeight: 18,
              color: '#a1a1aa',
            }),
            text({
              text: '• Shapes: SDF fragment shader for rounded corners + linear gradients',
              font: '400 13px Inter',
              lineHeight: 18,
              color: '#a1a1aa',
            }),
            text({
              text: '• Text: offscreen canvas atlas → GPU texture → sampled quad',
              font: '400 13px Inter',
              lineHeight: 18,
              color: '#a1a1aa',
            }),
            text({
              text: '• Images: per-image texture cache, async load via img.decode()',
              font: '400 13px Inter',
              lineHeight: 18,
              color: '#a1a1aa',
            }),
          ],
        ),
      ],
    )

  await createApp(view, renderer, { width: 800, waitForFonts: true })
}

main()

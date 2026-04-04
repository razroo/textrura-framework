import { signal, box, text, createApp, type AppOptions } from '@geometra/core'
import { CanvasRenderer } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: '#0f172a' })
const clicks = signal(0)

function readLayoutSize(): { width: number; height: number } {
  const w = canvas.clientWidth || window.innerWidth
  const h = canvas.clientHeight || window.innerHeight
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) }
}

const layoutOpts: AppOptions = readLayoutSize()

const app = await createApp(
  () =>
    box(
      {
        padding: 20,
        gap: 10,
        flexDirection: 'column',
        width: layoutOpts.width,
        height: layoutOpts.height,
      },
      [
        text({ text: 'Canvas starter', font: 'bold 18px Inter', lineHeight: 24, color: '#f8fafc' }),
        box(
          {
            backgroundColor: '#2563eb',
            padding: 10,
            borderRadius: 8,
            onClick: () => clicks.set(clicks.peek() + 1),
          },
          [text({ text: `Clicks: ${clicks.value}`, font: '14px Inter', lineHeight: 18, color: '#fff' })],
        ),
      ],
    ),
  renderer,
  layoutOpts,
)

window.addEventListener('resize', () => {
  const next = readLayoutSize()
  layoutOpts.width = next.width
  layoutOpts.height = next.height
  app.update()
})

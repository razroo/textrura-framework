import { signal, box, text, createApp } from '@geometra/core'
import { CanvasRenderer } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: '#0f172a' })
const clicks = signal(0)

await createApp(
  () =>
    box({ padding: 20, gap: 10, flexDirection: 'column' }, [
      text({ text: 'Canvas starter', font: 'bold 18px Inter', lineHeight: 24, color: '#f8fafc' }),
      box({ backgroundColor: '#2563eb', padding: 10, borderRadius: 8, onClick: () => clicks.set(clicks.peek() + 1) }, [
        text({ text: `Clicks: ${clicks.value}`, font: '14px Inter', lineHeight: 18, color: '#fff' }),
      ]),
    ]),
  renderer,
  { width: 480, height: 260 },
)

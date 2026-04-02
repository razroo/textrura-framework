import { createClient } from '@geometra/client'
import { CanvasRenderer } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: '#0b1320' })

canvas.width = window.innerWidth
canvas.height = window.innerHeight

createClient({
  url: 'ws://localhost:3300',
  renderer,
  canvas,
  binaryFraming: true,
})

canvas.addEventListener('pointerdown', () => {
  canvas.focus()
})

canvas.focus()

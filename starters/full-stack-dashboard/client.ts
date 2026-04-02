import { createClient } from '@geometra/client'
import { CanvasRenderer, enableSelection } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: '#0b1320' })
const disableSelection = enableSelection(canvas, renderer)

canvas.width = window.innerWidth
canvas.height = window.innerHeight

const client = createClient({
  url: 'ws://localhost:3300',
  renderer,
  canvas,
  binaryFraming: true,
})

canvas.addEventListener('pointerdown', () => {
  canvas.focus()
})

canvas.focus()

window.addEventListener('beforeunload', () => {
  disableSelection()
  client.close()
})

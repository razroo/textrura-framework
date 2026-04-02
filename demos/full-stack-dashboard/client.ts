import { createClient } from '@geometra/client'
import { CanvasRenderer } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement

const renderer = new CanvasRenderer({
  canvas,
  background: '#08111f',
})

canvas.width = window.innerWidth
canvas.height = window.innerHeight

const client = createClient({
  url: 'ws://localhost:3200',
  renderer,
  canvas,
  binaryFraming: true,
  onError: (error) => {
    console.error('Geometra full-stack dashboard client error:', error)
  },
})

canvas.addEventListener('pointerdown', () => {
  canvas.focus()
})

canvas.focus()

window.addEventListener('beforeunload', () => {
  client.close()
})

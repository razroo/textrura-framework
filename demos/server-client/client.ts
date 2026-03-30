import { CanvasRenderer } from '@textura/renderer-canvas'
import { createClient } from '@textura/client'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: '#1a1a2e' })

const client = createClient({
  url: 'ws://localhost:3100',
  renderer,
  canvas,
})

console.log('Textura thin client connected — waiting for server frames...')

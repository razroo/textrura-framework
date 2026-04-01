import { CanvasRenderer } from '@geometra/renderer-canvas'
import { createClient } from '@geometra/client'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: '#1a1a2e' })

createClient({
  url: 'ws://localhost:3100',
  renderer,
  canvas,
})

console.log('Textura thin client connected — waiting for server frames...')

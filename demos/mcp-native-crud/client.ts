import { CanvasRenderer } from '@geometra/renderer-canvas'
import { createClient } from '@geometra/client'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: '#0f172a' })

createClient({
  url: 'ws://localhost:3100',
  renderer,
  canvas,
})

console.log('MCP Native CRUD client connected — waiting for server frames...')

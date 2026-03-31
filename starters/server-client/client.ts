import { createClient } from '@geometra/client'
import { CanvasRenderer } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: '#111827' })

createClient({
  url: 'ws://localhost:8080',
  renderer,
})

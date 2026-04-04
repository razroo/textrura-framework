import { createBrowserCanvasClient } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement

createBrowserCanvasClient({
  url: 'ws://localhost:8080',
  canvas,
  autoFocus: true,
  rendererOptions: {
    background: '#111827',
  },
})

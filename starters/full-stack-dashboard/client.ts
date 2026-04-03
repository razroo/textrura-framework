import { createBrowserCanvasClient } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement

createBrowserCanvasClient({
  url: 'ws://localhost:3300',
  canvas,
  binaryFraming: true,
  autoFocus: true,
  rendererOptions: {
    background: '#0b1320',
  },
})

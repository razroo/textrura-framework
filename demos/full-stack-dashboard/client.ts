import { createBrowserCanvasClient } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement
const wsUrl =
  (
    import.meta as ImportMeta & {
      env?: { VITE_GEOMETRA_WS_URL?: string }
    }
  ).env?.VITE_GEOMETRA_WS_URL ?? 'ws://localhost:3200'

createBrowserCanvasClient({
  canvas,
  url: wsUrl,
  binaryFraming: true,
  autoFocus: true,
  rendererOptions: {
    background: '#08111f',
  },
  onError: (error) => {
    console.error('Geometra full-stack dashboard client error:', error)
  },
})

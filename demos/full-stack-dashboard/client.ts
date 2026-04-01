import { createClient } from '@geometra/client'
import { CanvasRenderer } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement

const renderer = new CanvasRenderer({
  canvas,
  background: '#08111f',
})

const statusEl = document.getElementById('status') as HTMLSpanElement
const encodingEl = document.getElementById('encoding') as HTMLSpanElement
const messageTypeEl = document.getElementById('message-type') as HTMLSpanElement
const bytesEl = document.getElementById('bytes') as HTMLSpanElement
const decodeMsEl = document.getElementById('decode-ms') as HTMLSpanElement
const applyMsEl = document.getElementById('apply-ms') as HTMLSpanElement
const renderMsEl = document.getElementById('render-ms') as HTMLSpanElement
const patchCountEl = document.getElementById('patch-count') as HTMLSpanElement

function formatMs(value: number): string {
  return `${value.toFixed(1)} ms`
}

function formatCount(value: number | undefined): string {
  if (value === undefined) return '-'
  return String(value)
}

const client = createClient({
  url: 'ws://localhost:3200',
  renderer,
  canvas,
  binaryFraming: true,
  onError: (error) => {
    const message = error instanceof Error ? error.message : String(error)
    statusEl.textContent = `Error: ${message}`
  },
  onFrameMetrics: (metrics) => {
    statusEl.textContent = 'Connected'
    encodingEl.textContent = metrics.encoding ?? 'json'
    messageTypeEl.textContent = metrics.messageType
    bytesEl.textContent = formatCount(metrics.bytesReceived)
    decodeMsEl.textContent = formatMs(metrics.decodeMs)
    applyMsEl.textContent = formatMs(metrics.applyMs)
    renderMsEl.textContent = formatMs(metrics.renderMs)
    patchCountEl.textContent = formatCount(metrics.patchCount)
  },
})

canvas.addEventListener('pointerdown', () => {
  canvas.focus()
})

canvas.focus()

window.addEventListener('beforeunload', () => {
  client.close()
})

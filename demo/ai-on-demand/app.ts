import { createApp } from '@geometra/core'
import { CanvasRenderer } from '@geometra/renderer-canvas'
import { templates } from './templates.js'
import { codeSamples } from './code-samples.js'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: '#111118' })

let currentPrompt = 'dashboard'

function view() {
  return templates[currentPrompt]!()
}

function estimateTokens(code: string): number {
  return Math.ceil(code.length / 4)
}

function updateCodePanels(prompt: string) {
  const sample = codeSamples[prompt]!
  const geoEl = document.getElementById('code-geometra')!
  const htmlEl = document.getElementById('code-html')!
  geoEl.textContent = sample.geometra
  htmlEl.textContent = sample.html

  const geoTokens = estimateTokens(sample.geometra)
  const htmlTokens = estimateTokens(sample.html)
  const savings = Math.round((1 - geoTokens / htmlTokens) * 100)

  const geoLines = sample.geometra.split('\n').length
  const htmlLines = sample.html.split('\n').length

  document.getElementById('stat-geo')!.textContent = String(geoTokens)
  document.getElementById('stat-html')!.textContent = String(htmlTokens)
  document.getElementById('stat-savings')!.textContent = `${savings}%`
  document.getElementById('geo-lines')!.textContent = `${geoLines} lines`
  document.getElementById('html-lines')!.textContent = `${htmlLines} lines`
}

function typewriterCode(element: HTMLElement, code: string, charsPerFrame = 8) {
  let i = 0
  element.textContent = ''
  function tick() {
    if (i < code.length) {
      i += charsPerFrame
      element.textContent = code.slice(0, i)
      requestAnimationFrame(tick)
    } else {
      element.textContent = code
    }
  }
  requestAnimationFrame(tick)
}

function animateCodePanels(prompt: string) {
  const sample = codeSamples[prompt]!
  const geoEl = document.getElementById('code-geometra')!
  const htmlEl = document.getElementById('code-html')!

  typewriterCode(geoEl, sample.geometra, 12)
  typewriterCode(htmlEl, sample.html, 12)

  const geoTokens = estimateTokens(sample.geometra)
  const htmlTokens = estimateTokens(sample.html)
  const savings = Math.round((1 - geoTokens / htmlTokens) * 100)
  const geoLines = sample.geometra.split('\n').length
  const htmlLines = sample.html.split('\n').length

  document.getElementById('stat-geo')!.textContent = String(geoTokens)
  document.getElementById('stat-html')!.textContent = String(htmlTokens)
  document.getElementById('stat-savings')!.textContent = `${savings}%`
  document.getElementById('geo-lines')!.textContent = `${geoLines} lines`
  document.getElementById('html-lines')!.textContent = `${htmlLines} lines`
}

createApp(view, renderer, { width: 940, height: 520 }).then((app) => {
  updateCodePanels(currentPrompt)

  const buttons = document.querySelectorAll<HTMLButtonElement>('.prompt-btn')
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt!
      if (prompt === currentPrompt) return

      buttons.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')

      currentPrompt = prompt
      app.update()
      animateCodePanels(prompt)
    })
  })
})

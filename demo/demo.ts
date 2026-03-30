import { signal, box, text, createApp, toSemanticHTML } from '@geometra/core'
import type { App, UIElement } from '@geometra/core'
import { CanvasRenderer, enableSelection } from '@geometra/renderer-canvas'

// --- DOM refs ---
const canvas = document.getElementById('demo-canvas') as HTMLCanvasElement
const scenarioSelect = document.getElementById('scenario') as HTMLSelectElement
const widthSlider = document.getElementById('width-slider') as HTMLInputElement
const widthVal = document.getElementById('width-val') as HTMLElement
const perfTime = document.getElementById('perf-time') as HTMLElement
const perfNodes = document.getElementById('perf-nodes') as HTMLElement
const btnRow = document.getElementById('btn-row') as HTMLButtonElement
const btnCol = document.getElementById('btn-col') as HTMLButtonElement
const installCmd = document.getElementById('install-cmd') as HTMLElement

// --- SEO demo refs ---
const seoOutput = document.getElementById('seo-output') as HTMLElement

// --- State ---
const scenario = signal<string>('cards')
const rootWidth = signal(600)
const direction = signal<'row' | 'column'>('row')

// --- Scenarios ---
const COLORS = ['#e94560', '#0f3460', '#533483', '#0ea5e9', '#22c55e', '#f59e0b']

function cardGrid(): UIElement {
  const cards = []
  for (let i = 0; i < 6; i++) {
    cards.push(
      box(
        {
          backgroundColor: COLORS[i]!,
          borderRadius: 8,
          padding: 16,
          flexGrow: 1,
          flexShrink: 1,
          minWidth: 100,
          minHeight: 70,
          flexDirection: 'column',
          gap: 6,
        },
        [
          text({ text: `Card ${i + 1}`, font: 'bold 15px Inter', lineHeight: 20, color: '#ffffff' }),
          text({ text: 'DOM-free rendering via Yoga WASM', font: '11px Inter', lineHeight: 15, color: 'rgba(255,255,255,0.7)' }),
        ],
      ),
    )
  }
  return box(
    { flexDirection: 'column', padding: 24, gap: 16, width: rootWidth.value, height: 400 },
    [
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
        text({ text: 'Geometra', font: 'bold 18px Inter', lineHeight: 24, color: '#ffffff' }),
        text({ text: `${rootWidth.value}px \u00b7 ${direction.value}`, font: '13px Inter', lineHeight: 18, color: '#71717a' }),
      ]),
      box({ flexDirection: direction.value, flexWrap: 'wrap', gap: 12, flexGrow: 1 }, cards),
      text({ text: 'Computed geometry rendered to Canvas2D. No DOM involved.', font: '11px Inter', lineHeight: 15, color: '#52525b' }),
    ],
  )
}

function chatMessages(): UIElement {
  const msgs = [
    { sender: 'Agent', text: 'Layout computed in 0.2ms via Yoga WASM.' },
    { sender: 'User', text: 'How does text measurement work without a DOM?' },
    { sender: 'Agent', text: 'Pretext uses OffscreenCanvas for sub-pixel text metrics. Supports CJK, Arabic, emoji \u2014 the works.' },
    { sender: 'User', text: 'And the client is really just a paint loop?' },
    { sender: 'Agent', text: 'The server computes layout and streams { x, y, width, height } over WebSocket. Client just paints pre-computed coordinates.' },
  ]
  return box(
    { flexDirection: 'column', padding: 20, gap: 10, width: rootWidth.value, height: 400 },
    [
      box({ backgroundColor: '#18181b', padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between' }, [
        text({ text: 'AI Chat', font: 'bold 15px Inter', lineHeight: 20, color: '#e94560' }),
        text({ text: '5 messages', font: '12px Inter', lineHeight: 16, color: '#71717a' }),
      ]),
      box(
        { flexDirection: 'column', gap: 8, flexGrow: 1 },
        msgs.map(m =>
          box(
            {
              backgroundColor: m.sender === 'Agent' ? '#0f3460' : '#27272a',
              padding: 12,
              borderRadius: 8,
              flexShrink: 0,
              alignSelf: m.sender === 'Agent' ? 'flex-start' : 'flex-end',
              maxWidth: rootWidth.value * 0.75,
            },
            [
              text({ text: m.sender, font: 'bold 11px Inter', lineHeight: 14, color: '#71717a' }),
              text({ text: m.text, font: '13px Inter', lineHeight: 18, color: '#ffffff' }),
            ],
          ),
        ),
      ),
    ],
  )
}

function dashboard(): UIElement {
  const stats = [
    { label: 'Layout Time', value: '<1ms', color: '#22c55e' },
    { label: 'DOM Calls', value: '0', color: '#e94560' },
    { label: 'Client Size', value: '~2KB', color: '#0ea5e9' },
    { label: 'Render Targets', value: '3', color: '#f59e0b' },
  ]
  return box(
    { flexDirection: 'column', padding: 24, gap: 16, width: rootWidth.value, height: 400 },
    [
      text({ text: 'Performance Dashboard', font: 'bold 18px Inter', lineHeight: 24, color: '#ffffff' }),
      box(
        { flexDirection: direction.value, flexWrap: 'wrap', gap: 12 },
        stats.map(s =>
          box(
            {
              backgroundColor: '#18181b',
              borderColor: '#3f3f46',
              border: 1,
              borderRadius: 10,
              padding: 20,
              flexGrow: 1,
              minWidth: 120,
              flexDirection: 'column',
              gap: 4,
            },
            [
              text({ text: s.value, font: 'bold 28px Inter', lineHeight: 34, color: s.color }),
              text({ text: s.label, font: '12px Inter', lineHeight: 16, color: '#71717a' }),
            ],
          ),
        ),
      ),
      box({ backgroundColor: '#18181b', borderRadius: 8, padding: 16, flexGrow: 1, flexDirection: 'column', gap: 8 }, [
        text({ text: 'Architecture', font: 'bold 14px Inter', lineHeight: 18, color: '#ffffff' }),
        text({ text: 'Tree  \u2192  Yoga WASM  \u2192  Geometry  \u2192  Canvas / Terminal / WebSocket', font: '13px JetBrains Mono', lineHeight: 20, color: '#a1a1aa' }),
        text({ text: 'The entire browser rendering pipeline \u2014 replaced.', font: '12px Inter', lineHeight: 16, color: '#52525b' }),
      ]),
    ],
  )
}

function nestedLayout(): UIElement {
  function nestBox(depth: number): UIElement {
    if (depth === 0) {
      return text({ text: 'Leaf', font: '12px Inter', lineHeight: 16, color: '#fff' })
    }
    const color = COLORS[depth % COLORS.length]!
    return box(
      {
        backgroundColor: color,
        borderRadius: 6,
        padding: 10,
        flexDirection: depth % 2 === 0 ? 'row' : 'column',
        gap: 8,
        flexGrow: 1,
      },
      [nestBox(depth - 1), nestBox(depth - 1)],
    )
  }
  return box(
    { flexDirection: 'column', padding: 24, gap: 16, width: rootWidth.value, height: 400 },
    [
      box({ flexDirection: 'row', justifyContent: 'space-between' }, [
        text({ text: 'Nested Flexbox (5 levels deep)', font: 'bold 16px Inter', lineHeight: 22, color: '#ffffff' }),
        text({ text: `${Math.pow(2, 5)} leaf nodes`, font: '12px Inter', lineHeight: 16, color: '#71717a' }),
      ]),
      box({ flexGrow: 1 }, [nestBox(5)]),
    ],
  )
}

function selectableText(): UIElement {
  return box(
    { flexDirection: 'column', padding: 24, gap: 16, width: rootWidth.value, height: 400 },
    [
      text({ text: 'Text Selection', font: 'bold 18px Inter', lineHeight: 24, color: '#ffffff' }),
      text({
        text: 'Click and drag to select this text. It is rendered entirely on Canvas \u2014 no DOM text nodes exist. The selection highlight and character-level hit testing are computed from geometry.',
        font: '14px Inter',
        lineHeight: 22,
        color: '#e2e8f0',
        selectable: true,
      }),
      box({ backgroundColor: '#18181b', borderRadius: 8, padding: 16, flexDirection: 'column', gap: 10 }, [
        text({
          text: 'Geometra computes character positions using ctx.measureText() during each render pass. When you click, it hit-tests against these positions to find the exact character under your cursor.',
          font: '13px Inter',
          lineHeight: 20,
          color: '#a1a1aa',
          selectable: true,
        }),
        text({
          text: 'Press Cmd+C (or Ctrl+C) to copy selected text to your clipboard. This works exactly like native text selection, but without a single DOM node.',
          font: '13px Inter',
          lineHeight: 20,
          color: '#a1a1aa',
          selectable: true,
        }),
      ]),
      box({ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, [
        box({ backgroundColor: '#0f3460', borderRadius: 8, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4 }, [
          text({ text: 'How it works', font: 'bold 13px Inter', lineHeight: 18, color: '#60a5fa', selectable: true }),
          text({ text: 'Character offsets are measured with Canvas2D measureText() and cached per text node per frame.', font: '12px Inter', lineHeight: 17, color: '#93c5fd', selectable: true }),
        ]),
        box({ backgroundColor: '#1e3a2f', borderRadius: 8, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4 }, [
          text({ text: 'Cross-node selection', font: 'bold 13px Inter', lineHeight: 18, color: '#4ade80', selectable: true }),
          text({ text: 'Drag across multiple text elements. The selection range spans nodes in document order.', font: '12px Inter', lineHeight: 17, color: '#86efac', selectable: true }),
        ]),
      ]),
      text({
        text: 'Tip: the cursor changes to a text cursor (I-beam) when hovering over selectable text.',
        font: '11px Inter',
        lineHeight: 15,
        color: '#52525b',
        selectable: true,
      }),
    ],
  )
}

function seoDemo(): UIElement {
  return box(
    {
      flexDirection: 'column', padding: 24, gap: 16, width: rootWidth.value, height: 400,
      semantic: { tag: 'main' },
    },
    [
      text({
        text: 'SEO & Semantic HTML',
        font: 'bold 22px Inter', lineHeight: 28, color: '#ffffff',
        semantic: { tag: 'h1' },
      }),
      text({
        text: 'Geometra can generate semantic HTML from the same element tree that renders to Canvas. Serve HTML to crawlers, Canvas to users.',
        font: '14px Inter', lineHeight: 22, color: '#e2e8f0',
        semantic: { tag: 'p' },
      }),
      box({
        backgroundColor: '#18181b', borderRadius: 8, padding: 16, flexDirection: 'column', gap: 10,
        semantic: { tag: 'article' },
      }, [
        text({
          text: 'How it works',
          font: 'bold 15px Inter', lineHeight: 20, color: '#60a5fa',
          semantic: { tag: 'h2' },
        }),
        text({
          text: 'Each element can carry a semantic property with tag, role, and alt hints. The toSemanticHTML() function walks the tree and produces valid HTML with proper heading hierarchy, ARIA roles, and Open Graph metadata.',
          font: '13px Inter', lineHeight: 20, color: '#a1a1aa',
          semantic: { tag: 'p' },
        }),
      ]),
      box({
        flexDirection: direction.value, gap: 12, flexWrap: 'wrap',
        semantic: { tag: 'nav', role: 'navigation' },
      }, [
        box({
          backgroundColor: '#0f3460', borderRadius: 8, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4,
          semantic: { tag: 'section' },
        }, [
          text({ text: 'Crawler-friendly', font: 'bold 13px Inter', lineHeight: 18, color: '#60a5fa', semantic: { tag: 'h3' } }),
          text({ text: 'Detect Googlebot via user-agent and serve the HTML version. Real users get Canvas.', font: '12px Inter', lineHeight: 17, color: '#93c5fd', semantic: { tag: 'p' } }),
        ]),
        box({
          backgroundColor: '#1e3a2f', borderRadius: 8, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4,
          semantic: { tag: 'section' },
        }, [
          text({ text: 'Open Graph', font: 'bold 13px Inter', lineHeight: 18, color: '#4ade80', semantic: { tag: 'h3' } }),
          text({ text: 'Pass og:title, og:description, og:image for rich social media previews.', font: '12px Inter', lineHeight: 17, color: '#86efac', semantic: { tag: 'p' } }),
        ]),
      ]),
    ],
  )
}

const SCENARIOS: Record<string, () => UIElement> = {
  cards: cardGrid,
  chat: chatMessages,
  dashboard: dashboard,
  nested: nestedLayout,
  selection: selectableText,
  seo: seoDemo,
}

// --- Count nodes ---
function countNodes(el: UIElement): number {
  if (el.kind === 'text') return 1
  return 1 + el.children.reduce((sum, c) => sum + countNodes(c), 0)
}

// --- View ---
function view(): UIElement {
  const fn = SCENARIOS[scenario.value] ?? cardGrid
  return fn()
}

// --- Mount ---
const renderer = new CanvasRenderer({ canvas, background: '#1a1a2e' })
let app: App | null = null
let cleanupSelection: (() => void) | null = null

async function mount() {
  if (app) app.destroy()
  app = await createApp(view, renderer, { width: rootWidth.value, height: 400 })

  // Enable text selection on the canvas
  if (cleanupSelection) cleanupSelection()
  cleanupSelection = enableSelection(canvas, renderer, () => {
    if (app) app.update()
  })

  // Measure perf
  updatePerf()
}

function updatePerf() {
  const start = performance.now()
  if (app) app.update()
  const elapsed = performance.now() - start
  perfTime.textContent = `${elapsed.toFixed(2)}ms`

  const tree = view()
  perfNodes.textContent = `${countNodes(tree)}`

  // Update SEO output if on the SEO scenario
  updateSeoOutput()
}

function updateSeoOutput() {
  if (!seoOutput) return
  if (scenario.value === 'seo') {
    const tree = seoDemo()
    const html = toSemanticHTML(tree, {
      title: 'Geometra \u2014 The Singularity Frontend Framework',
      description: 'DOM-free rendering via Yoga WASM. The same geometry protocol powers humans and AI agents.',
      canonical: 'https://geometra.dev',
      og: {
        title: 'Geometra',
        description: 'The client is the server. The server is the client.',
        type: 'website',
        url: 'https://geometra.dev',
      },
    })
    seoOutput.textContent = html
    seoOutput.parentElement!.style.display = 'block'
  } else {
    seoOutput.parentElement!.style.display = 'none'
  }
}

// --- Controls ---
scenarioSelect.addEventListener('change', () => {
  scenario.set(scenarioSelect.value)
  // Clear selection when switching scenarios
  renderer.selection = null
  updatePerf()
})

widthSlider.addEventListener('input', () => {
  const w = parseInt(widthSlider.value)
  widthVal.textContent = `${w}`
  rootWidth.set(w)
  updatePerf()
})

btnRow.addEventListener('click', () => {
  direction.set('row')
  btnRow.classList.add('active')
  btnCol.classList.remove('active')
  updatePerf()
})

btnCol.addEventListener('click', () => {
  direction.set('column')
  btnCol.classList.add('active')
  btnRow.classList.remove('active')
  updatePerf()
})

installCmd.addEventListener('click', () => {
  navigator.clipboard.writeText('npm i @geometra/core @geometra/renderer-canvas')
  installCmd.querySelector('span')!.textContent = '\u2713'
  setTimeout(() => { installCmd.querySelector('span')!.textContent = '\uD83D\uDCCB' }, 1500)
})

// --- Code tabs ---
document.querySelectorAll('.code-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = (tab as HTMLElement).dataset['tab']!
    document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.code-block').forEach(b => (b as HTMLElement).classList.remove('active'))
    tab.classList.add('active')
    document.querySelector(`.code-block[data-tab="${target}"]`)!.classList.add('active')
  })
})

// --- Forward canvas clicks ---
canvas.addEventListener('click', (e) => {
  if (!app) return
  const rect = canvas.getBoundingClientRect()
  app.dispatch('onClick', e.clientX - rect.left, e.clientY - rect.top)
})

// --- Init ---
mount()

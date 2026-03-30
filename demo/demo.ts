import { signal, box, text, createApp, toSemanticHTML } from '@geometra/core'
import type { App, UIElement } from '@geometra/core'
import { CanvasRenderer, enableSelection } from '@geometra/renderer-canvas'

// ─── Colors ──────────────────────────────────────────────────────────────────
const BG = '#09090b'
const SURFACE = '#18181b'
const SURFACE2 = '#27272a'
const BORDER = '#3f3f46'
const TEXT_COLOR = '#fafafa'
const MUTED = '#a1a1aa'
const DIM = '#52525b'
const ACCENT = '#e94560'
const ACCENT2 = '#0ea5e9'
const ACCENT3 = '#22c55e'
const ACCENT4 = '#f59e0b'
const CODE_BG = '#1e1e2e'
const CARD_COLORS = [ACCENT, '#0f3460', '#533483', ACCENT2, ACCENT3, ACCENT4]

// ─── State ───────────────────────────────────────────────────────────────────
const vw = signal(window.innerWidth)
const scenario = signal('cards')
const rootWidth = signal(600)
const direction = signal<'row' | 'column'>('row')
const codeTab = signal('basic')
const copied = signal(false)
let lastPerfTime = '-'
let lastPerfNodes = '-'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function countNodes(el: UIElement): number {
  if (el.kind === 'text') return 1
  return 1 + el.children.reduce((sum, c) => sum + countNodes(c), 0)
}

function btn(
  label: string,
  active: boolean,
  handler: () => void,
): UIElement {
  return box(
    {
      backgroundColor: active ? 'rgba(233,69,96,0.15)' : SURFACE,
      borderColor: active ? ACCENT : BORDER,
      borderRadius: 6,
      paddingTop: 6, paddingBottom: 6, paddingLeft: 12, paddingRight: 12,
      onClick: handler,
    },
    [text({ text: label, font: '13px Inter', lineHeight: 18, color: active ? ACCENT : TEXT_COLOR })],
  )
}

// ─── Scenarios ───────────────────────────────────────────────────────────────
function cardGrid(): UIElement {
  const w = rootWidth.value
  const cards = []
  for (let i = 0; i < 6; i++) {
    cards.push(
      box(
        {
          backgroundColor: CARD_COLORS[i]!,
          borderRadius: 8, padding: 16,
          flexGrow: 1, flexShrink: 1, minWidth: 100, minHeight: 70,
          flexDirection: 'column', gap: 6,
        },
        [
          text({ text: `Card ${i + 1}`, font: 'bold 15px Inter', lineHeight: 20, color: '#ffffff' }),
          text({ text: 'DOM-free via Yoga WASM', font: '11px Inter', lineHeight: 15, color: 'rgba(255,255,255,0.7)' }),
        ],
      ),
    )
  }
  return box({ flexDirection: 'column', padding: 24, gap: 16, width: w, minHeight: 400 }, [
    box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
      text({ text: 'Geometra', font: 'bold 18px Inter', lineHeight: 24, color: '#ffffff' }),
      text({ text: `${w}px \u00b7 ${direction.value}`, font: '13px Inter', lineHeight: 18, color: '#71717a' }),
    ]),
    box({ flexDirection: direction.value, flexWrap: 'wrap', gap: 12, flexGrow: 1 }, cards),
    text({ text: 'Computed geometry rendered to Canvas2D. No DOM.', font: '11px Inter', lineHeight: 15, color: DIM }),
  ])
}

function chatMessages(): UIElement {
  const w = rootWidth.value
  const msgs = [
    { sender: 'Agent', msg: 'Layout computed in 0.2ms via Yoga WASM.' },
    { sender: 'User', msg: 'How does text measurement work without a DOM?' },
    { sender: 'Agent', msg: 'Pretext uses OffscreenCanvas for sub-pixel text metrics.' },
    { sender: 'User', msg: 'And the client is really just a paint loop?' },
    { sender: 'Agent', msg: 'Server streams { x, y, w, h } over WebSocket. Client just paints.' },
  ]
  return box({ flexDirection: 'column', padding: 20, gap: 10, width: w, minHeight: 400 }, [
    box({ backgroundColor: SURFACE, padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between' }, [
      text({ text: 'AI Chat', font: 'bold 15px Inter', lineHeight: 20, color: ACCENT }),
      text({ text: '5 messages', font: '12px Inter', lineHeight: 16, color: '#71717a' }),
    ]),
    box({ flexDirection: 'column', gap: 8, flexGrow: 1 },
      msgs.map(m =>
        box({
          backgroundColor: m.sender === 'Agent' ? '#0f3460' : SURFACE2,
          padding: 12, borderRadius: 8, flexShrink: 0,
          alignSelf: m.sender === 'Agent' ? 'flex-start' : 'flex-end',
          maxWidth: w * 0.75,
        }, [
          text({ text: m.sender, font: 'bold 11px Inter', lineHeight: 14, color: '#71717a' }),
          text({ text: m.msg, font: '13px Inter', lineHeight: 18, color: '#ffffff' }),
        ]),
      ),
    ),
  ])
}

function dashboard(): UIElement {
  const w = rootWidth.value
  const stats = [
    { label: 'Layout Time', value: '<1ms', color: ACCENT3 },
    { label: 'DOM Calls', value: '0', color: ACCENT },
    { label: 'Client Size', value: '~2KB', color: ACCENT2 },
    { label: 'Render Targets', value: '3', color: ACCENT4 },
  ]
  return box({ flexDirection: 'column', padding: 24, gap: 16, width: w, minHeight: 400 }, [
    text({ text: 'Performance Dashboard', font: 'bold 18px Inter', lineHeight: 24, color: '#ffffff' }),
    box({ flexDirection: direction.value, flexWrap: 'wrap', gap: 12 },
      stats.map(s =>
        box({
          backgroundColor: SURFACE, borderColor: BORDER,
          borderRadius: 10, padding: 20,
          flexGrow: 1, minWidth: 120, flexDirection: 'column', gap: 4,
        }, [
          text({ text: s.value, font: 'bold 28px Inter', lineHeight: 34, color: s.color }),
          text({ text: s.label, font: '12px Inter', lineHeight: 16, color: '#71717a' }),
        ]),
      ),
    ),
    box({ backgroundColor: SURFACE, borderRadius: 8, padding: 16, flexGrow: 1, flexDirection: 'column', gap: 8 }, [
      text({ text: 'Architecture', font: 'bold 14px Inter', lineHeight: 18, color: '#ffffff' }),
      text({ text: 'Tree \u2192 Yoga WASM \u2192 Geometry \u2192 Canvas / Terminal / WebSocket', font: '13px JetBrains Mono', lineHeight: 20, color: MUTED }),
    ]),
  ])
}

function nestedLayout(): UIElement {
  const w = rootWidth.value
  function nestBox(depth: number): UIElement {
    if (depth === 0) return text({ text: 'Leaf', font: '12px Inter', lineHeight: 16, color: '#fff' })
    return box({
      backgroundColor: CARD_COLORS[depth % CARD_COLORS.length]!,
      borderRadius: 6, padding: 10,
      flexDirection: depth % 2 === 0 ? 'row' : 'column',
      gap: 8, flexGrow: 1,
    }, [nestBox(depth - 1), nestBox(depth - 1)])
  }
  return box({ flexDirection: 'column', padding: 24, gap: 16, width: w, minHeight: 400 }, [
    box({ flexDirection: 'row', justifyContent: 'space-between' }, [
      text({ text: 'Nested Flexbox (5 levels)', font: 'bold 16px Inter', lineHeight: 22, color: '#ffffff' }),
      text({ text: '32 leaf nodes', font: '12px Inter', lineHeight: 16, color: '#71717a' }),
    ]),
    box({ flexGrow: 1 }, [nestBox(5)]),
  ])
}

function selectableText(): UIElement {
  const w = rootWidth.value
  return box({ flexDirection: 'column', padding: 24, gap: 14, width: w, minHeight: 400 }, [
    text({ text: 'Text Selection', font: 'bold 18px Inter', lineHeight: 24, color: '#ffffff' }),
    text({
      text: 'Click and drag to select this text. No DOM text nodes \u2014 just Canvas.',
      font: '14px Inter', lineHeight: 22, color: '#e2e8f0', selectable: true,
    }),
    box({ backgroundColor: SURFACE, borderRadius: 8, padding: 16, flexDirection: 'column', gap: 8 }, [
      text({
        text: 'Character positions are measured with ctx.measureText() each frame. Click to hit-test the exact character.',
        font: '13px Inter', lineHeight: 20, color: MUTED, selectable: true,
      }),
      text({
        text: 'Press Cmd+C / Ctrl+C to copy. Works like native selection.',
        font: '13px Inter', lineHeight: 20, color: MUTED, selectable: true,
      }),
    ]),
    box({ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, [
      box({ backgroundColor: '#0f3460', borderRadius: 8, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4 }, [
        text({ text: 'How it works', font: 'bold 13px Inter', lineHeight: 18, color: '#60a5fa', selectable: true }),
        text({ text: 'Canvas2D measureText() computes character offsets per text node per frame.', font: '12px Inter', lineHeight: 17, color: '#93c5fd', selectable: true }),
      ]),
      box({ backgroundColor: '#1e3a2f', borderRadius: 8, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4 }, [
        text({ text: 'Cross-node selection', font: 'bold 13px Inter', lineHeight: 18, color: '#4ade80', selectable: true }),
        text({ text: 'Drag across multiple text elements to select across nodes.', font: '12px Inter', lineHeight: 17, color: '#86efac', selectable: true }),
      ]),
    ]),
    text({
      text: 'Tip: cursor changes to I-beam over selectable text.',
      font: '11px Inter', lineHeight: 15, color: DIM, selectable: true,
    }),
  ])
}

function seoDemo(): UIElement {
  const w = rootWidth.value
  return box({
    flexDirection: 'column', padding: 24, gap: 16, width: w, minHeight: 400,
    semantic: { tag: 'main' },
  }, [
    text({ text: 'SEO & Semantic HTML', font: 'bold 22px Inter', lineHeight: 28, color: '#ffffff', semantic: { tag: 'h1' } }),
    text({
      text: 'Generate semantic HTML from the same element tree. Serve HTML to crawlers, Canvas to users.',
      font: '14px Inter', lineHeight: 22, color: '#e2e8f0', semantic: { tag: 'p' },
    }),
    box({ backgroundColor: SURFACE, borderRadius: 8, padding: 16, flexDirection: 'column', gap: 10, semantic: { tag: 'article' } }, [
      text({ text: 'How it works', font: 'bold 15px Inter', lineHeight: 20, color: '#60a5fa', semantic: { tag: 'h2' } }),
      text({
        text: 'Elements carry semantic hints (tag, role, alt). toSemanticHTML() produces valid HTML with ARIA roles and Open Graph metadata.',
        font: '13px Inter', lineHeight: 20, color: MUTED, semantic: { tag: 'p' },
      }),
    ]),
    box({ flexDirection: direction.value, gap: 12, flexWrap: 'wrap', semantic: { tag: 'nav', role: 'navigation' } }, [
      box({ backgroundColor: '#0f3460', borderRadius: 8, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4, semantic: { tag: 'section' } }, [
        text({ text: 'Crawler-friendly', font: 'bold 13px Inter', lineHeight: 18, color: '#60a5fa', semantic: { tag: 'h3' } }),
        text({ text: 'Detect Googlebot via user-agent. Serve HTML to bots, Canvas to users.', font: '12px Inter', lineHeight: 17, color: '#93c5fd', semantic: { tag: 'p' } }),
      ]),
      box({ backgroundColor: '#1e3a2f', borderRadius: 8, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4, semantic: { tag: 'section' } }, [
        text({ text: 'Open Graph', font: 'bold 13px Inter', lineHeight: 18, color: '#4ade80', semantic: { tag: 'h3' } }),
        text({ text: 'og:title, og:description, og:image for rich social previews.', font: '12px Inter', lineHeight: 17, color: '#86efac', semantic: { tag: 'p' } }),
      ]),
    ]),
  ])
}

const SCENARIOS: Record<string, () => UIElement> = {
  cards: cardGrid,
  chat: chatMessages,
  dashboard,
  nested: nestedLayout,
  selection: selectableText,
  seo: seoDemo,
}

// ─── Code Examples ───────────────────────────────────────────────────────────
const CODE: Record<string, string> = {
  basic: `import { box, text, createApp } from '@geometra/core'
import { CanvasRenderer } from '@geometra/renderer-canvas'

const renderer = new CanvasRenderer({ canvas, background: '#1a1a2e' })

function view() {
  return box({ flexDirection: 'column', padding: 24, gap: 16 }, [
    text({ text: 'Hello Geometra', font: 'bold 24px Inter',
           lineHeight: 32, color: '#fff' }),
    box({ backgroundColor: '#e94560', padding: 12, borderRadius: 8 }, [
      text({ text: 'No DOM. Just pixels.', font: '14px Inter',
             lineHeight: 20, color: '#fff' }),
    ]),
  ])
}

await createApp(view, renderer, { width: 400, height: 300 })`,

  reactive: `import { signal, box, text, createApp } from '@geometra/core'

const count = signal(0)

function view() {
  return box({ padding: 24, gap: 16 }, [
    text({ text: \`Count: \${count.value}\`,
           font: 'bold 32px Inter', lineHeight: 40, color: '#fff' }),
    box({
      backgroundColor: '#e94560', padding: 16, borderRadius: 8,
      onClick: () => count.set(count.peek() + 1),
    }, [
      text({ text: 'Click me', font: '16px Inter',
             lineHeight: 22, color: '#fff' }),
    ]),
  ])
}
// Signals auto-trigger re-layout + re-render
await createApp(view, renderer, { width: 400, height: 300 })`,

  server: `// server.ts — runs in Node.js, no browser
import { signal, box, text } from '@geometra/core/node'
import { createServer } from '@geometra/server'

const data = signal(['Live from the server'])
const server = await createServer(view, { port: 3100 })

// client.ts — ~2KB, just a paint loop
import { CanvasRenderer } from '@geometra/renderer-canvas'
import { createClient } from '@geometra/client'

createClient({
  url: 'ws://localhost:3100',
  renderer: new CanvasRenderer({ canvas }),
  canvas,
})
// Client receives { x, y, w, h } over WebSocket
// No layout engine runs here. Zero compute. Just paint.`,

  selection: `import { box, text, createApp } from '@geometra/core'
import { CanvasRenderer, enableSelection } from '@geometra/renderer-canvas'

function view() {
  return box({ padding: 24, gap: 16 }, [
    text({
      text: 'Select this text on Canvas!',
      font: '18px Inter', lineHeight: 24, color: '#fff',
      selectable: true,  // enables character-level hit testing
    }),
  ])
}

const renderer = new CanvasRenderer({ canvas })
const app = await createApp(view, renderer, { width: 400, height: 200 })

// Attach selection handlers (pointerdown/move/up + Cmd+C)
enableSelection(canvas, renderer, () => app.update())`,

  seo: `import { box, text, toSemanticHTML } from '@geometra/core'

const tree = box({ padding: 24, semantic: { tag: 'main' } }, [
  text({
    text: 'My App', font: 'bold 28px Inter', lineHeight: 34,
    semantic: { tag: 'h1' },
  }),
  text({
    text: 'DOM-free rendering for humans and AI.',
    font: '16px Inter', lineHeight: 22,
    semantic: { tag: 'p' },
  }),
])

const html = toSemanticHTML(tree, {
  title: 'My App',
  description: 'DOM-free rendering for humans and AI.',
  og: { title: 'My App', type: 'website' },
})
// Serve html to Googlebot, Canvas to real users`,
}

// ─── Page Sections ───────────────────────────────────────────────────────────
function heroSection(contentWidth: number): UIElement {
  return box({ flexDirection: 'column', alignItems: 'center', paddingTop: 80, paddingBottom: 48, paddingLeft: 24, paddingRight: 24, gap: 24, width: contentWidth }, [
    // Badge
    box({ borderColor: ACCENT, borderRadius: 999, paddingLeft: 14, paddingRight: 14, paddingTop: 4, paddingBottom: 4 }, [
      text({ text: 'THE SINGULARITY FRONTEND FRAMEWORK', font: '500 12px Inter', lineHeight: 16, color: ACCENT }),
    ]),
    // Title
    text({ text: 'The client is the server.', font: 'bold 44px Inter', lineHeight: 50, color: TEXT_COLOR }),
    text({ text: 'The server is the client.', font: 'bold 44px Inter', lineHeight: 50, color: ACCENT }),
    // Subtitle
    text({ text: 'Geometra dissolves the boundary between client and server. Human and AI interaction is native to both sides.', font: '16px Inter', lineHeight: 24, color: MUTED }),
    // Install command
    box({
      backgroundColor: CODE_BG, borderColor: BORDER, borderRadius: 8,
      paddingTop: 12, paddingBottom: 12, paddingLeft: 20, paddingRight: 20,
      flexDirection: 'row', alignItems: 'center', gap: 12,
      onClick: () => {
        navigator.clipboard.writeText('npm i @geometra/core @geometra/renderer-canvas')
        copied.set(true)
        setTimeout(() => copied.set(false), 1500)
      },
    }, [
      text({ text: 'npm i @geometra/core @geometra/renderer-canvas', font: '14px JetBrains Mono', lineHeight: 20, color: TEXT_COLOR }),
      text({ text: copied.value ? '\u2713' : 'Copy', font: '12px Inter', lineHeight: 16, color: copied.value ? ACCENT3 : MUTED }),
    ]),
  ])
}

function pipelineSection(contentWidth: number): UIElement {
  function step(label: string, isOld: boolean): UIElement {
    return box({
      backgroundColor: isOld ? SURFACE : ACCENT,
      borderRadius: 6,
      paddingTop: 8, paddingBottom: 8, paddingLeft: 16, paddingRight: 16,
      opacity: isOld ? 0.5 : 1,
    }, [
      text({ text: label, font: '500 13px JetBrains Mono', lineHeight: 18, color: isOld ? MUTED : '#fff' }),
    ])
  }
  function arrow(): UIElement {
    return text({ text: '\u2192', font: '18px Inter', lineHeight: 22, color: MUTED })
  }
  return box({ flexDirection: 'column', alignItems: 'center', paddingBottom: 64, paddingLeft: 24, paddingRight: 24, gap: 8, width: contentWidth }, [
    box({ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center' }, [
      step('HTML', true), arrow(), step('CSS Parser', true), arrow(), step('DOM', true), arrow(), step('Layout', true), arrow(), step('Paint', true),
    ]),
    box({ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center' }, [
      step('Tree', false), arrow(), step('Yoga WASM', false), arrow(), step('Geometry', false), arrow(), step('Pixels', false),
    ]),
  ])
}

function demoSection(contentWidth: number): UIElement {
  const scenarioNames = [
    { key: 'cards', label: 'Cards' },
    { key: 'chat', label: 'Chat' },
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'nested', label: 'Nested' },
    { key: 'selection', label: 'Selection' },
    { key: 'seo', label: 'SEO' },
  ]
  const scenarioFn = SCENARIOS[scenario.value] ?? cardGrid
  const demoTree = scenarioFn()

  return box({ flexDirection: 'column', paddingBottom: 64, paddingLeft: 24, paddingRight: 24, gap: 16, width: contentWidth }, [
    text({ text: 'Live Demo', font: 'bold 28px Inter', lineHeight: 34, color: TEXT_COLOR }),
    text({ text: 'Interactive \u2014 everything below is rendered to Canvas, not DOM.', font: '15px Inter', lineHeight: 22, color: MUTED }),
    // Controls
    box({ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, [
      text({ text: 'Scenario', font: '500 13px Inter', lineHeight: 18, color: MUTED }),
      ...scenarioNames.map(s => btn(s.label, scenario.value === s.key, () => {
        scenario.set(s.key)
        renderer.selection = null
        measurePerf()
      })),
      box({ width: 16 }, []),
      text({ text: 'Width', font: '500 13px Inter', lineHeight: 18, color: MUTED }),
      btn('\u2212', false, () => { rootWidth.set(Math.max(300, rootWidth.peek() - 50)); measurePerf() }),
      text({ text: `${rootWidth.value}`, font: '13px JetBrains Mono', lineHeight: 18, color: ACCENT }),
      btn('+', false, () => { rootWidth.set(Math.min(800, rootWidth.peek() + 50)); measurePerf() }),
      box({ width: 16 }, []),
      text({ text: 'Direction', font: '500 13px Inter', lineHeight: 18, color: MUTED }),
      btn('Row', direction.value === 'row', () => { direction.set('row'); measurePerf() }),
      btn('Column', direction.value === 'column', () => { direction.set('column'); measurePerf() }),
    ]),
    // Demo canvas area
    box({
      backgroundColor: SURFACE, borderColor: BORDER, borderRadius: 12,
      padding: 24, alignItems: 'center',
    }, [
      box({ backgroundColor: '#1a1a2e', borderRadius: 8 }, [demoTree]),
    ]),
    // Perf
    box({ flexDirection: 'row', gap: 8, justifyContent: 'center' }, [
      text({ text: 'Layout:', font: '12px JetBrains Mono', lineHeight: 16, color: MUTED }),
      text({ text: lastPerfTime, font: '12px JetBrains Mono', lineHeight: 16, color: ACCENT3 }),
      text({ text: '|', font: '12px JetBrains Mono', lineHeight: 16, color: MUTED }),
      text({ text: 'Nodes:', font: '12px JetBrains Mono', lineHeight: 16, color: MUTED }),
      text({ text: lastPerfNodes, font: '12px JetBrains Mono', lineHeight: 16, color: ACCENT3 }),
    ]),
    // SEO output (only shown for SEO scenario)
    ...(scenario.value === 'seo' ? [seoOutputSection(contentWidth)] : []),
  ])
}

function seoOutputSection(_contentWidth: number): UIElement {
  const tree = seoDemo()
  const html = toSemanticHTML(tree, {
    title: 'Geometra \u2014 The Singularity Frontend Framework',
    description: 'DOM-free rendering via Yoga WASM.',
    canonical: 'https://geometra.dev',
    og: { title: 'Geometra', description: 'The client is the server.', type: 'website', url: 'https://geometra.dev' },
  })
  return box({ flexDirection: 'column', gap: 8 }, [
    text({ text: 'Generated Semantic HTML (for crawlers)', font: '500 15px Inter', lineHeight: 20, color: MUTED }),
    box({ backgroundColor: CODE_BG, borderColor: BORDER, borderRadius: 8, padding: 16 }, [
      text({ text: html, font: '12px JetBrains Mono', lineHeight: 18, color: MUTED, whiteSpace: 'pre-wrap' }),
    ]),
  ])
}

function archSection(contentWidth: number): UIElement {
  const packages = [
    { name: '@geometra/core', badge: 'Core', badgeBg: 'rgba(233,69,96,0.2)', badgeColor: ACCENT, desc: 'Signals, box()/text(), hit-testing, text selection, SEO, createApp().' },
    { name: '@geometra/renderer-canvas', badge: 'Render', badgeBg: 'rgba(14,165,233,0.2)', badgeColor: ACCENT2, desc: 'Canvas2D paint backend. Backgrounds, borders, text wrapping, HiDPI.' },
    { name: '@geometra/renderer-terminal', badge: 'Render', badgeBg: 'rgba(14,165,233,0.2)', badgeColor: ACCENT2, desc: 'ANSI terminal renderer. Box-drawing, 256-color, TUI apps.' },
    { name: '@geometra/server', badge: 'Network', badgeBg: 'rgba(34,197,94,0.2)', badgeColor: ACCENT3, desc: 'Server-side layout. Diffs frames, streams patches over WebSocket.' },
    { name: '@geometra/client', badge: 'Network', badgeBg: 'rgba(34,197,94,0.2)', badgeColor: ACCENT3, desc: 'Thin client (~2KB). Receives geometry, paints. Zero layout cost.' },
  ]
  return box({ flexDirection: 'column', paddingBottom: 64, paddingLeft: 24, paddingRight: 24, gap: 24, width: contentWidth }, [
    text({ text: 'Packages', font: 'bold 28px Inter', lineHeight: 34, color: TEXT_COLOR }),
    box({ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, packages.map(pkg =>
      box({ backgroundColor: SURFACE, borderColor: BORDER, borderRadius: 10, padding: 20, flexDirection: 'column', gap: 8, minWidth: 240, flexGrow: 1, flexBasis: 0 }, [
        box({ flexDirection: 'row', gap: 8, alignItems: 'center' }, [
          text({ text: pkg.name, font: 'bold 14px Inter', lineHeight: 18, color: TEXT_COLOR }),
          box({ backgroundColor: pkg.badgeBg, borderRadius: 999, paddingLeft: 8, paddingRight: 8, paddingTop: 2, paddingBottom: 2 }, [
            text({ text: pkg.badge, font: 'bold 10px Inter', lineHeight: 14, color: pkg.badgeColor }),
          ]),
        ]),
        text({ text: pkg.desc, font: '13px Inter', lineHeight: 19, color: MUTED }),
      ]),
    )),
  ])
}

function codeSection(contentWidth: number): UIElement {
  const tabs = ['basic', 'reactive', 'server', 'selection', 'seo']
  const tabLabels: Record<string, string> = { basic: 'Basic', reactive: 'Reactive', server: 'Server', selection: 'Selection', seo: 'SEO' }

  return box({ flexDirection: 'column', paddingBottom: 64, paddingLeft: 24, paddingRight: 24, gap: 0, width: contentWidth }, [
    text({ text: 'Singularity in action \u2014 one protocol, every target', font: 'bold 28px Inter', lineHeight: 34, color: TEXT_COLOR }),
    box({ height: 24 }, []),
    // Tabs
    box({ flexDirection: 'row', gap: 4 }, tabs.map(t =>
      box({
        backgroundColor: codeTab.value === t ? CODE_BG : SURFACE,
        borderColor: BORDER, borderRadius: 0,
        paddingTop: 8, paddingBottom: 8, paddingLeft: 16, paddingRight: 16,
        onClick: () => codeTab.set(t),
      }, [
        text({ text: tabLabels[t]!, font: '13px Inter', lineHeight: 18, color: codeTab.value === t ? TEXT_COLOR : MUTED }),
      ]),
    )),
    // Code block
    box({ backgroundColor: CODE_BG, borderColor: BORDER, borderRadius: 0, padding: 20 }, [
      text({ text: CODE[codeTab.value] ?? '', font: '13px JetBrains Mono', lineHeight: 20, color: MUTED, whiteSpace: 'pre-wrap' }),
    ]),
  ])
}

function footerSection(contentWidth: number): UIElement {
  return box({
    borderColor: BORDER, paddingTop: 48, paddingBottom: 48,
    paddingLeft: 24, paddingRight: 24,
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    width: contentWidth, alignItems: 'center',
  }, [
    box({ onClick: () => window.open('https://github.com/razroo/geometra', '_blank') }, [
      text({ text: 'GitHub', font: '14px Inter', lineHeight: 20, color: ACCENT }),
    ]),
    text({ text: '\u00b7', font: '14px Inter', lineHeight: 20, color: MUTED }),
    box({ onClick: () => window.open('https://www.npmjs.com/org/geometra', '_blank') }, [
      text({ text: 'npm', font: '14px Inter', lineHeight: 20, color: ACCENT }),
    ]),
    text({ text: '\u00b7', font: '14px Inter', lineHeight: 20, color: MUTED }),
    text({ text: 'Built on ', font: '14px Inter', lineHeight: 20, color: MUTED }),
    box({ onClick: () => window.open('https://github.com/razroo/textura', '_blank') }, [
      text({ text: 'Textura', font: '14px Inter', lineHeight: 20, color: ACCENT }),
    ]),
  ])
}

// ─── Main View ───────────────────────────────────────────────────────────────
function view(): UIElement {
  const viewportWidth = vw.value
  const contentWidth = Math.min(viewportWidth, 1100)

  return box({ flexDirection: 'column', alignItems: 'center', width: viewportWidth, backgroundColor: BG }, [
    heroSection(contentWidth),
    pipelineSection(contentWidth),
    demoSection(contentWidth),
    archSection(contentWidth),
    codeSection(contentWidth),
    footerSection(contentWidth),
  ])
}

// ─── Mount ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: BG })
let app: App | null = null
let cleanupSelection: (() => void) | null = null

async function mount() {
  if (cleanupSelection) { cleanupSelection(); cleanupSelection = null }
  if (app) app.destroy()
  app = await createApp(view, renderer, { width: vw.peek() })

  cleanupSelection = enableSelection(canvas, renderer, () => {
    if (app) app.update()
  })

  measurePerf()
}

function measurePerf() {
  const tree = (SCENARIOS[scenario.peek()] ?? cardGrid)()
  lastPerfNodes = `${countNodes(tree)}`

  const start = performance.now()
  if (app) app.update()
  lastPerfTime = `${(performance.now() - start).toFixed(2)}ms`
  if (app) app.update() // re-render to display perf values
}

// ─── Resize ──────────────────────────────────────────────────────────────────
let resizeTimer: ReturnType<typeof setTimeout>
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    vw.set(window.innerWidth)
    mount()
  }, 100)
})

// ─── Click forwarding ────────────────────────────────────────────────────────
canvas.addEventListener('click', (e) => {
  if (!app) return
  const rect = canvas.getBoundingClientRect()
  app.dispatch('onClick', e.clientX - rect.left, e.clientY - rect.top)
})

// ─── Init ────────────────────────────────────────────────────────────────────
mount()

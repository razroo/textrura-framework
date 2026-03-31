import {
  signal,
  box,
  text,
  createApp,
  toSemanticHTML,
} from '@geometra/core'
import type { App, UIElement } from '@geometra/core'
import { CanvasRenderer, enableSelection, enableAccessibilityMirror, enableInputForwarding } from '@geometra/renderer-canvas'
import {
  button as uiButton,
  input as uiInput,
  list as uiList,
  dialog as uiDialog,
} from '@geometra/ui'

// ─── Design Tokens ───────────────────────────────────────────────────────────
const BG = '#09090b'
const SURFACE = '#18181b'
const SURFACE2 = '#27272a'
const BORDER = '#3f3f46'
const TEXT_COLOR = '#fafafa'
const MUTED = '#a1a1aa'
const DIM = '#71717a'
const ACCENT = '#e94560'
const ACCENT2 = '#0ea5e9'
const ACCENT3 = '#22c55e'
const ACCENT4 = '#f59e0b'
const CODE_BG = '#131320'
const GLOW = 'rgba(233,69,96,0.18)'
const CARD_COLORS = [ACCENT, '#0f3460', '#533483', ACCENT2, ACCENT3, ACCENT4]

// ─── State ───────────────────────────────────────────────────────────────────
const vw = signal(window.innerWidth)
const scenario = signal('cards')
const rootWidth = signal(600)
const direction = signal<'row' | 'column'>('row')
const codeTab = signal('basic')
const copied = signal(false)
type DemoInputField = { value: string; caretOffset: number }
const inputName = signal<DemoInputField>({ value: '', caretOffset: 0 })
const inputEmail = signal<DemoInputField>({ value: '', caretOffset: 0 })
const inputSearch = signal<DemoInputField>({ value: '', caretOffset: 0 })
const activeDemoInput = signal<'name' | 'email' | 'search' | null>(null)
let lastPerfTime = '-'
let lastPerfNodes = '-'

// ─── Layout Helpers ──────────────────────────────────────────────────────────
function countNodes(el: UIElement): number {
  if (el.kind === 'text') return 1
  return 1 + el.children.reduce((sum, c) => sum + countNodes(c), 0)
}

/** Horizontal centering via row + justifyContent (Yoga workaround). */
function center(...children: UIElement[]): UIElement {
  return box({ flexDirection: 'row', justifyContent: 'center' }, children)
}

/** Spacer element. */
function spacer(h: number): UIElement {
  return box({ height: h }, [])
}

/** Styled button. */
function btn(label: string, active: boolean, handler: () => void): UIElement {
  return box({
    backgroundColor: active ? 'rgba(233,69,96,0.15)' : SURFACE,
    borderColor: active ? ACCENT : BORDER,
    borderWidth: active ? 1 : 1,
    borderRadius: 8,
    paddingTop: 7, paddingBottom: 7, paddingLeft: 14, paddingRight: 14,
    cursor: 'pointer',
    onClick: handler,
  }, [text({
    text: label,
    font: active ? '600 13px Inter' : '13px Inter',
    lineHeight: 18,
    color: active ? ACCENT : TEXT_COLOR,
  })])
}

/** Section wrapper with consistent spacing. */
function section(children: UIElement[], opts: { paddingBottom?: number } = {}): UIElement {
  return box({ flexDirection: 'column', paddingBottom: opts.paddingBottom ?? 80, gap: 24 }, children)
}

/** Section heading. */
function heading(title: string, subtitle?: string): UIElement[] {
  const els: UIElement[] = [
    text({ text: title, font: 'bold 32px Inter', lineHeight: 40, color: TEXT_COLOR }),
  ]
  if (subtitle) {
    els.push(text({ text: subtitle, font: '15px Inter', lineHeight: 22, color: MUTED }))
  }
  return els
}

// ─── Scenarios ───────────────────────────────────────────────────────────────
function cardGrid(): UIElement {
  const w = rootWidth.value
  const cards = []
  for (let i = 0; i < 6; i++) {
    cards.push(box({
      backgroundColor: CARD_COLORS[i]!, borderRadius: 10, padding: 16,
      flexGrow: 1, flexShrink: 1, minWidth: 100, minHeight: 70,
      flexDirection: 'column', gap: 6,
      boxShadow: { offsetX: 0, offsetY: 4, blur: 12, color: 'rgba(0,0,0,0.3)' },
    }, [
      text({ text: `Card ${i + 1}`, font: 'bold 15px Inter', lineHeight: 20, color: '#ffffff' }),
      text({ text: 'DOM-free via Yoga WASM', font: '11px Inter', lineHeight: 15, color: 'rgba(255,255,255,0.7)' }),
    ]))
  }
  return box({ flexDirection: 'column', padding: 24, gap: 16, width: w, minHeight: 380 }, [
    box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
      text({ text: 'Geometra', font: 'bold 18px Inter', lineHeight: 24, color: '#ffffff' }),
      text({ text: `${w}px \u00b7 ${direction.value}`, font: '13px JetBrains Mono', lineHeight: 18, color: DIM }),
    ]),
    box({ flexDirection: direction.value, flexWrap: 'wrap', gap: 12, flexGrow: 1 }, cards),
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
  return box({ flexDirection: 'column', padding: 20, gap: 10, width: w, minHeight: 380 }, [
    box({ backgroundColor: SURFACE, padding: 12, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between' }, [
      text({ text: 'AI Chat', font: 'bold 15px Inter', lineHeight: 20, color: ACCENT }),
      text({ text: '5 messages', font: '12px Inter', lineHeight: 16, color: DIM }),
    ]),
    box({ flexDirection: 'column', gap: 8, flexGrow: 1 },
      msgs.map(m => box({
        backgroundColor: m.sender === 'Agent' ? '#0f3460' : SURFACE2,
        padding: 12, borderRadius: 10, flexShrink: 0,
        alignSelf: m.sender === 'Agent' ? 'flex-start' : 'flex-end',
        maxWidth: w * 0.75,
        boxShadow: { offsetX: 0, offsetY: 2, blur: 6, color: 'rgba(0,0,0,0.2)' },
      }, [
        text({ text: m.sender, font: 'bold 11px Inter', lineHeight: 14, color: DIM }),
        text({ text: m.msg, font: '13px Inter', lineHeight: 18, color: '#ffffff' }),
      ])),
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
  return box({ flexDirection: 'column', padding: 24, gap: 16, width: w, minHeight: 380 }, [
    text({ text: 'Performance Dashboard', font: 'bold 18px Inter', lineHeight: 24, color: '#ffffff' }),
    box({ flexDirection: direction.value, flexWrap: 'wrap', gap: 12 },
      stats.map(s => box({
        backgroundColor: SURFACE, borderColor: BORDER,
        borderRadius: 12, padding: 20,
        flexGrow: 1, minWidth: 120, flexDirection: 'column', gap: 4,
      }, [
        text({ text: s.value, font: 'bold 28px Inter', lineHeight: 34, color: s.color }),
        text({ text: s.label, font: '12px Inter', lineHeight: 16, color: DIM }),
      ])),
    ),
    box({
      borderRadius: 10, padding: 16, flexGrow: 1, flexDirection: 'column', gap: 8,
      gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#1a1a2e' }, { offset: 1, color: '#16213e' }] },
    }, [
      text({ text: 'Architecture', font: 'bold 14px Inter', lineHeight: 18, color: '#ffffff' }),
      text({ text: 'Tree \u2192 Yoga WASM \u2192 Geometry \u2192 Canvas / Terminal / WS', font: '13px JetBrains Mono', lineHeight: 20, color: MUTED }),
    ]),
  ])
}

function nestedLayout(): UIElement {
  const w = rootWidth.value
  function nestBox(depth: number): UIElement {
    if (depth === 0) return text({ text: 'Leaf', font: '12px Inter', lineHeight: 16, color: '#fff' })
    return box({
      backgroundColor: CARD_COLORS[depth % CARD_COLORS.length]!,
      borderRadius: 8, padding: 10,
      flexDirection: depth % 2 === 0 ? 'row' : 'column', gap: 8, flexGrow: 1,
    }, [nestBox(depth - 1), nestBox(depth - 1)])
  }
  return box({ flexDirection: 'column', padding: 24, gap: 16, width: w, minHeight: 380 }, [
    box({ flexDirection: 'row', justifyContent: 'space-between' }, [
      text({ text: 'Nested Flexbox (5 levels)', font: 'bold 16px Inter', lineHeight: 22, color: '#ffffff' }),
      text({ text: '32 leaf nodes', font: '12px JetBrains Mono', lineHeight: 16, color: DIM }),
    ]),
    box({ flexGrow: 1 }, [nestBox(5)]),
  ])
}

function selectableText(): UIElement {
  const w = rootWidth.value
  return box({ flexDirection: 'column', padding: 24, gap: 14, width: w, minHeight: 380 }, [
    text({ text: 'Text Selection', font: 'bold 18px Inter', lineHeight: 24, color: '#ffffff' }),
    text({ text: 'Click and drag to select. No DOM \u2014 just Canvas.', font: '14px Inter', lineHeight: 22, color: '#e2e8f0' }),
    box({ backgroundColor: SURFACE, borderRadius: 10, padding: 16, flexDirection: 'column', gap: 8 }, [
      text({ text: 'Character positions measured with ctx.measureText() each frame.', font: '13px Inter', lineHeight: 20, color: MUTED }),
      text({ text: 'Press Cmd+C / Ctrl+C to copy selected text.', font: '13px Inter', lineHeight: 20, color: MUTED }),
    ]),
    box({ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, [
      box({ backgroundColor: '#0f3460', borderRadius: 10, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4 }, [
        text({ text: 'How it works', font: 'bold 13px Inter', lineHeight: 18, color: '#60a5fa' }),
        text({ text: 'measureText() computes char offsets per node per frame.', font: '12px Inter', lineHeight: 17, color: '#93c5fd' }),
      ]),
      box({ backgroundColor: '#1e3a2f', borderRadius: 10, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4 }, [
        text({ text: 'Cross-node selection', font: 'bold 13px Inter', lineHeight: 18, color: '#4ade80' }),
        text({ text: 'Drag across multiple text elements.', font: '12px Inter', lineHeight: 17, color: '#86efac' }),
      ]),
    ]),
  ])
}

function textInputDemo(): UIElement {
  const w = rootWidth.value

  function applyInputKey(current: DemoInputField, key: string): DemoInputField {
    if (key === 'ArrowLeft') {
      return { value: current.value, caretOffset: Math.max(0, current.caretOffset - 1) }
    }
    if (key === 'ArrowRight') {
      return { value: current.value, caretOffset: Math.min(current.value.length, current.caretOffset + 1) }
    }
    if (key === 'Home') {
      return { value: current.value, caretOffset: 0 }
    }
    if (key === 'End') {
      return { value: current.value, caretOffset: current.value.length }
    }
    if (key === 'Backspace') {
      if (current.caretOffset <= 0) return current
      const left = current.value.slice(0, current.caretOffset - 1)
      const right = current.value.slice(current.caretOffset)
      return { value: left + right, caretOffset: current.caretOffset - 1 }
    }
    if (key === 'Delete') {
      if (current.caretOffset >= current.value.length) return current
      const left = current.value.slice(0, current.caretOffset)
      const right = current.value.slice(current.caretOffset + 1)
      return { value: left + right, caretOffset: current.caretOffset }
    }
    if (key.length === 1) {
      const left = current.value.slice(0, current.caretOffset)
      const right = current.value.slice(current.caretOffset)
      return { value: left + key + right, caretOffset: current.caretOffset + 1 }
    }
    return current
  }

  function inputNode(
    field: 'name' | 'email' | 'search',
    state: DemoInputField,
    placeholder: string,
    setState: (next: DemoInputField) => void,
  ): UIElement {
    return uiInput(state.value, placeholder, {
      focused: activeDemoInput.value === field,
      caretOffset: state.caretOffset,
      onClick: () => activeDemoInput.set(field),
      onCaretOffsetChange: (offset) => {
        setState({ value: state.value, caretOffset: offset })
      },
      onKeyDown: (e) => {
        const next = applyInputKey(state, e.key)
        if (next !== state) setState(next)
      },
      onCompositionEnd: (e) => {
        if (!e.data) return
        const left = state.value.slice(0, state.caretOffset)
        const right = state.value.slice(state.caretOffset)
        setState({
          value: left + e.data + right,
          caretOffset: state.caretOffset + e.data.length,
        })
      },
    })
  }

  return box({ flexDirection: 'column', padding: 24, gap: 14, width: w, minHeight: 380 }, [
    text({ text: 'Text Input (@geometra/ui)', font: 'bold 18px Inter', lineHeight: 24, color: '#ffffff' }),
    text({ text: 'Marketing demo now uses shared UI primitives. Advanced text-input behavior lives in demos/text-input-canvas and core tests.', font: '14px Inter', lineHeight: 22, color: '#e2e8f0' }),
    box({
      backgroundColor: SURFACE,
      borderColor: BORDER,
      borderRadius: 10,
      padding: 14,
      minHeight: 150,
      flexDirection: 'column',
      gap: 10,
    }, [
      inputNode('name', inputName.value, 'Name', (next) => inputName.set(next)),
      inputNode('email', inputEmail.value, 'Email', (next) => inputEmail.set(next)),
      inputNode('search', inputSearch.value, 'Search components', (next) => inputSearch.set(next)),
    ]),
    box({ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, [
      box({ backgroundColor: '#0f3460', borderRadius: 10, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4 }, [
        text({ text: 'Core contract', font: 'bold 13px Inter', lineHeight: 18, color: '#60a5fa' }),
        text({ text: 'Input behavior validated in @geometra/core tests.', font: '12px Inter', lineHeight: 17, color: '#93c5fd' }),
      ]),
      box({ backgroundColor: '#1e3a2f', borderRadius: 10, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4 }, [
        text({ text: 'Deep playground', font: 'bold 13px Inter', lineHeight: 18, color: '#4ade80' }),
        text({ text: 'Use demos/text-input-canvas for IME, history, and caret movement.', font: '12px Inter', lineHeight: 17, color: '#86efac' }),
      ]),
      box({ backgroundColor: '#3b1b52', borderRadius: 10, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4 }, [
        text({ text: 'Shared primitives', font: 'bold 13px Inter', lineHeight: 18, color: '#e9d5ff' }),
        text({ text: '@geometra/ui starter components used directly here.', font: '12px Inter', lineHeight: 17, color: '#f3e8ff' }),
      ]),
    ]),
  ])
}

function seoDemo(): UIElement {
  const w = rootWidth.value
  return box({ flexDirection: 'column', padding: 24, gap: 16, width: w, minHeight: 380, semantic: { tag: 'main' } }, [
    text({ text: 'SEO & Semantic HTML', font: 'bold 22px Inter', lineHeight: 28, color: '#ffffff', semantic: { tag: 'h1' } }),
    text({ text: 'Same element tree generates HTML for crawlers and Canvas for users.', font: '14px Inter', lineHeight: 22, color: '#e2e8f0', semantic: { tag: 'p' } }),
    box({ backgroundColor: SURFACE, borderRadius: 10, padding: 16, flexDirection: 'column', gap: 10, semantic: { tag: 'article' } }, [
      text({ text: 'How it works', font: 'bold 15px Inter', lineHeight: 20, color: '#60a5fa', semantic: { tag: 'h2' } }),
      text({ text: 'Elements carry semantic hints. toSemanticHTML() produces valid HTML with ARIA and Open Graph.', font: '13px Inter', lineHeight: 20, color: MUTED, semantic: { tag: 'p' } }),
    ]),
    box({ flexDirection: direction.value, gap: 12, flexWrap: 'wrap', semantic: { tag: 'nav' } }, [
      box({ backgroundColor: '#0f3460', borderRadius: 10, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4 }, [
        text({ text: 'Crawler-friendly', font: 'bold 13px Inter', lineHeight: 18, color: '#60a5fa' }),
        text({ text: 'Serve HTML to bots, Canvas to users.', font: '12px Inter', lineHeight: 17, color: '#93c5fd' }),
      ]),
      box({ backgroundColor: '#1e3a2f', borderRadius: 10, padding: 14, flexGrow: 1, flexDirection: 'column', gap: 4 }, [
        text({ text: 'Open Graph', font: 'bold 13px Inter', lineHeight: 18, color: '#4ade80' }),
        text({ text: 'og:title, og:description for social previews.', font: '12px Inter', lineHeight: 17, color: '#86efac' }),
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
  input: textInputDemo,
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
// Client receives geometry over WebSocket. Just paint.`,

  selection: `import { box, text, createApp } from '@geometra/core'
import { CanvasRenderer, enableSelection } from '@geometra/renderer-canvas'

function view() {
  return box({ padding: 24 }, [
    text({
      text: 'All text is selectable by default!',
      font: '18px Inter', lineHeight: 24, color: '#fff',
    }),
  ])
}

const renderer = new CanvasRenderer({ canvas })
const app = await createApp(view, renderer, { width: 400 })

enableSelection(canvas, renderer, () => app.update())`,

  seo: `import { box, text, toSemanticHTML } from '@geometra/core'

const tree = box({ semantic: { tag: 'main' } }, [
  text({ text: 'My App', font: 'bold 28px Inter',
         lineHeight: 34, semantic: { tag: 'h1' } }),
  text({ text: 'DOM-free rendering.',
         font: '16px Inter', lineHeight: 22,
         semantic: { tag: 'p' } }),
])

const html = toSemanticHTML(tree, {
  title: 'My App',
  og: { title: 'My App', type: 'website' },
})
// Serve html to crawlers, Canvas to users`,
}

// ─── Page Sections ───────────────────────────────────────────────────────────

function heroSection(): UIElement {
  const titleSize = vw.value > 980 ? 56 : vw.value > 760 ? 48 : 38
  const titleLine = vw.value > 980 ? 64 : vw.value > 760 ? 56 : 46

  return box({ flexDirection: 'column', paddingTop: 96, paddingBottom: 64, gap: 20 }, [
    center(
      box({
        gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#e94560' }, { offset: 1, color: '#0ea5e9' }] },
        borderRadius: 20,
        paddingLeft: 16, paddingRight: 16, paddingTop: 5, paddingBottom: 5,
      }, [
        text({ text: 'THE SINGULARITY FRONTEND FRAMEWORK', font: '600 11px Inter', lineHeight: 15, color: '#ffffff' }),
      ]),
    ),
    spacer(8),
    center(text({ text: 'The client is the server.', font: `bold ${titleSize}px Inter`, lineHeight: titleLine, color: TEXT_COLOR })),
    center(text({ text: 'The server is the client.', font: `bold ${titleSize}px Inter`, lineHeight: titleLine, color: ACCENT })),
    spacer(4),
    center(text({
      text: 'Geometra replaces the entire browser rendering pipeline. One JSON geometry protocol powers Canvas, Terminal, and AI agents.',
      font: '17px Inter', lineHeight: 26, color: MUTED,
    })),
    spacer(12),
    center(
      box({
        backgroundColor: CODE_BG,
        borderColor: BORDER,
        borderRadius: 10,
        paddingTop: 14, paddingBottom: 14, paddingLeft: 24, paddingRight: 24,
        flexDirection: 'row', gap: 16,
        cursor: 'pointer',
        boxShadow: { offsetX: 0, offsetY: 8, blur: 28, color: GLOW },
        onClick: () => {
          navigator.clipboard.writeText('npm i @geometra/core @geometra/renderer-canvas')
          copied.set(true)
          setTimeout(() => copied.set(false), 1500)
        },
      }, [
        text({ text: '$ npm i @geometra/core @geometra/renderer-canvas', font: '14px JetBrains Mono', lineHeight: 20, color: TEXT_COLOR }),
        text({ text: copied.value ? '\u2713 Copied' : 'Copy', font: '600 12px Inter', lineHeight: 20, color: copied.value ? ACCENT3 : DIM }),
      ]),
    ),
    center(
      box({ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }, [
        box({ backgroundColor: 'rgba(14,165,233,0.12)', borderRadius: 999, paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4 }, [
          text({ text: 'Yoga WASM layout', font: '600 11px Inter', lineHeight: 14, color: '#67e8f9' }),
        ]),
        box({ backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 999, paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4 }, [
          text({ text: 'Pretext metrics', font: '600 11px Inter', lineHeight: 14, color: '#86efac' }),
        ]),
        box({ backgroundColor: 'rgba(233,69,96,0.12)', borderRadius: 999, paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4 }, [
          text({ text: 'Canvas + Terminal + WS', font: '600 11px Inter', lineHeight: 14, color: '#fda4af' }),
        ]),
      ]),
    ),
  ])
}

function pipelineSection(): UIElement {
  function step(label: string, isOld: boolean): UIElement {
    return box({
      backgroundColor: isOld ? SURFACE : undefined,
      gradient: isOld ? undefined : { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#e94560' }, { offset: 1, color: '#c94560' }] },
      borderRadius: 8,
      paddingTop: 10, paddingBottom: 10, paddingLeft: 18, paddingRight: 18,
      opacity: isOld ? 0.4 : 1,
    }, [text({ text: label, font: '500 13px JetBrains Mono', lineHeight: 18, color: isOld ? MUTED : '#fff' })])
  }
  const arrow = () => text({ text: '\u2192', font: '20px Inter', lineHeight: 38, color: DIM })

  return box({ flexDirection: 'column', paddingBottom: 80, gap: 12 }, [
    center(
      box({
        backgroundColor: SURFACE,
        borderColor: BORDER,
        borderRadius: 14,
        padding: 14,
        flexDirection: 'column',
        gap: 10,
        boxShadow: { offsetX: 0, offsetY: 6, blur: 24, color: 'rgba(0,0,0,0.35)' },
      }, [
        box({ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }, [
          step('HTML', true), arrow(), step('CSS Parser', true), arrow(), step('DOM', true), arrow(), step('Layout', true), arrow(), step('Paint', true),
        ]),
        box({ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }, [
          step('Tree', false), arrow(), step('Yoga WASM', false), arrow(), step('Geometry', false), arrow(), step('Pixels', false),
        ]),
      ]),
    ),
  ])
}

function demoSection(): UIElement {
  const names = [
    { key: 'cards', label: 'Cards' }, { key: 'chat', label: 'Chat' },
    { key: 'dashboard', label: 'Dashboard' }, { key: 'nested', label: 'Nested' },
    { key: 'selection', label: 'Selection' }, { key: 'input', label: 'Input' }, { key: 'seo', label: 'SEO' },
  ]
  const scenarioFn = SCENARIOS[scenario.value] ?? cardGrid

  return section([
    ...heading('Live Demo', 'Interactive \u2014 everything below is rendered to Canvas, not DOM.'),
    // Controls
    box({
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'center',
      backgroundColor: SURFACE,
      borderColor: BORDER,
      borderRadius: 12,
      padding: 12,
    }, [
      text({ text: 'Scenario', font: '600 12px Inter', lineHeight: 18, color: DIM }),
      ...names.map(s => btn(s.label, scenario.value === s.key, () => {
        scenario.set(s.key)
        renderer.selection = null
        if (s.key !== 'input') activeDemoInput.set(null)
      })),
      box({ width: 12, height: 1 }, []),
      text({ text: 'Width', font: '600 12px Inter', lineHeight: 18, color: DIM }),
      btn('\u2212', false, () => rootWidth.set(Math.max(300, rootWidth.peek() - 50))),
      text({ text: `${rootWidth.value}`, font: '600 13px JetBrains Mono', lineHeight: 18, color: ACCENT }),
      btn('+', false, () => rootWidth.set(Math.min(800, rootWidth.peek() + 50))),
      box({ width: 12, height: 1 }, []),
      text({ text: 'Direction', font: '600 12px Inter', lineHeight: 18, color: DIM }),
      btn('Row', direction.value === 'row', () => direction.set('row')),
      btn('Col', direction.value === 'column', () => direction.set('column')),
    ]),
    // Demo area
    box({
      backgroundColor: '#111119',
      borderColor: BORDER,
      borderRadius: 16,
      padding: 24,
      boxShadow: { offsetX: 0, offsetY: 10, blur: 36, color: 'rgba(0,0,0,0.45)' },
      gradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#161622' }, { offset: 1, color: '#101016' }] },
    }, [
      center(box({
        backgroundColor: '#1a1a2e',
        borderRadius: 10,
        boxShadow: { offsetX: 0, offsetY: 2, blur: 12, color: 'rgba(0,0,0,0.3)' },
      }, [scenarioFn()])),
    ]),
    // Perf
    center(
      box({ flexDirection: 'row', gap: 16 }, [
        text({ text: `Layout: ${lastPerfTime}`, font: '12px JetBrains Mono', lineHeight: 16, color: DIM }),
        text({ text: `Nodes: ${lastPerfNodes}`, font: '12px JetBrains Mono', lineHeight: 16, color: DIM }),
      ]),
    ),
    ...(scenario.value === 'seo' ? [seoOutputBlock()] : []),
  ])
}

function seoOutputBlock(): UIElement {
  const tree = seoDemo()
  const html = toSemanticHTML(tree, {
    title: 'Geometra', description: 'DOM-free rendering via Yoga WASM.',
    og: { title: 'Geometra', type: 'website' },
  })
  return box({ flexDirection: 'column', gap: 12 }, [
    text({ text: 'Generated Semantic HTML', font: '600 15px Inter', lineHeight: 20, color: DIM }),
    box({ backgroundColor: CODE_BG, borderColor: BORDER, borderRadius: 10, padding: 20 }, [
      text({ text: html, font: '12px JetBrains Mono', lineHeight: 18, color: MUTED, whiteSpace: 'pre-wrap' }),
    ]),
  ])
}

function archSection(): UIElement {
  const pkgs = [
    { name: '@geometra/core', badge: 'Core', bg: 'rgba(233,69,96,0.15)', bc: ACCENT, desc: 'Signals, box()/text()/image(), hit-testing, text selection, SEO, animations.' },
    { name: '@geometra/renderer-canvas', badge: 'Render', bg: 'rgba(14,165,233,0.15)', bc: ACCENT2, desc: 'Canvas2D paint. Gradients, shadows, text wrapping, HiDPI, clipping.' },
    { name: '@geometra/renderer-terminal', badge: 'Render', bg: 'rgba(14,165,233,0.15)', bc: ACCENT2, desc: 'ANSI terminal renderer. Box-drawing, 256-color, TUI.' },
    { name: '@geometra/server', badge: 'Network', bg: 'rgba(34,197,94,0.15)', bc: ACCENT3, desc: 'Server-side layout. Diffs frames, streams patches over WebSocket.' },
    { name: '@geometra/client', badge: 'Network', bg: 'rgba(34,197,94,0.15)', bc: ACCENT3, desc: 'Thin client (~2KB). Receives geometry, paints. Auto-reconnect.' },
  ]
  return section([
    ...heading('Packages', '5 packages. One protocol. Every render target.'),
    box({ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, pkgs.map(p =>
      box({
        backgroundColor: SURFACE,
        borderColor: BORDER,
        borderRadius: 14,
        padding: 24,
        flexDirection: 'column', gap: 10,
        minWidth: 200, flexGrow: 1, flexBasis: 0,
        boxShadow: { offsetX: 0, offsetY: 6, blur: 20, color: 'rgba(0,0,0,0.28)' },
      }, [
        box({ flexDirection: 'row', gap: 10, alignItems: 'center' }, [
          text({ text: p.name, font: '600 14px Inter', lineHeight: 18, color: TEXT_COLOR }),
          box({ backgroundColor: p.bg, borderRadius: 6, paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3 }, [
            text({ text: p.badge, font: '700 10px Inter', lineHeight: 12, color: p.bc }),
          ]),
        ]),
        text({ text: p.desc, font: '13px Inter', lineHeight: 20, color: MUTED }),
      ]),
    )),
    box({
      backgroundColor: SURFACE,
      borderColor: BORDER,
      borderRadius: 14,
      padding: 20,
      flexDirection: 'column',
      gap: 12,
    }, [
      text({ text: '@geometra/ui primitives (starter)', font: '600 15px Inter', lineHeight: 20, color: TEXT_COLOR }),
      text({ text: 'The demo consumes primitives from @geometra/ui directly.', font: '13px Inter', lineHeight: 20, color: MUTED }),
      uiDialog(
        'Quick Start',
        'Composable starter primitives built on top of core elements.',
        [
          uiButton('View on GitHub', () => window.open('https://github.com/razroo/geometra/tree/main/packages/ui', '_blank')),
        ],
      ),
      uiInput('Search components...', 'Type to filter'),
      uiList(['button()', 'input()', 'list()', 'dialog()']),
    ]),
  ])
}

function codeSection(): UIElement {
  const tabs = ['basic', 'reactive', 'server', 'selection', 'seo']
  const labels: Record<string, string> = { basic: 'Basic', reactive: 'Reactive', server: 'Server', selection: 'Selection', seo: 'SEO' }
  return section([
    ...heading('One protocol, every target', 'The same element tree powers Canvas, Terminal, and AI agents.'),
    // Tabs + code in a single card
    box({
      flexDirection: 'column',
      borderColor: BORDER,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: { offsetX: 0, offsetY: 8, blur: 28, color: 'rgba(0,0,0,0.35)' },
    }, [
      // Tab bar
      box({ flexDirection: 'row', backgroundColor: SURFACE }, tabs.map(t =>
        box({
          backgroundColor: codeTab.value === t ? CODE_BG : SURFACE,
          paddingTop: 12, paddingBottom: 12, paddingLeft: 20, paddingRight: 20,
          cursor: 'pointer',
          onClick: () => codeTab.set(t),
        }, [text({
          text: labels[t]!,
          font: codeTab.value === t ? '600 13px Inter' : '13px Inter',
          lineHeight: 18,
          color: codeTab.value === t ? TEXT_COLOR : DIM,
        })]),
      )),
      // Code
      box({ backgroundColor: CODE_BG, padding: 24 }, [
        text({ text: CODE[codeTab.value] ?? '', font: '13px JetBrains Mono', lineHeight: 20, color: MUTED, whiteSpace: 'pre-wrap' }),
      ]),
    ]),
  ])
}

function footerSection(): UIElement {
  return box({
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 12,
    paddingTop: 48, paddingBottom: 64,
    flexDirection: 'column', gap: 12,
  }, [
    center(
      box({ flexDirection: 'row', gap: 24, alignItems: 'center' }, [
        box({ cursor: 'pointer', onClick: () => window.open('https://github.com/razroo/geometra', '_blank') }, [
          text({ text: 'GitHub', font: '600 14px Inter', lineHeight: 20, color: ACCENT }),
        ]),
        text({ text: '\u00b7', font: '14px Inter', lineHeight: 20, color: BORDER }),
        box({ cursor: 'pointer', onClick: () => window.open('https://www.npmjs.com/org/geometra', '_blank') }, [
          text({ text: 'npm', font: '600 14px Inter', lineHeight: 20, color: ACCENT }),
        ]),
        text({ text: '\u00b7', font: '14px Inter', lineHeight: 20, color: BORDER }),
        box({ cursor: 'pointer', onClick: () => window.open('https://github.com/razroo/textura', '_blank') }, [
          text({ text: 'Textura', font: '600 14px Inter', lineHeight: 20, color: ACCENT }),
        ]),
      ]),
    ),
    center(text({ text: 'Built with Geometra. Zero DOM nodes on this page.', font: '12px Inter', lineHeight: 16, color: DIM })),
  ])
}

// ─── Main View ───────────────────────────────────────────────────────────────
function view(): UIElement {
  const viewportWidth = vw.value
  const contentWidth = Math.min(viewportWidth, 1100)
  const sidePad = Math.max(24, (viewportWidth - contentWidth) / 2)

  return box({ flexDirection: 'column', width: viewportWidth, backgroundColor: BG, paddingLeft: sidePad, paddingRight: sidePad }, [
    heroSection(),
    pipelineSection(),
    demoSection(),
    archSection(),
    codeSection(),
    footerSection(),
  ])
}

// ─── Mount ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('app') as HTMLCanvasElement
const geometraDebug =
  typeof location !== 'undefined' ? new URLSearchParams(location.search).get('geometraDebug') : null

const renderer = new CanvasRenderer({
  canvas,
  background: BG,
  debugLayoutBounds: geometraDebug === 'layout',
})

let app: App | null = null
let cleanupSelection: (() => void) | null = null
let cleanupA11yMirror: (() => void) | null = null
let cleanupInputForwarding: (() => void) | null = null

async function mount() {
  if (cleanupSelection) { cleanupSelection(); cleanupSelection = null }
  if (cleanupA11yMirror) { cleanupA11yMirror(); cleanupA11yMirror = null }
  if (app) app.destroy()

  app = await createApp(view, renderer, { width: vw.peek(), waitForFonts: true })
  if (!cleanupInputForwarding) {
    cleanupInputForwarding = enableInputForwarding(canvas, () => app)
  }

  const tree = view()
  lastPerfNodes = `${countNodes(tree)}`
  lastPerfTime = '<1ms'

  cleanupSelection = enableSelection(canvas, renderer, () => {
    if (app?.layout && app.tree) {
      renderer.render(app.layout, app.tree)
    }
  })
  cleanupA11yMirror = enableAccessibilityMirror(document.body, renderer, {
    rootLabel: 'Geometra canvas accessibility mirror',
  })
  app.update()
}

// ─── Resize ──────────────────────────────────────────────────────────────────
let resizeTimer: ReturnType<typeof setTimeout>
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => { vw.set(window.innerWidth); mount() }, 150)
})

// ─── Init ────────────────────────────────────────────────────────────────────
mount()

import { signal, box, text, createApp, focusNext, syncVirtualWindow } from '@geometra/core'
import type { UIElement } from '@geometra/core'
import { CanvasRenderer } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: '#0b1020' })

const ROW_HEIGHT = 34
const VIEWPORT_ROWS = 12

const items = signal(Array.from({ length: 2000 }, (_, i) => `Row ${i + 1}`))
const selected = signal(0)
/** First visible row index (not CSS pixels); passed to {@link syncVirtualWindow} as `currentStart`. */
const scrollTop = signal(0)
const renderMs = signal(0)
const nodeCount = signal(0)
const hotPaths = signal('-')
let lastRenderMs = 0
let lastNodeCount = 0
let lastHotPaths = '-'

function countNodes(el: UIElement): number {
  if (el.kind === 'text' || el.kind === 'image' || el.kind === 'scene3d') return 1
  return 1 + el.children.reduce((sum, c) => sum + countNodes(c), 0)
}

function clampScroll(index: number): void {
  const next = syncVirtualWindow(items.peek().length, VIEWPORT_ROWS, index, scrollTop.peek())
  scrollTop.set(next.start)
}

function move(delta: number): void {
  const next = Math.max(0, Math.min(items.peek().length - 1, selected.peek() + delta))
  selected.set(next)
  clampScroll(next)
}

function view() {
  const data = items.value
  const start = scrollTop.value
  const end = Math.min(data.length, start + VIEWPORT_ROWS)
  const windowed = data.slice(start, end)

  return box({ flexDirection: 'column', padding: 16, gap: 8, width: 760, height: 490 }, [
    text({ text: 'Virtualized List Primitive', font: 'bold 20px Inter', lineHeight: 28, color: '#f8fafc' }),
    text({
      text: `Total ${data.length} rows | visible ${start + 1}-${end} | selected ${selected.value + 1}`,
      font: '13px JetBrains Mono',
      lineHeight: 18,
      color: '#94a3b8',
    }),
    text({
      text: `render_ms: ${renderMs.value.toFixed(2)} | nodes: ${nodeCount.value} | hot: ${hotPaths.value}`,
      font: '12px JetBrains Mono',
      lineHeight: 16,
      color: '#cbd5e1',
    }),
    text({
      text: 'Use j/k or ArrowUp/ArrowDown. Selection stays stable while the list window virtualizes.',
      font: '13px Inter',
      lineHeight: 18,
      color: '#94a3b8',
    }),
    box({
      flexDirection: 'column',
      borderColor: '#334155',
      borderWidth: 1,
      borderRadius: 8,
      overflow: 'hidden',
      onKeyDown: (e) => {
        if (e.key === 'j' || e.key === 'ArrowDown') move(1)
        if (e.key === 'k' || e.key === 'ArrowUp') move(-1)
      },
      onClick: () => undefined,
    }, windowed.map((label, i) => {
      const actualIndex = start + i
      const active = actualIndex === selected.value
      return box({
        minHeight: ROW_HEIGHT,
        paddingLeft: 12,
        paddingTop: 8,
        backgroundColor: active ? '#1d4ed8' : (i % 2 === 0 ? '#0f172a' : '#111827'),
      }, [
        text({
          text: `${actualIndex + 1}. ${label}`,
          font: '14px Inter',
          lineHeight: 18,
          color: active ? '#ffffff' : '#cbd5e1',
        }),
      ])
    })),
  ])
}

const app = await createApp(view, renderer, { width: 760, height: 490 })
if (app.tree && app.layout) {
  focusNext(app.tree, app.layout)
}

const baseRender = renderer.render.bind(renderer)
renderer.render = (layout, tree) => {
  const t0 = performance.now()
  baseRender(layout, tree)
  lastRenderMs = performance.now() - t0
  lastNodeCount = countNodes(tree)
  const s = selected.peek()
  lastHotPaths = `[2,${Math.max(0, s - scrollTop.peek())}]`
  // Defer signal writes so they run after the current reactive `app.update()` / effect stack unwinds.
  queueMicrotask(() => {
    renderMs.set(lastRenderMs)
    nodeCount.set(lastNodeCount)
    hotPaths.set(lastHotPaths)
  })
}
app.update()

window.addEventListener('keydown', (e) => {
  app.dispatchKey('onKeyDown', {
    key: e.key,
    code: e.code,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    altKey: e.altKey,
  })
})

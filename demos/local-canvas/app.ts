import {
  signal,
  box,
  text,
  createApp,
  createPanRecognizer,
  createPinchRecognizer,
  createSwipeRecognizer,
} from '@geometra/core'
import { CanvasRenderer, attachGestureRecognizers } from '@geometra/renderer-canvas'
import { dataTable, toast } from '@geometra/ui'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({
  canvas,
  background: '#1a1a2e',
  layoutInspector: true,
})

// Reactive state
const count = signal(3)
const direction = signal<'row' | 'column'>('row')

// Gesture-driven state. These feed straight into the view() render without any
// separate reconciler plumbing — core signals do the heavy lifting.
const puckOffsetX = signal(0)
const puckOffsetY = signal(0)
const puckSize = signal(48)
const lastSwipe = signal<'—' | 'left' | 'right' | 'up' | 'down'>('—')

const COLORS = ['#e94560', '#0f3460', '#16213e', '#533483', '#e94560', '#0f3460']

function cardView(index: number) {
  const color = COLORS[index % COLORS.length]!
  return box(
    {
      backgroundColor: color,
      borderRadius: 8,
      padding: 16,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 80,
      minHeight: 60,
      flexDirection: 'column',
      gap: 8,
    },
    [
      text({
        text: `Card ${index + 1}`,
        font: 'bold 16px Inter, system-ui',
        lineHeight: 20,
        color: '#ffffff',
      }),
      text({
        text: 'DOM-free rendering',
        font: '12px Inter, system-ui',
        lineHeight: 16,
        color: 'rgba(255,255,255,0.7)',
      }),
    ],
  )
}

function gesturePlayground() {
  const size = Math.max(16, Math.min(128, puckSize.value))
  return box(
    {
      backgroundColor: '#0b1421',
      borderRadius: 8,
      padding: 12,
      flexDirection: 'column',
      gap: 6,
    },
    [
      box({ flexDirection: 'row', justifyContent: 'space-between' }, [
        text({
          text: 'Gesture playground',
          font: 'bold 12px Inter, system-ui',
          lineHeight: 16,
          color: '#cbd5f5',
        }),
        text({
          text: `swipe: ${lastSwipe.value}`,
          font: '11px ui-monospace, SF Mono, monospace',
          lineHeight: 16,
          color: '#7d8ab1',
        }),
      ]),
      box(
        {
          position: 'relative',
          width: 520,
          height: 110,
          backgroundColor: '#070b16',
          borderRadius: 6,
        },
        [
          box(
            {
              position: 'absolute',
              left: 220 + puckOffsetX.value,
              top: 30 + puckOffsetY.value,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: '#8b5cf6',
            },
            [],
          ),
        ],
      ),
      text({
        text: 'drag to pan · pinch to resize · flick to swipe',
        font: '10px Inter, system-ui',
        lineHeight: 14,
        color: '#4c5773',
      }),
    ],
  )
}

function view() {
  const cards = []
  for (let i = 0; i < count.value; i++) {
    cards.push(cardView(i))
  }

  return box(
    {
      flexDirection: 'column',
      padding: 24,
      gap: 16,
      width: 600,
      height: 540,
    },
    [
      // Header
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
        text({
          text: `Textura Framework`,
          font: 'bold 18px Inter, system-ui',
          lineHeight: 24,
          color: '#ffffff',
        }),
        text({
          text: `${count.value} cards · ${direction.value}`,
          font: '14px Inter, system-ui',
          lineHeight: 20,
          color: '#888888',
        }),
      ]),
      box({ flexDirection: 'column', gap: 8 }, [
        toast('Inspector HUD + hit path (move pointer over canvas)', { variant: 'info' }),
        dataTable(
          [{ key: 'a', header: 'Piece' }, { key: 'b', header: 'Source' }],
          [
            { a: 'layoutInspector', b: 'renderer-canvas' },
            { a: 'dataTable', b: '@geometra/ui' },
            { a: 'attachGestureRecognizers', b: 'renderer-canvas' },
          ],
        ),
      ]),
      gesturePlayground(),
      // Card grid
      box(
        {
          flexDirection: direction.value,
          flexWrap: 'wrap',
          gap: 12,
          flexGrow: 1,
        },
        cards,
      ),
      // Footer
      text({
        text: 'No DOM. No browser layout engine. Pure geometry → Canvas.',
        font: '12px Inter, system-ui',
        lineHeight: 16,
        color: '#555555',
      }),
    ],
  )
}

// Mount
createApp(view, renderer, { width: 600, height: 540 }).then((app) => {
  // Wire up controls
  document.getElementById('btn-add')!.addEventListener('click', () => {
    count.set(count.peek() + 1)
  })

  document.getElementById('btn-toggle')!.addEventListener('click', () => {
    direction.set(direction.peek() === 'row' ? 'column' : 'row')
  })

  const setProbe = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    renderer.inspectorProbe = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  canvas.addEventListener('pointermove', setProbe)
  canvas.addEventListener('pointerleave', () => {
    renderer.inspectorProbe = null
  })

  // Forward canvas clicks to hit-testing
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect()
    app.dispatch('onClick', e.clientX - rect.left, e.clientY - rect.top)
  })

  // Gesture recognizers — wire to the canvas via the adapter. Pan updates
  // puck offset, pinch updates its diameter, swipe flashes the last direction.
  let panStartX = 0
  let panStartY = 0
  const pan = createPanRecognizer({
    minDistance: 4,
    onStart: () => {
      panStartX = puckOffsetX.peek()
      panStartY = puckOffsetY.peek()
    },
    onMove: (e) => {
      puckOffsetX.set(panStartX + e.deltaX)
      puckOffsetY.set(panStartY + e.deltaY)
    },
  })

  let pinchStartSize = 0
  const pinch = createPinchRecognizer({
    onStart: () => {
      pinchStartSize = puckSize.peek()
    },
    onMove: (e) => {
      puckSize.set(pinchStartSize * e.scale)
    },
  })

  const swipe = createSwipeRecognizer({
    minDistance: 40,
    minVelocity: 0.35,
    onSwipe: (e) => {
      lastSwipe.set(e.direction)
    },
  })

  attachGestureRecognizers(canvas, [pan, pinch, swipe])
})

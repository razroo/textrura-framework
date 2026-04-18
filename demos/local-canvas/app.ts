import {
  signal,
  box,
  text,
  createApp,
  animationLoop,
} from '@geometra/core'
import { CanvasRenderer, attachGestureRecognizers } from '@geometra/renderer-canvas'
import {
  dataTable,
  toast,
  button,
  swipeableList,
  animatedDialog,
  animatedSheet,
  animatedToast,
} from '@geometra/ui'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({
  canvas,
  background: '#1a1a2e',
  layoutInspector: true,
})

// Reactive state
const count = signal(3)
const direction = signal<'row' | 'column'>('row')

const COLORS = ['#e94560', '#0f3460', '#16213e', '#533483', '#e94560', '#0f3460']

// --- Swipeable list showcase -------------------------------------------------

const slides = [
  { title: 'Swipeable', body: 'Pan horizontally to page.' },
  { title: 'Keyboard', body: 'Arrow keys, PageUp/Down, Home/End.' },
  { title: 'Velocity', body: 'Fast flick advances one item.' },
  { title: 'Signals', body: 'currentIndex drives pager dots.' },
]

const swipeable = swipeableList({
  items: slides,
  width: 380,
  height: 84,
  flickVelocity: 0.3,
  renderItem: (slide) =>
    box(
      {
        flexDirection: 'column',
        gap: 4,
        padding: 12,
        justifyContent: 'center',
        backgroundColor: '#0f3460',
        borderRadius: 6,
      },
      [
        text({
          text: slide.title,
          font: 'bold 14px Inter, system-ui',
          lineHeight: 18,
          color: '#ffffff',
        }),
        text({
          text: slide.body,
          font: '12px Inter, system-ui',
          lineHeight: 16,
          color: 'rgba(255,255,255,0.7)',
        }),
      ],
    ),
})

function pagerDots(): import('@geometra/core').UIElement {
  const current = swipeable.currentIndex.value
  return box(
    { flexDirection: 'row', gap: 6, justifyContent: 'center' },
    slides.map((_, i) =>
      box(
        {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: i === current ? '#8b5cf6' : 'rgba(255,255,255,0.2)',
        },
        [],
      ),
    ),
  )
}

// --- Animated overlays -------------------------------------------------------

const dlg = animatedDialog({
  title: 'Animated dialog',
  body: 'Keyframe-driven enter/exit. Focus is captured on open and restored when the exit transition completes.',
  durationMs: 180,
  actions: [
    button('Close', () => dlg.close()),
  ],
})

const sheet = animatedSheet({
  content: box({ flexDirection: 'column', gap: 8 }, [
    text({
      text: 'Settings',
      font: 'bold 16px Inter, system-ui',
      lineHeight: 20,
      color: '#ffffff',
    }),
    text({
      text: 'Slides in from the right, fades in, traps nothing.',
      font: '12px Inter, system-ui',
      lineHeight: 16,
      color: 'rgba(255,255,255,0.7)',
    }),
    button('Close', () => sheet.close()),
  ]),
  side: 'right',
  size: 260,
  durationMs: 220,
})

const snackbar = animatedToast({
  message: 'Saved — auto-closes in 3s.',
  variant: 'success',
  autoCloseMs: 3000,
  durationMs: 160,
})

// --- Layout ------------------------------------------------------------------

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

function overlayPanel() {
  return box(
    {
      flexDirection: 'column',
      gap: 8,
      padding: 12,
      backgroundColor: '#0b1421',
      borderRadius: 8,
    },
    [
      text({
        text: 'Overlay transitions',
        font: 'bold 12px Inter, system-ui',
        lineHeight: 16,
        color: '#cbd5f5',
      }),
      box({ flexDirection: 'row', gap: 8 }, [
        button('Open dialog', () => dlg.open()),
        button('Open sheet', () => sheet.open()),
        button('Show toast', () => snackbar.open()),
      ]),
      // Inline overlays — the app-layout would normally position these absolutely.
      // Rendering them inline here keeps the demo self-contained and visible.
      dlg.view(),
      snackbar.view(),
    ],
  )
}

function swipeablePanel() {
  return box(
    {
      flexDirection: 'column',
      gap: 8,
      padding: 12,
      backgroundColor: '#0b1421',
      borderRadius: 8,
    },
    [
      text({
        text: 'Swipeable list',
        font: 'bold 12px Inter, system-ui',
        lineHeight: 16,
        color: '#cbd5f5',
      }),
      swipeable.view(),
      pagerDots(),
      text({
        text: 'drag · arrow keys · PageUp/Down',
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
      height: 640,
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
            { a: 'swipeableList', b: '@geometra/ui' },
            { a: 'animatedDialog', b: '@geometra/ui' },
            { a: 'animatedSheet', b: '@geometra/ui' },
            { a: 'animatedToast', b: '@geometra/ui' },
          ],
        ),
      ]),
      overlayPanel(),
      swipeablePanel(),
      // Card grid (kept from previous demo)
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
      // Sheet renders as a sibling so its absolute positioning is distinct.
      sheet.view(),
    ],
  )
}

// Mount
createApp(view, renderer, { width: 600, height: 640 }).then((app) => {
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

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect()
    app.dispatch('onClick', e.clientX - rect.left, e.clientY - rect.top)
  })

  // Gesture recognizers: route canvas pointer events through the swipeable
  // list's own pan recognizer. (In a real app you'd scope recognizers to
  // specific regions; here the list is the only pan consumer so global
  // attachment is fine.)
  attachGestureRecognizers(canvas, swipeable.recognizers)

  // Drive overlay transition timelines from a single animation loop.
  animationLoop((dt) => {
    const ms = dt * 1000
    dlg.step(ms)
    sheet.step(ms)
    snackbar.step(ms)
    return true
  })
})

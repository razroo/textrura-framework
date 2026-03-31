import { signal, box, text, createApp } from '@geometra/core'
import { CanvasRenderer } from '@geometra/renderer-canvas'
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
      height: 400,
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
          ],
        ),
      ]),
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
createApp(view, renderer, { width: 600, height: 400 }).then((app) => {
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
})

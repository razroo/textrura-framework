import { describe, it, expect } from 'vitest'
import { toLayoutTree } from '../tree.js'
import { ambientLight, box, image, scene3d, sphere, text } from '../elements.js'

type BoxLayoutNode = ReturnType<typeof toLayoutTree> & { children: Array<Record<string, unknown>> }

describe('toLayoutTree', () => {
  it('strips backgroundColor, color, borderColor, borderRadius, borderWidth, opacity from box', () => {
    const el = box({
      width: 100,
      height: 50,
      backgroundColor: '#fff',
      color: '#000',
      borderColor: '#ccc',
      borderRadius: 8,
      borderWidth: 1,
      opacity: 0.5,
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).toHaveProperty('height', 50)
    expect(layout).not.toHaveProperty('backgroundColor')
    expect(layout).not.toHaveProperty('color')
    expect(layout).not.toHaveProperty('borderColor')
    expect(layout).not.toHaveProperty('borderRadius')
    expect(layout).not.toHaveProperty('borderWidth')
    expect(layout).not.toHaveProperty('opacity')
  })

  it('strips selectable from text', () => {
    const el = text({
      text: 'Hello',
      font: '14px sans-serif',
      lineHeight: 18,
      selectable: true,
      width: 100,
      height: 18,
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('selectable')
  })

  it('preserves whiteSpace on text for Yoga/Textura layout', () => {
    const el = text({
      text: 'a\nb',
      font: '14px sans-serif',
      lineHeight: 18,
      whiteSpace: 'pre-wrap',
      width: 100,
      height: 36,
    })
    const layout = toLayoutTree(el)
    expect(layout).toMatchObject({
      text: 'a\nb',
      whiteSpace: 'pre-wrap',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 100,
      height: 36,
    })
  })

  it('strips paint and hit-target style props from text leaves (same strip list as boxes)', () => {
    const el = text({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 40,
      height: 18,
      color: '#333',
      backgroundColor: '#eee',
      borderColor: '#ccc',
      borderRadius: 2,
      borderWidth: 1,
      opacity: 0.9,
      cursor: 'text',
      pointerEvents: 'none',
      zIndex: 3,
      overflow: 'hidden',
      scrollX: 1,
      scrollY: 2,
      boxShadow: { offsetX: 0, offsetY: 1, blur: 2, color: '#000' },
      gradient: { type: 'linear', stops: [{ offset: 0, color: '#fff' }] },
      dir: 'rtl',
    })
    const layout = toLayoutTree(el)
    expect(layout).toMatchObject({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 40,
      height: 18,
    })
    for (const k of [
      'color',
      'backgroundColor',
      'borderColor',
      'borderRadius',
      'borderWidth',
      'opacity',
      'cursor',
      'pointerEvents',
      'zIndex',
      'overflow',
      'scrollX',
      'scrollY',
      'boxShadow',
      'gradient',
      'dir',
      'selectable',
    ] as const) {
      expect(layout).not.toHaveProperty(k)
    }
  })

  it('strips selectable from box, image, and scene3d when the key appears on props (e.g. corrupt serialization)', () => {
    const b = box({ width: 10, height: 10, selectable: true } as unknown as Parameters<typeof box>[0])
    expect(toLayoutTree(b)).not.toHaveProperty('selectable')

    const img = image({
      src: 'x.png',
      width: 8,
      height: 8,
      selectable: false,
    } as unknown as Parameters<typeof image>[0])
    expect(toLayoutTree(img)).not.toHaveProperty('selectable')

    const sc = scene3d({
      width: 16,
      height: 16,
      objects: [sphere({ radius: 1 })],
      selectable: true,
    } as unknown as Parameters<typeof scene3d>[0])
    expect(toLayoutTree(sc)).not.toHaveProperty('selectable')
  })

  it('preserves flexDirection, padding, gap', () => {
    const el = box({
      width: 200,
      height: 200,
      flexDirection: 'row',
      padding: 10,
      gap: 8,
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('flexDirection', 'row')
    expect(layout).toHaveProperty('padding', 10)
    expect(layout).toHaveProperty('gap', 8)
  })

  it('preserves display for Textura/Yoga (layout visibility, not paint-only metadata)', () => {
    const none = box({ width: 100, height: 50, display: 'none' })
    expect(toLayoutTree(none)).toMatchObject({ width: 100, height: 50, display: 'none' })

    const flex = box({ width: 40, height: 40, display: 'flex' })
    expect(toLayoutTree(flex)).toMatchObject({ width: 40, height: 40, display: 'flex' })
  })

  it('strips src, alt, objectFit from image', () => {
    const el = image({
      src: 'https://example.com/img.png',
      alt: 'An image',
      objectFit: 'cover',
      width: 100,
      height: 100,
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('src')
    expect(layout).not.toHaveProperty('alt')
    expect(layout).not.toHaveProperty('objectFit')
  })

  it('strips paint and hit-target style props from image leaves (same strip list as text)', () => {
    const el = image({
      src: 'https://example.com/x.png',
      alt: 'x',
      width: 40,
      height: 40,
      objectFit: 'contain',
      color: '#333',
      backgroundColor: '#eee',
      borderColor: '#ccc',
      borderRadius: 2,
      borderWidth: 1,
      opacity: 0.9,
      cursor: 'text',
      pointerEvents: 'none',
      zIndex: 3,
      overflow: 'hidden',
      scrollX: 1,
      scrollY: 2,
      boxShadow: { offsetX: 0, offsetY: 1, blur: 2, color: '#000' },
      gradient: { type: 'linear', stops: [{ offset: 0, color: '#fff' }] },
      dir: 'rtl',
    })
    const layout = toLayoutTree(el)
    expect(layout).toMatchObject({ width: 40, height: 40 })
    for (const k of [
      'src',
      'alt',
      'objectFit',
      'color',
      'backgroundColor',
      'borderColor',
      'borderRadius',
      'borderWidth',
      'opacity',
      'cursor',
      'pointerEvents',
      'zIndex',
      'overflow',
      'scrollX',
      'scrollY',
      'boxShadow',
      'gradient',
      'dir',
      'selectable',
    ] as const) {
      expect(layout).not.toHaveProperty(k)
    }
  })

  it('recurses children', () => {
    const el = box({ width: 200, height: 200 }, [
      box({ width: 100, height: 100, backgroundColor: '#f00' }),
      text({ text: 'Hi', font: '14px sans-serif', lineHeight: 18, width: 50, height: 18 }),
    ])
    const layout = toLayoutTree(el) as BoxLayoutNode
    expect(layout.children).toHaveLength(2)
    expect(layout.children[0]).not.toHaveProperty('backgroundColor')
    expect(layout.children[0]).toHaveProperty('width', 100)
  })

  it('strips cursor, pointerEvents, zIndex, overflow, scrollX, scrollY, boxShadow, gradient', () => {
    const el = box({
      width: 100,
      height: 100,
      cursor: 'pointer',
      pointerEvents: 'none',
      zIndex: 5,
      overflow: 'hidden',
      scrollX: 10,
      scrollY: 20,
      boxShadow: { offsetX: 0, offsetY: 2, blur: 4, color: 'rgba(0,0,0,0.2)' },
      gradient: { type: 'linear', stops: [{ offset: 0, color: 'red' }, { offset: 1, color: 'blue' }] },
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('cursor')
    expect(layout).not.toHaveProperty('pointerEvents')
    expect(layout).not.toHaveProperty('zIndex')
    expect(layout).not.toHaveProperty('overflow')
    expect(layout).not.toHaveProperty('scrollX')
    expect(layout).not.toHaveProperty('scrollY')
    expect(layout).not.toHaveProperty('boxShadow')
    expect(layout).not.toHaveProperty('gradient')
  })

  it('strips dir from layout props', () => {
    const el = box({
      width: 100,
      height: 100,
      dir: 'rtl',
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('dir')
  })

  it('omits dir on root text, image, and scene3d layout snapshots', () => {
    const t = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 10,
      height: 18,
      dir: 'rtl',
    })
    expect(toLayoutTree(t)).not.toHaveProperty('dir')

    const img = image({ src: '/a.png', width: 8, height: 8, dir: 'ltr' })
    expect(toLayoutTree(img)).not.toHaveProperty('dir')

    const s3 = scene3d({
      width: 80,
      height: 80,
      dir: 'rtl',
      objects: [sphere({ radius: 1 })],
    })
    expect(toLayoutTree(s3)).not.toHaveProperty('dir')
  })

  it('forwards dir on nested text, image, and scene3d for Textura', () => {
    const t = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 10,
      height: 18,
      dir: 'rtl',
    })
    const img = image({ src: '/a.png', width: 8, height: 8, dir: 'ltr' })
    const s3 = scene3d({
      width: 80,
      height: 80,
      dir: 'rtl',
      objects: [sphere({ radius: 1 })],
    })
    const root = box({ width: 200, height: 200 }, [t, img, s3])
    const layout = toLayoutTree(root) as BoxLayoutNode
    expect(layout).not.toHaveProperty('dir')
    expect(layout.children[0]).toHaveProperty('dir', 'rtl')
    expect(layout.children[1]).toHaveProperty('dir', 'ltr')
    expect(layout.children[2]).toHaveProperty('dir', 'rtl')
  })

  it('forwards dir on nested box children for Textura (only the layout root omits dir)', () => {
    const inner = box({ width: 50, height: 50, dir: 'rtl' })
    const root = box({ width: 100, height: 100, dir: 'ltr' }, [inner])
    const layout = toLayoutTree(root) as BoxLayoutNode
    expect(layout).not.toHaveProperty('dir')
    const childLayout = layout.children[0] as Record<string, unknown>
    expect(childLayout).toMatchObject({ width: 50, height: 50, dir: 'rtl' })
  })

  it('forwards unknown dir strings on nested boxes verbatim (Textura treats non-ltr/rtl as Inherit)', () => {
    const inner = box({ width: 50, height: 50, dir: 'sideways-lr' as never })
    const root = box({ width: 100, height: 100 }, [inner])
    const layout = toLayoutTree(root) as BoxLayoutNode
    expect(layout.children[0]).toMatchObject({ width: 50, height: 50, dir: 'sideways-lr' })
  })

  it('forwards JSON null dir on nested boxes for Textura (malformed deserialization; core resolves like auto)', () => {
    const inner = box({ width: 50, height: 50, dir: null as never })
    const root = box({ width: 100, height: 100 }, [inner])
    const layout = toLayoutTree(root) as BoxLayoutNode
    expect(layout).not.toHaveProperty('dir')
    expect(layout.children[0]).toMatchObject({ width: 50, height: 50, dir: null })
  })

  it('omits root dir:auto and forwards dir:auto on descendants for Yoga inherit semantics', () => {
    const inner = box({ width: 50, height: 50, dir: 'auto' })
    const root = box({ width: 100, height: 100, dir: 'auto' }, [inner])
    const layout = toLayoutTree(root) as BoxLayoutNode
    expect(layout).not.toHaveProperty('dir')
    expect(layout.children[0]).toMatchObject({ width: 50, height: 50, dir: 'auto' })

    const t = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 10,
      height: 18,
      dir: 'auto',
    })
    const wrapped = box({ width: 200, height: 200 }, [t])
    const wrapLayout = toLayoutTree(wrapped) as BoxLayoutNode
    expect(wrapLayout).not.toHaveProperty('dir')
    expect(wrapLayout.children[0]).toHaveProperty('dir', 'auto')
  })

  it('does not mutate live element.props when building the layout snapshot', () => {
    const root = box(
      {
        width: 200,
        height: 200,
        backgroundColor: '#111',
        dir: 'rtl',
      },
      [
        text({
          text: 'Hi',
          font: '14px sans-serif',
          lineHeight: 18,
          width: 20,
          height: 18,
          color: '#eee',
          dir: 'ltr',
        }),
      ],
    )
    const rootPropsBefore = { ...root.props }
    const childPropsBefore = { ...(root.children[0]!.props as Record<string, unknown>) }

    toLayoutTree(root)

    expect(root.props).toEqual(rootPropsBefore)
    expect(root.children[0]!.props as Record<string, unknown>).toEqual(childPropsBefore)
    expect(root.props).toHaveProperty('backgroundColor', '#111')
    expect(root.props).toHaveProperty('dir', 'rtl')
    expect(root.children[0]!.props).toMatchObject({ color: '#eee', dir: 'ltr' })
  })

  it('omits runtime box metadata (handlers, key, semantic) from the layout snapshot', () => {
    const child = text({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 20,
      height: 18,
      key: 'leaf',
      semantic: { role: 'button' },
    })
    const el = box(
      {
        width: 100,
        height: 50,
        onClick: () => {},
        key: 'root',
        semantic: { role: 'main' },
      },
      [child],
    )
    expect(el.handlers).toBeDefined()

    const layout = toLayoutTree(el) as BoxLayoutNode
    expect(layout).not.toHaveProperty('handlers')
    expect(layout).not.toHaveProperty('key')
    expect(layout).not.toHaveProperty('semantic')
    const textLayout = layout.children[0] as Record<string, unknown>
    expect(textLayout).toMatchObject({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 20,
      height: 18,
    })
    expect(textLayout).not.toHaveProperty('key')
    expect(textLayout).not.toHaveProperty('semantic')
  })

  it('forwards props not in the strip list to the layout snapshot (strip-list, not a whitelist)', () => {
    const hinted = box({
      width: 10,
      height: 10,
      _experimentalLayoutHint: 42,
    } as unknown as Parameters<typeof box>[0])
    const layout = toLayoutTree(hinted) as Record<string, unknown>
    expect(layout).toMatchObject({ width: 10, height: 10, _experimentalLayoutHint: 42 })

    const textHinted = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 8,
      height: 18,
      _customMetricKey: 'ok',
    } as unknown as Parameters<typeof text>[0])
    const tLayout = toLayoutTree(textHinted) as Record<string, unknown>
    expect(tLayout).toMatchObject({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 8,
      height: 18,
      _customMetricKey: 'ok',
    })
  })

  it('strips scene3d scene/camera props and paint metadata from scene3d leaves', () => {
    const el = scene3d({
      width: 320,
      height: 200,
      padding: 4,
      background: 0x222222,
      objects: [sphere({ radius: 1 }), ambientLight()],
      fov: 40,
      near: 0.1,
      far: 1000,
      cameraPosition: [0, 1, 4],
      cameraTarget: [0, 0, 0],
      orbitControls: { minDistance: 1 },
      maxPixelRatio: 1.5,
      backgroundColor: '#000',
      cursor: 'grab',
      dir: 'ltr',
    })
    const layout = toLayoutTree(el) as Record<string, unknown>
    expect(layout).toMatchObject({ width: 320, height: 200, padding: 4 })
    expect(layout).not.toHaveProperty('background')
    expect(layout).not.toHaveProperty('objects')
    expect(layout).not.toHaveProperty('fov')
    expect(layout).not.toHaveProperty('near')
    expect(layout).not.toHaveProperty('far')
    expect(layout).not.toHaveProperty('cameraPosition')
    expect(layout).not.toHaveProperty('cameraTarget')
    expect(layout).not.toHaveProperty('orbitControls')
    expect(layout).not.toHaveProperty('maxPixelRatio')
    expect(layout).not.toHaveProperty('backgroundColor')
    expect(layout).not.toHaveProperty('cursor')
    expect(layout).not.toHaveProperty('dir')
  })
})
